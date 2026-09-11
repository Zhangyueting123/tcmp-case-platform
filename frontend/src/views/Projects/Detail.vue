<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack" style="margin-right:8px">返回</el-button>
      {{ project?.name }} <el-tag size="small">{{ project?.projectKey }}</el-tag>
    </div>
    <el-tabs v-model="tab">
      <el-tab-pane v-if="(project?.level || 1) < 3" label="子级项目" name="children">
        <div class="toolbar">
          <el-button type="primary" @click="showCreateChild = true">
            新建{{ (project?.level || 1) === 1 ? '子项目' : '模块功能测试项目' }}
          </el-button>
          <span style="color: #909399">共 {{ children.length }} 个</span>
          <div style="flex: 1" />
          <el-radio-group v-model="childViewMode" size="small">
            <el-radio-button label="card">卡片</el-radio-button>
            <el-radio-button label="list">列表</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="childViewMode === 'card'" class="child-card-grid">
          <el-card
            v-for="c in children"
            :key="c.id"
            class="child-card"
            shadow="hover"
            @click="$router.push(`/projects/${c.id}`)"
          >
            <div class="child-card-head">
              <span class="child-name">{{ c.name }}</span>
              <el-tag size="small" effect="plain">{{ levelName(c.level) }}</el-tag>
            </div>
            <div class="child-desc">{{ c.description || '暂无描述' }}</div>
            <div class="child-card-actions" @click.stop>
              <el-button link type="primary" size="small" @click="$router.push(`/projects/${c.id}`)">进入</el-button>
              <el-button v-if="!c.isBuiltin" link type="danger" size="small" @click="onRemoveChild(c)">删除</el-button>
            </div>
          </el-card>
        </div>

        <el-table v-else :data="children" border>
          <el-table-column prop="name" label="名称" min-width="220" />
          <el-table-column label="层级" width="180"><template #default="{ row }">{{ levelName(row.level) }}</template></el-table-column>
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button link type="primary" @click="$router.push(`/projects/${row.id}`)">进入</el-button>
              <el-button v-if="!row.isBuiltin" link type="danger" @click="onRemoveChild(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!children.length" description="暂无子级，点上方按钮新建" />
      </el-tab-pane>

      <el-tab-pane v-if="(project?.level || 1) === 3" label="用例池" name="cases">
        <div class="toolbar">
          <el-button type="primary" @click="showAdd = true">从用例集添加</el-button>
          <el-button type="danger" plain :disabled="!cases.length" @click="onClearAll">全部删除</el-button>
          <span style="color: #909399">共 {{ cases.length }} 条</span>
        </div>
        <el-table :data="cases" border>
          <el-table-column label="编号" width="120"><template #default="{ row }">{{ row.case?.code }}</template></el-table-column>
          <el-table-column label="标题"><template #default="{ row }">{{ row.case?.title }}</template></el-table-column>
          <el-table-column label="等级" width="80"><template #default="{ row }">{{ row.case?.priority }}</template></el-table-column>
          <el-table-column label="版本" width="80" prop="pinnedVersion" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeCase(row.caseId)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane v-if="(project?.level || 1) === 3" label="测试轮次" name="rounds">
        <div class="toolbar"><el-button type="primary" @click="showCreate = true">新建轮次</el-button></div>
        <el-table :data="rounds" border>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column label="轮次名" min-width="160">
            <template #default="{ row }">
              <el-input
                v-if="renamingRoundId === row.id"
                :ref="(el: any) => setRenameInput(el)"
                v-model="renameDraft"
                size="small"
                maxlength="64"
                @blur="commitRename(row)"
                @keyup.enter="commitRename(row)"
                @keyup.esc="cancelRename"
                @click.stop
              />
              <span
                v-else
                class="round-name"
                title="双击重命名"
                @dblclick.stop="startRename(row)"
              >{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="softwareVersion" label="被测版本" width="140" />
          <el-table-column prop="status" label="状态" width="120">
            <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="280">
            <template #default="{ row }">
              <el-button link type="primary" @click="$router.push(`/projects/${id}/rounds/${row.id}`)">详情</el-button>
              <el-button link type="primary" @click="$router.push(`/projects/${id}/rounds/${row.id}/execute`)">执行</el-button>
              <el-button link type="primary" @click="$router.push(`/projects/${id}/rounds/${row.id}/report`)">报告</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane v-if="(project?.level || 1) === 1" label="成员" name="members">
        <div class="toolbar"><el-button type="primary" @click="showAddMember = true">添加成员</el-button></div>
        <el-table :data="members" border>
          <el-table-column prop="userId" label="用户 ID" width="100" />
          <el-table-column label="姓名"><template #default="{ row }">{{ userMap[row.userId]?.name }}</template></el-table-column>
          <el-table-column label="邮箱"><template #default="{ row }">{{ userMap[row.userId]?.email }}</template></el-table-column>
          <el-table-column prop="roleCode" label="角色" width="140" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="danger" @click="removeMember(row.id)">移除</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="缺陷看板" name="defects">
        <DefectsPanel :project-id="id" />
      </el-tab-pane>

      <el-tab-pane label="设置" name="settings">
        <el-form :model="settings" label-width="160px" style="max-width: 640px">
          <el-form-item label="项目名"><el-input v-model="settings.name" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="settings.description" type="textarea" /></el-form-item>
          <el-form-item label="Teambition URL"><el-input v-model="settings.tbBugSectionUrl" /></el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveSettings">保存</el-button>
            <el-button :loading="testingTb" @click="testTb">测试 Teambition 连通</el-button>
          </el-form-item>
          <el-alert v-if="tbResult" :type="tbResult.ok ? 'success' : 'error'" :closable="false" style="margin-top: 8px">
            <div style="font-weight:600">
              模式 {{ tbResult.mode }} ｜ {{ tbResult.ok ? '连通成功' : '连通失败' }}
            </div>
            <div v-if="tbResult.ok">
              项目 ID: {{ tbResult.tbProjectId }} ｜ 成员数: {{ tbResult.memberCount }}
              <div v-if="tbResult.sampleMembers?.length" style="margin-top:4px;color:#606266">
                示例：{{ tbResult.sampleMembers.map((m: any) => m.name).join('、') }}
              </div>
            </div>
            <div v-else style="color:#f56c6c">{{ tbResult.error }}</div>
          </el-alert>

          <el-divider />
          <h4 style="margin: 0 0 8px">我的 Teambition 授权状态（个人）</h4>
          <el-alert v-if="tbAuthState" :type="tbAuthState.authorized ? 'success' : 'warning'" :closable="false" style="margin-bottom: 8px">
            <div v-if="tbAuthState.authorized">
              已授权为 <b>{{ tbAuthState.tbUserName || '(未取到昵称)' }}</b>
              <span v-if="tbAuthState.tbUserId" style="color:#909399"> ({{ tbAuthState.tbUserId }})</span>
              <span v-if="tbAuthState.expiresAt" style="color:#909399;margin-left:8px">
                过期: {{ new Date(tbAuthState.expiresAt).toLocaleString() }}
              </span>
            </div>
            <div v-else>尚未授权 Teambition；首次提交缺陷时会自动弹出授权窗</div>
          </el-alert>
          <el-form-item>
            <el-button @click="startTbAuth">扫码授权 / 重新授权</el-button>
            <el-button v-if="tbAuthState?.authorized" type="danger" plain @click="revokeTb">解除授权</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <RoundCreateDialog v-if="showCreate" v-model="showCreate" :project-id="id" @created="onRoundCreated" />

    <el-dialog v-model="showCreateChild" :title="`新建${(project?.level || 1) === 1 ? '子项目' : '模块功能测试项目'}`" width="480px">
      <el-form :model="childForm" label-width="120px">
        <el-form-item label="名称"><el-input v-model="childForm.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="childForm.description" type="textarea" /></el-form-item>
        <el-form-item label="版本迭代"><el-input v-model="childForm.versionIteration" placeholder="如 3.0.1 或 迭代S1（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateChild = false">取消</el-button>
        <el-button type="primary" @click="onCreateChild">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAdd" title="从用例集添加用例" width="1080px" top="6vh">
      <el-form inline>
        <el-form-item label="用例集">
          <el-select v-model="addCaseSetId" filterable @change="loadAddCases" style="width: 280px">
            <el-option v-for="cs in caseSets" :key="cs.id" :value="cs.id" :label="cs.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="addCaseSetId" style="display: flex; gap: 12px; height: 480px">
        <div style="width: 260px; border: 1px solid #ebeef5; border-radius: 4px; padding: 8px; overflow: auto">
          <div style="font-size: 12px; color: #909399; margin-bottom: 6px">模块（子功能层级）</div>
          <el-tree
            :data="moduleTreeForFilter"
            node-key="id"
            :expand-on-click-node="false"
            highlight-current
            :current-node-key="selectedModuleId ?? undefined"
            @node-click="onModuleClick"
          >
            <template #default="{ data }">
              <span style="font-size: 13px">{{ data.name }}</span>
              <span style="font-size: 11px; color: #c0c4cc; margin-left: 4px">L{{ data.level }}</span>
            </template>
          </el-tree>
          <el-button v-if="selectedModuleId" link type="primary" size="small" @click="onModuleClick(null)" style="margin-top: 6px">清除模块筛选</el-button>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; min-width: 0">
          <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap">
            <span style="font-size: 12px; color: #606266">子模块</span>
            <el-select v-model="filterSubModuleIds" multiple collapse-tags collapse-tags-tooltip placeholder="全部" style="width: 240px" clearable filterable>
              <el-option v-for="m in subModuleOptions" :key="m.id" :value="m.id" :label="m.label" />
            </el-select>
            <span style="font-size: 12px; color: #606266">等级</span>
            <el-select v-model="filterPriorities" multiple collapse-tags collapse-tags-tooltip placeholder="全部" style="width: 200px" clearable>
              <el-option v-for="p in ['P0','P1','P2','P3']" :key="p" :value="p" :label="p" />
            </el-select>
            <span style="font-size: 12px; color: #606266">标签</span>
            <el-select v-model="filterTags" multiple collapse-tags collapse-tags-tooltip placeholder="全部" style="width: 240px" clearable filterable>
              <el-option v-for="t in allTagOptions" :key="t" :value="t" :label="t" />
            </el-select>
            <span style="color: #909399; font-size: 12px">匹配 {{ filteredAddCases.length }} / {{ addCases.length }}</span>
          </div>
          <el-table :data="filteredAddCases" border height="100%" @selection-change="onSelChange">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="code" label="编号" width="130" />
            <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
            <el-table-column prop="priority" label="等级" width="70" />
            <el-table-column label="标签" min-width="160">
              <template #default="{ row }">
                <el-tag v-for="t in (row.tags || [])" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button v-if="addCaseSetId" type="success" plain :disabled="!addCases.length" @click="onAddAll">导入全部 ({{ addCases.length }})</el-button>
        <el-button type="primary" :disabled="!selectedIds.length" @click="onAddCases">加入 ({{ selectedIds.length }})</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddMember" title="添加成员" width="420px">
      <el-form :model="memberForm" label-width="80px">
        <el-form-item label="用户">
          <el-select v-model="memberForm.userId" filterable placeholder="选择用户">
            <el-option v-for="u in allUsers" :key="u.id" :value="u.id" :label="`${u.name} (${u.email})`" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="memberForm.roleCode">
            <el-option v-for="r in ['PM','TestLead','Tester','CaseLibOwner','Viewer']" :key="r" :value="r" :label="r" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddMember = false">取消</el-button>
        <el-button type="primary" @click="onAddMember">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { caseSetApi, projectApi, roundApi, tbAuthApi, userApi } from '@/api';
import RoundCreateDialog from '../Rounds/RoundCreateDialog.vue';
import DefectsPanel from '../Defects/Panel.vue';

type SubModuleOption = { id: number; label: string };

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
function goBack() {
  // 返回上一层级：有父项目则回到父项目详情，否则回项目列表
  const pid = project.value?.parentId;
  if (pid) router.push(`/projects/${pid}`);
  else router.push('/projects');
}
const tab = ref('cases');
const project = ref<any>(null);
const rounds = ref<any[]>([]);
const renamingRoundId = ref<number | null>(null);
const renameDraft = ref('');
let renameInputEl: any = null;
function setRenameInput(el: any) {
  renameInputEl = el;
}
const cases = ref<any[]>([]);
const members = ref<any[]>([]);
const children = ref<any[]>([]);
const childViewMode = ref<'card' | 'list'>('card');
const showCreate = ref(false);
const showCreateChild = ref(false);
const childForm = reactive({ name: '', description: '', versionIteration: '' });
const showAdd = ref(false);
const showAddMember = ref(false);
const caseSets = ref<any[]>([]);
const addCaseSetId = ref<number>();
const addCases = ref<any[]>([]);
const addModules = ref<any[]>([]);
const selectedModuleId = ref(null as number | null);
const filterSubModuleIds = ref<number[]>([]);
const filterPriorities = ref<string[]>([]);
const filterTags = ref<string[]>([]);
const selectedIds = ref<number[]>([]);
const allUsers = ref<any[]>([]);
const userMap = reactive<Record<number, any>>({});
const memberForm = reactive({ userId: undefined as any, roleCode: 'Tester' });
const settings = reactive({ name: '', description: '', tbBugSectionUrl: '' });
const tbResult = ref<any>(null);
const testingTb = ref(false);
async function testTb() {
  testingTb.value = true;
  try {
    tbResult.value = await projectApi.testTb(id.value) as any;
  } catch (e: any) {
    tbResult.value = { ok: false, mode: '?', error: e?.message || String(e) };
  } finally {
    testingTb.value = false;
  }
}

// === 个人 TB 授权状态（B 方案） ===
const tbAuthState = ref<any>(null);
async function loadTbAuth() {
  try {
    tbAuthState.value = await tbAuthApi.status() as any;
  } catch {
    tbAuthState.value = { authorized: false };
  }
}
async function startTbAuth() {
  let res: any;
  try {
    res = await tbAuthApi.start() as any;
  } catch (e: any) {
    ElMessage.error(e?.message || '生成授权链接失败');
    return;
  }
  const popup = window.open(res.url, 'tb-oauth', 'width=560,height=720');
  if (!popup) {
    ElMessage.error('无法打开授权窗口，请允许浏览器弹窗');
    return;
  }
  const onMsg = async (evt: MessageEvent) => {
    const m = evt.data;
    if (!m || m.type !== 'tb-oauth') return;
    window.removeEventListener('message', onMsg);
    if (m.payload?.ok) {
      ElMessage.success(`Teambition 授权成功：${m.payload.tbUserName || ''}`);
      await loadTbAuth();
    } else {
      ElMessage.error(m.payload?.error || 'Teambition 授权失败');
    }
  };
  window.addEventListener('message', onMsg);
}
async function revokeTb() {
  await tbAuthApi.revoke();
  ElMessage.success('已解除授权');
  await loadTbAuth();
}

function statusType(s: string) {
  return { DRAFT: 'info', IN_PROGRESS: 'success', PAUSED: 'warning', CLOSED: '' }[s] as any;
}

function startRename(row: any) {
  renamingRoundId.value = row.id;
  renameDraft.value = row.name;
  nextTick(() => {
    renameInputEl?.focus?.();
    renameInputEl?.select?.();
  });
}
function cancelRename() {
  renamingRoundId.value = null;
  renameDraft.value = '';
}
async function commitRename(row: any) {
  if (renamingRoundId.value !== row.id) return;
  const name = renameDraft.value.trim();
  renamingRoundId.value = null;
  if (!name) {
    ElMessage.warning('轮次名不能为空');
    return;
  }
  if (name === row.name) return;
  try {
    await roundApi.update(row.id, { name });
    row.name = name;
    ElMessage.success('轮次名已更新');
  } catch (e: any) {
    ElMessage.error(e?.message || '重命名失败');
  }
}

// 仅显示前三级（模块 / 子模块 / 子功能），隐藏第 4 级"测试项"
const moduleTreeForFilter = computed(() => pruneToLevel(addModules.value, 3));
function pruneToLevel(nodes: any[], maxLevel: number): any[] {
  return (nodes || [])
    .filter((n) => n.level <= maxLevel)
    .map((n) => ({ ...n, children: pruneToLevel(n.children || [], maxLevel) }));
}

function findNode(nodes: any[], targetId: number): any | null {
  for (const n of nodes) {
    if (n.id === targetId) return n;
    const sub = findNode(n.children || [], targetId);
    if (sub) return sub;
  }
  return null;
}
function flattenIds(node: any): number[] {
  const out: number[] = [node.id];
  for (const c of node.children || []) out.push(...flattenIds(c));
  return out;
}

const allowedModuleIds = computed(() => {
  if (!selectedModuleId.value) return null as Set<number> | null;
  const node = findNode(addModules.value, selectedModuleId.value);
  return node ? new Set<number>(flattenIds(node)) : new Set<number>();
});

// 子模块下拉选项（level=2）：受左侧树筛选影响（若选了 level=1 模块，仅显示其下子模块）
const subModuleOptions = computed(() => {
  const list: SubModuleOption[] = [];
  function walk(nodes: any[], parentName?: string) {
    for (const n of nodes) {
      if (n.level === 2) {
        list.push({ id: n.id, label: parentName ? `${parentName} / ${n.name}` : n.name });
      }
      if (n.children?.length) walk(n.children, n.level === 1 ? n.name : parentName);
    }
  }
  if (selectedModuleId.value) {
    const node = findNode(addModules.value, selectedModuleId.value);
    if (node) {
      if (node.level === 1) walk(node.children || [], node.name);
      else if (node.level === 2) list.push({ id: node.id, label: node.name });
    }
  } else {
    walk(addModules.value);
  }
  return list;
});

// 子模块筛选 → 转为允许的 moduleId 集合（包含其下所有后代）
const allowedSubModuleIds = computed(() => {
  if (!filterSubModuleIds.value.length) return null as Set<number> | null;
  const s = new Set<number>();
  for (const sid of filterSubModuleIds.value) {
    const node = findNode(addModules.value, sid);
    if (node) flattenIds(node).forEach((id) => s.add(id));
  }
  return s;
});

const allTagOptions = computed(() => {
  const s = new Set<string>();
  for (const c of addCases.value) (c.tags || []).forEach((t: string) => t && s.add(t));
  return Array.from(s).sort();
});

const filteredAddCases = computed(() => {
  return addCases.value.filter((c) => {
    if (allowedModuleIds.value && !allowedModuleIds.value.has(c.moduleId)) return false;
    if (allowedSubModuleIds.value && !allowedSubModuleIds.value.has(c.moduleId)) return false;
    if (filterPriorities.value.length && !filterPriorities.value.includes(c.priority)) return false;
    if (filterTags.value.length) {
      const ct: string[] = c.tags || [];
      if (!filterTags.value.some((t) => ct.includes(t))) return false;
    }
    return true;
  });
});

function onModuleClick(node: any) {
  selectedModuleId.value = node ? node.id : null;
  filterSubModuleIds.value = [];
}

async function load() {
  project.value = await projectApi.detail(id.value);
  Object.assign(settings, {
    name: project.value.name,
    description: project.value.description,
    tbBugSectionUrl: project.value.tbBugSectionUrl,
  });
  rounds.value = (await roundApi.list(id.value)) as any;
  cases.value = (await projectApi.cases(id.value)) as any;
  members.value = (await projectApi.members(id.value)) as any;
  allUsers.value = (await userApi.list()) as any;
  allUsers.value.forEach((u: any) => (userMap[u.id] = u));
  caseSets.value = (await caseSetApi.list()) as any;
  await loadChildren();
}
function levelName(l: number) {
  return l === 3 ? '模块功能测试项目' : l === 2 ? '子项目' : '项目';
}
async function loadChildren() {
  try {
    const flat = (await projectApi.list()) as any[];
    children.value = flat.filter((p) => p.parentId === id.value);
  } catch { children.value = []; }
}
async function onCreateChild() {
  if (!childForm.name.trim()) return ElMessage.warning('请填写名称');
  try {
    await projectApi.create({ ...childForm, parentId: id.value });
    ElMessage.success('创建成功');
    showCreateChild.value = false;
    Object.assign(childForm, { name: '', description: '', versionIteration: '' });
    await loadChildren();
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  }
}
async function onRemoveChild(c: any) {
  const typeLabel = levelName(c.level);
  const extra =
    c.level === 2
      ? '若其下仍有模块功能测试项目，需先删除下级项目。'
      : '若其下仍有测试轮次，需先删除或关闭全部轮次；用例池引用将一并清除。';
  try {
    await ElMessageBox.confirm(
      `确认删除${typeLabel}「${c.name}」？此操作不可恢复。${extra}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await projectApi.remove(c.id);
    ElMessage.success('已删除');
    await loadChildren();
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  }
}
async function loadAddCases() {
  if (!addCaseSetId.value) return;
  selectedModuleId.value = null;
  filterSubModuleIds.value = [];
  filterPriorities.value = [];
  filterTags.value = [];
  addCases.value = (await caseSetApi.cases(addCaseSetId.value)) as any;
  addModules.value = (await caseSetApi.modules(addCaseSetId.value)) as any;
}
function onSelChange(rows: any[]) {
  selectedIds.value = rows.map((r) => r.id);
}
async function onAddCases() {
  const res: any = await projectApi.addCases(id.value, selectedIds.value);
  const added = res?.added ?? selectedIds.value.length;
  const skipped = res?.skipped ?? 0;
  ElMessage.success(skipped > 0 ? `已加入 ${added} 条，跳过 ${skipped} 条重复` : '已加入');
  showAdd.value = false;
  await load();
}
async function onAddAll() {
  if (!addCases.value.length) return;
  const ids = addCases.value.map((c: any) => c.id);
  const res: any = await projectApi.addCases(id.value, ids);
  const added = res?.added ?? ids.length;
  const skipped = res?.skipped ?? 0;
  ElMessage.success(skipped > 0 ? `已导入 ${added} 条，跳过 ${skipped} 条重复` : `已导入全部 ${added} 条用例`);
  showAdd.value = false;
  await load();
}
async function removeCase(cid: number) {
  await projectApi.removeCase(id.value, cid);
  await load();
}
async function onClearAll() {
  if (!cases.value.length) return;
  try {
    await ElMessageBox.confirm(`确认从项目用例池移除全部 ${cases.value.length} 条用例？此操作不可撤销。`, '全部删除', { type: 'warning' });
  } catch {
    return;
  }
  const ids = cases.value.map((r: any) => r.caseId);
  for (const cid of ids) {
    await projectApi.removeCase(id.value, cid);
  }
  ElMessage.success(`已删除 ${ids.length} 条`);
  await load();
}
async function onAddMember() {
  await projectApi.addMember(id.value, { userId: memberForm.userId, roleCode: memberForm.roleCode });
  showAddMember.value = false;
  await load();
}
async function removeMember(mid: number) {
  await projectApi.removeMember(mid);
  await load();
}
async function saveSettings() {
  await projectApi.update(id.value, settings);
  ElMessage.success('已保存');
  await load();
}
function onRoundCreated(r: any) {
  showCreate.value = false;
  load();
  if (r?.id) {
    router.push(`/projects/${id.value}/rounds/${r.id}`);
  }
}
async function init() {
  await load();
  // 根据层级选择默认 Tab：模块功能测试项目(3)默认用例池，其余默认子级项目
  const level = project.value?.level || 1;
  if (route.query.tab === 'board') {
    tab.value = 'defects';
  } else {
    tab.value = level === 3 ? 'cases' : 'children';
  }
  await loadTbAuth();
}
onMounted(init);
// 同一 Detail 组件内从父项目跳到子项目（仅 :id 变化）不会重挂载，需监听重新加载
watch(() => route.params.id, () => { init(); });
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.child-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.child-card {
  border-radius: 8px;
  cursor: pointer;
}
.child-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.child-name {
  font-weight: 600;
  font-size: 15px;
}
.child-desc {
  color: #606266;
  font-size: 13px;
  margin-top: 10px;
  min-height: 38px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.child-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
  margin-top: 10px;
}
.round-name {
  cursor: text;
  display: inline-block;
  min-width: 40px;
  padding: 2px 4px;
  border-radius: 4px;
}
.round-name:hover {
  background: #f5f7fa;
}
</style>
