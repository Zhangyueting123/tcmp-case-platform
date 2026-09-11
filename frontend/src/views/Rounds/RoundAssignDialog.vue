<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="分配用例"
    width="1200px"
    top="5vh"
    :close-on-click-modal="false"
  >
    <div class="shuttle">
      <!-- 左：待分配用例 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">待分配用例</span>
          <span class="meta">{{ selectedCaseIds.length }} / {{ unassignedCases.length }}</span>
        </div>
        <div class="toolbar">
          <el-input v-model="caseQuery" placeholder="请输入搜索内容" clearable size="small" style="flex:1" />
          <el-button size="small" link @click="caseSelectAll">全选</el-button>
          <el-button
            size="small"
            type="danger"
            link
            :icon="Delete"
            :disabled="!selectedCaseIds.length"
            :loading="excluding"
            @click="onExcludeSelected"
          >删除选中</el-button>
          <el-button
            v-if="excludedCount > 0"
            size="small"
            link
            type="warning"
            :icon="RefreshLeft"
            @click="onRestoreAll"
          >恢复 ({{ excludedCount }})</el-button>
        </div>
        <div class="tree-wrapper">
          <el-tree
            ref="caseTreeRef"
            :data="caseTree"
            node-key="key"
            show-checkbox
            :props="{ label: 'label', children: 'children' }"
            :filter-node-method="filterCaseNode"
            :default-expanded-keys="defaultExpandedCaseKeys"
            @check="onCaseCheck"
          >
            <template #default="{ data }">
              <span :style="{ color: data.isLeaf ? '#303133' : '#606266', fontWeight: data.isLeaf ? 'normal' : 500 }">
                <span v-if="data.isLeaf" style="color:#909399;font-size:12px;margin-right:6px">{{ data.code }}</span>
                {{ data.label }}
                <el-tag v-if="data.isLeaf && data.priority" size="small" style="margin-left:6px">{{ data.priority }}</el-tag>
                <span v-if="!data.isLeaf" style="color:#c0c4cc;font-size:12px;margin-left:6px">({{ data.leafCount }})</span>
              </span>
            </template>
          </el-tree>
          <div v-if="!unassignedCases.length && !loading" class="empty">
            <template v-if="!allCases.length">（先在"用例筛选"配置匹配规则）</template>
            <template v-else>暂无数据</template>
          </div>
        </div>
      </div>

      <!-- 中：操作按钮 -->
      <div class="actions">
        <el-tooltip content="将左侧勾选的用例分配给右侧勾选的成员" placement="top">
          <el-button
            class="arrow-btn"
            circle
            :icon="ArrowRight"
            :disabled="!selectedCaseIds.length || !selectedUserIds.length"
            :loading="assigning"
            @click="onAssign"
          />
        </el-tooltip>
        <el-tooltip content="退回右侧勾选的用例（仅未执行可退）" placement="top">
          <el-button
            class="arrow-btn"
            circle
            :icon="ArrowLeft"
            :disabled="!selectedInstanceIds.length"
            :loading="unassigning"
            @click="onUnassign"
          />
        </el-tooltip>
      </div>

      <!-- 右：分配人（含已分配用例） -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">分配人</span>
          <span class="meta">人 {{ selectedUserIds.length }} · 用例 {{ selectedInstanceIds.length }}</span>
        </div>
        <el-input v-model="userQuery" placeholder="请输入搜索内容" clearable size="small" />
        <div class="tree-wrapper">
          <el-tree
            ref="userTreeRef"
            :data="userTree"
            node-key="key"
            show-checkbox
            :props="{ label: 'label', children: 'children' }"
            :filter-node-method="filterUserNode"
            :default-expanded-keys="defaultExpandedUserKeys"
            @check="onUserCheck"
          >
            <template #default="{ data }">
              <span v-if="data.kind === 'role'" style="color:#606266;font-weight:500">
                {{ data.label }}
                <span style="color:#c0c4cc;font-size:12px;margin-left:6px">({{ data.children?.length || 0 }})</span>
              </span>
              <span v-else-if="data.kind === 'user'">
                <el-icon style="vertical-align:-2px;margin-right:4px"><User /></el-icon>
                {{ data.label }}
                <span style="color:#909399;font-size:12px;margin-left:6px">{{ data.email }}</span>
                <el-tag v-if="data.assignedCount" type="info" size="small" style="margin-left:6px">{{ data.assignedCount }}</el-tag>
              </span>
              <span v-else-if="data.kind === 'set' || data.kind === 'module'" :style="{ color:'#606266', fontWeight: 500 }">
                {{ data.label }}
                <span style="color:#c0c4cc;font-size:12px;margin-left:6px">({{ data.leafCount }})</span>
              </span>
              <span v-else>
                <span style="color:#909399;font-size:12px;margin-right:6px">{{ data.code }}</span>
                {{ data.label }}
                <el-tag v-if="data.result !== 'PENDING'" size="small" :type="resultTag(data.result)" style="margin-left:6px">{{ data.result }}</el-tag>
              </span>
            </template>
          </el-tree>
          <div v-if="!members.length && !loadingMembers" class="empty">
            （此项目暂无成员，请先到项目「成员」标签页添加）
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Delete, RefreshLeft, User } from '@element-plus/icons-vue';
import { projectApi, roundApi, userApi } from '@/api';

const props = defineProps<{ modelValue: boolean; roundId: number; projectId: number }>();
const emit = defineEmits(['update:modelValue', 'assigned']);

const caseTreeRef = ref<any>(null);
const userTreeRef = ref<any>(null);

const allCases = ref<any[]>([]);
const members = ref<any[]>([]);
const userMap = ref<Record<number, any>>({});
const assignments = ref<any[]>([]);
const selectedCaseIds = ref<number[]>([]);
const selectedUserIds = ref<number[]>([]);
const selectedInstanceIds = ref<number[]>([]);
const caseQuery = ref('');
const userQuery = ref('');
const loading = ref(false);
const loadingMembers = ref(false);
const assigning = ref(false);
const unassigning = ref(false);
const excluding = ref(false);
const excludedCount = ref(0);

watch(() => props.modelValue, (v) => { if (v) initAll(); });
onMounted(() => { if (props.modelValue) initAll(); });

async function initAll() {
  selectedCaseIds.value = [];
  selectedUserIds.value = [];
  selectedInstanceIds.value = [];
  caseQuery.value = '';
  userQuery.value = '';
  await Promise.all([loadAll(), loadMembers()]);
}

async function loadAll() {
  loading.value = true;
  try {
    const [p, a, r] = await Promise.all([
      roundApi.preview(props.roundId) as any,
      roundApi.assigned(props.roundId) as any,
      roundApi.detail(props.roundId) as any,
    ]);
    allCases.value = p.cases || [];
    assignments.value = a || [];
    excludedCount.value = (r?.excludedCaseIds || []).length;
  } finally {
    loading.value = false;
  }
}

async function loadMembers() {
  loadingMembers.value = true;
  try {
    const [ms, us] = await Promise.all([
      projectApi.members(props.projectId) as any,
      userApi.list() as any,
    ]);
    userMap.value = Object.fromEntries((us || []).map((u: any) => [u.id, u]));
    members.value = (ms || []).filter((m: any) => userMap.value[m.userId]);
  } finally {
    loadingMembers.value = false;
  }
}

const assignedCaseIdSet = computed(() => new Set(assignments.value.map(a => a.caseId)));
const unassignedCases = computed(() => allCases.value.filter(c => !assignedCaseIdSet.value.has(c.id)));

// 左侧：用例集 → 模块链 → 用例
const caseTree = computed(() => {
  const bySet = new Map<number, any>();
  for (const c of unassignedCases.value) {
    const setKey = `set-${c.caseSetId}`;
    if (!bySet.has(c.caseSetId)) {
      bySet.set(c.caseSetId, {
        key: setKey, label: c.caseSetName || `用例集#${c.caseSetId}`,
        isLeaf: false, leafCount: 0, children: [], _moduleMap: new Map<string, any>(),
      });
    }
    const setNode = bySet.get(c.caseSetId);
    setNode.leafCount++;
    let parent = setNode;
    let chainKey = setKey;
    for (const m of (c.modulePath || [])) {
      chainKey += `-m${m.id}`;
      let mod = parent._moduleMap.get(chainKey);
      if (!mod) {
        mod = { key: chainKey, label: m.name, isLeaf: false, leafCount: 0, children: [], _moduleMap: new Map<string, any>() };
        parent._moduleMap.set(chainKey, mod);
        parent.children.push(mod);
      }
      mod.leafCount++;
      parent = mod;
    }
    parent.children.push({
      key: `case-${c.id}`, caseId: c.id, label: c.title, code: c.code, priority: c.priority, isLeaf: true,
    });
  }
  return Array.from(bySet.values());
});

const defaultExpandedCaseKeys = computed(() => caseTree.value.map(n => n.key));

// 右侧：角色 → 用户 → 用例集 → 模块链 → 用例（已分配）
const userTree = computed(() => {
  const caseMap = new Map(allCases.value.map(c => [c.id, c]));
  const asgnByUser = new Map<number, any[]>();
  for (const a of assignments.value) {
    if (!asgnByUser.has(a.assigneeUserId)) asgnByUser.set(a.assigneeUserId, []);
    asgnByUser.get(a.assigneeUserId)!.push(a);
  }
  const byRole = new Map<string, any>();
  for (const m of members.value) {
    const u = userMap.value[m.userId];
    if (!u) continue;
    const role = m.roleCode || 'Other';
    if (!byRole.has(role)) byRole.set(role, { key: `role-${role}`, kind: 'role', label: role, children: [] });
    const rn = byRole.get(role);
    if (rn.children.some((c: any) => c.userId === u.id)) continue;
    const my = asgnByUser.get(u.id) || [];

    // 构建该用户下的用例集/模块树
    const userKeyPrefix = `user-${role}-${u.id}`;
    const bySet = new Map<number, any>();
    for (const a of my) {
      const c = caseMap.get(a.caseId);
      const setId = c?.caseSetId ?? -1;
      const setKey = `${userKeyPrefix}-set-${setId}`;
      if (!bySet.has(setId)) {
        bySet.set(setId, {
          key: setKey,
          kind: 'set',
          label: c?.caseSetName || (setId === -1 ? '(已不在筛选结果)' : `用例集#${setId}`),
          children: [],
          _moduleMap: new Map<string, any>(),
          leafCount: 0,
        });
      }
      const setNode = bySet.get(setId);
      setNode.leafCount++;
      let parent = setNode;
      let chainKey = setKey;
      for (const md of (c?.modulePath || [])) {
        chainKey += `-m${md.id}`;
        let mod = parent._moduleMap.get(chainKey);
        if (!mod) {
          mod = { key: chainKey, kind: 'module', label: md.name, children: [], _moduleMap: new Map<string, any>(), leafCount: 0 };
          parent._moduleMap.set(chainKey, mod);
          parent.children.push(mod);
        }
        mod.leafCount++;
        parent = mod;
      }
      parent.children.push({
        key: `inst-${a.id}`,
        kind: 'instance',
        instanceId: a.id,
        userId: u.id,
        caseId: a.caseId,
        result: a.result,
        disabled: a.result !== 'PENDING', // 已执行禁选 → 不可退还
        code: c?.code || `用例#${a.caseId}`,
        label: c?.title || '(已不在筛选结果)',
      });
    }

    rn.children.push({
      key: userKeyPrefix,
      kind: 'user',
      userId: u.id,
      label: u.name,
      email: u.email,
      assignedCount: my.length,
      children: Array.from(bySet.values()),
    });
  }
  return Array.from(byRole.values());
});

const defaultExpandedUserKeys = computed(() => {
  // 默认显示到“角色 → 用户 → 用例集 → sheet页(第一层模块)”层级，但 sheet 页本身保持收起。
  const keys: string[] = [];
  for (const r of userTree.value) {
    keys.push(r.key);
    for (const u of r.children || []) {
      if ((u.children || []).length) {
        keys.push(u.key);
        for (const set of u.children || []) {
          keys.push(set.key);
        }
      }
    }
  }
  return keys;
});

function onCaseCheck() {
  const ids = new Set<number>();
  const nodes = caseTreeRef.value?.getCheckedNodes(true) || [];
  for (const n of nodes) if (n.isLeaf && n.caseId) ids.add(n.caseId);
  selectedCaseIds.value = Array.from(ids);
}

function caseSelectAll() {
  const keys = unassignedCases.value.map(c => `case-${c.id}`);
  caseTreeRef.value?.setCheckedKeys(keys);
  selectedCaseIds.value = unassignedCases.value.map(c => c.id);
}

async function onExcludeSelected() {
  if (!selectedCaseIds.value.length) return;
  try {
    await ElMessageBox.confirm(
      `确认从本轮筛选结果中删除选中的 ${selectedCaseIds.value.length} 条用例？`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  excluding.value = true;
  try {
    await roundApi.excludeCases(props.roundId, [...selectedCaseIds.value]);
    selectedCaseIds.value = [];
    caseTreeRef.value?.setCheckedKeys([]);
    await loadAll();
    ElMessage.success('已删除。在「用例筛选」保存新条件可恢复全部被删除项。');
  } finally {
    excluding.value = false;
  }
}

async function onRestoreAll() {
  try {
    await ElMessageBox.confirm(
      `恢复本轮被删除的 ${excludedCount.value} 条用例？`,
      '恢复确认',
      { type: 'info' },
    );
  } catch {
    return;
  }
  await roundApi.restoreCases(props.roundId);
  await loadAll();
  ElMessage.success('已恢复');
}

function onUserCheck() {
  const users = new Set<number>();
  const instances = new Set<number>();
  // 用 leafOnly=false 拿到所有被勾选的节点（含父节点级联勾选下来的实例）
  const nodes = userTreeRef.value?.getCheckedNodes(false) || [];
  for (const n of nodes) {
    if (n.kind === 'user' && n.userId) users.add(n.userId);
    else if (n.kind === 'instance' && n.instanceId && !n.disabled) instances.add(n.instanceId);
  }
  selectedUserIds.value = Array.from(users);
  selectedInstanceIds.value = Array.from(instances);
}

function filterCaseNode(value: string, data: any) {
  if (!value) return true;
  const v = value.toLowerCase();
  if (data.isLeaf) {
    return (data.label || '').toLowerCase().includes(v) || (data.code || '').toLowerCase().includes(v);
  }
  return false;
}
watch(caseQuery, (v) => caseTreeRef.value?.filter(v));

function filterUserNode(value: string, data: any) {
  if (!value) return true;
  const v = value.toLowerCase();
  if (data.kind === 'user') {
    return (data.label || '').toLowerCase().includes(v) || (data.email || '').toLowerCase().includes(v);
  }
  if (data.kind === 'instance') {
    return (data.label || '').toLowerCase().includes(v) || (data.code || '').toLowerCase().includes(v);
  }
  return false;
}
watch(userQuery, (v) => userTreeRef.value?.filter(v));

function resultTag(r: string) {
  return ({ PENDING: 'info', P: 'success', F: 'danger', BLOCK: 'warning', NP: '', NT: '' } as any)[r] || '';
}

async function onAssign() {
  assigning.value = true;
  try {
    const res: any = await roundApi.assign(props.roundId, {
      caseIds: selectedCaseIds.value,
      userIds: selectedUserIds.value,
    });
    ElMessage.success(`已分配 ${res.created ?? 0} 条`);
    caseTreeRef.value?.setCheckedKeys([]);
    selectedCaseIds.value = [];
    await loadAll();
    emit('assigned');
  } finally {
    assigning.value = false;
  }
}

async function onUnassign() {
  if (!selectedInstanceIds.value.length) return;
  await ElMessageBox.confirm(`确认退回选中的 ${selectedInstanceIds.value.length} 条用例？`, '提示', { type: 'warning' });
  unassigning.value = true;
  try {
    const res: any = await roundApi.unassign(props.roundId, { instanceIds: selectedInstanceIds.value });
    if (res.blocked) ElMessage.warning(`已退回 ${res.removed} 条，${res.blocked} 条已执行不可退`);
    else ElMessage.success(`已退回 ${res.removed} 条`);
    userTreeRef.value?.setCheckedKeys([]);
    selectedUserIds.value = [];
    selectedInstanceIds.value = [];
    await loadAll();
    emit('assigned');
  } finally {
    unassigning.value = false;
  }
}
</script>

<style scoped>
.shuttle {
  display: flex;
  align-items: stretch;
  gap: 12px;
}
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px;
  background: #fafafa;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.panel-title { font-weight: 600; font-size: 14px; color: #303133; }
.meta { color: #909399; font-size: 12px; }
.tree-wrapper {
  flex: 1;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 6px;
  height: 540px;
  overflow: auto;
  margin-top: 6px;
}
.empty {
  color: #c0c4cc;
  font-size: 12px;
  text-align: center;
  padding: 16px 6px;
}
.actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 0 4px;
}
.arrow-btn {
  width: 36px;
  height: 36px;
  font-size: 16px;
}
</style>
