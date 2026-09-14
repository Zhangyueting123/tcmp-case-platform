<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      {{ caseSet?.name }} <el-tag size="small">{{ caseSet?.code }}</el-tag>
    </div>
    <div class="toolbar">
      <el-button type="primary" plain @click="showBulk = true">批量新增</el-button>
      <el-upload :show-file-list="false" :http-request="onImport" accept=".xlsx,.xls">
        <el-button>导入 Excel</el-button>
      </el-upload>
      <el-upload :show-file-list="false" :http-request="onImportXmind" accept=".xmind">
        <el-button>导入 XMind</el-button>
      </el-upload>
      <el-button @click="onExport">导出 Excel</el-button>
      <el-button type="success" plain :disabled="!filteredCases.length" @click="openImportToProject">导入到项目用例池</el-button>
      <el-button type="danger" plain :disabled="!filteredCases.length" @click="onDeleteAll">全部删除</el-button>
      <el-button v-if="isOwner" type="warning" plain @click="showStartReview = true">发起评审</el-button>
      <el-button plain @click="openReviews">评审记录</el-button>
      <div class="spacer" />
      <el-input v-model="q" placeholder="搜索标题/编号" clearable style="width: 220px" @change="load" />
    </div>

    <el-row :gutter="12">
      <el-col :span="6">
        <div class="content-card content-card--scroll">
          <el-tree
            :data="displayModules"
            :props="{ label: 'name', children: 'children' }"
            highlight-current
            node-key="id"
            draggable
            :allow-drop="allowDrop"
            :allow-drag="allowDrag"
            @node-drop="onNodeDrop"
            @node-click="onNode"
          >
            <template #default="{ node, data }">
              <span class="tree-node">
                <el-input
                  v-if="renamingModuleId === data.id"
                  :ref="(el: any) => setRenameInput(el)"
                  v-model="renameDraft"
                  size="small"
                  maxlength="64"
                  class="tree-rename-input"
                  @blur="commitRename(data)"
                  @keyup.enter="commitRename(data)"
                  @keyup.esc="cancelRename"
                  @click.stop
                />
                <span
                  v-else
                  class="tree-label"
                  :class="{ 'tree-label--rename': canRenameModule(data) }"
                  :title="canRenameModule(data) ? '双击重命名；拖动可调整位置' : undefined"
                  @dblclick.stop="canRenameModule(data) && startRename(data)"
                >{{ node.label }}</span>
                <el-icon class="tree-action" title="在该节点下新增用例" @click.stop="openCreateUnder(data)">
                  <Plus />
                </el-icon>
                <el-icon class="tree-action" title="管理该节点下的用例" @click.stop="openSubtree(data)">
                  <Edit />
                </el-icon>
              </span>
            </template>
          </el-tree>
          <el-button v-if="moduleId" link type="primary" size="small" style="margin-top: 6px" @click="onNode(null)">清除模块筛选</el-button>
        </div>
      </el-col>
      <el-col :span="18">
        <div v-if="moduleId" class="filter-bar">
          <el-tag size="small" type="info">当前节点：{{ selectedModulePath.join(' / ') }}</el-tag>
          <el-tag size="small">{{ filteredCases.length }} 条</el-tag>
          <el-button link type="primary" size="small" @click="onNode(null)">清除筛选</el-button>
        </div>
        <div class="data-table cases-table-wrap">
        <el-table :data="pagedCases" stripe height="calc(70vh - 52px)">
          <el-table-column label="子模块" width="130">
            <template #default="{ row }"><div class="cell-wrap">{{ pathAt(row, 1) }}</div></template>
          </el-table-column>
          <el-table-column label="子功能" width="130">
            <template #default="{ row }"><div class="cell-wrap">{{ pathAt(row, 2) }}</div></template>
          </el-table-column>
          <el-table-column label="测试项" width="130">
            <template #default="{ row }"><div class="cell-wrap">{{ pathAt(row, 3) }}</div></template>
          </el-table-column>
          <el-table-column label="用例名称" min-width="180">
            <template #default="{ row }"><div class="cell-wrap">{{ row.title }}</div></template>
          </el-table-column>
          <el-table-column prop="priority" label="等级" width="70" />
          <el-table-column label="前置条件" min-width="160">
            <template #default="{ row }"><div class="cell-wrap">{{ row.precondition }}</div></template>
          </el-table-column>
          <el-table-column label="测试步骤" min-width="240">
            <template #default="{ row }"><pre class="cell-wrap">{{ row.steps }}</pre></template>
          </el-table-column>
          <el-table-column label="测试数据" min-width="160">
            <template #default="{ row }"><div class="cell-wrap">{{ row.testData }}</div></template>
          </el-table-column>
          <el-table-column label="预期结果" min-width="220">
            <template #default="{ row }"><pre class="cell-wrap">{{ row.expectedResult }}</pre></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click.stop="onDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="filteredCases.length > pageSize"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredCases.length"
          :page-sizes="[50, 100, 200, 500]"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          class="cases-pagination"
        />
        </div>
      </el-col>
    </el-row>

    <el-drawer v-model="showEdit" :title="editing?.id ? '编辑用例' : '新增用例'" size="600px">
      <CaseForm v-if="showEdit" v-model="editing" :modules="modules" @saved="onSaved" />
    </el-drawer>

    <BulkCreateDialog
      v-model="showBulk"
      :case-set-id="id"
      :default-module-path="selectedModulePath"
      @saved="onBulkSaved"
    />

    <SubtreeEditDialog
      v-model="showSubtree"
      :case-set-id="id"
      :node-name="subtreeNode?.name || ''"
      :node-path="subtreeNodePathArr"
      :initial-cases="subtreeCases"
      :modules="modules"
      @saved="onSubtreeSaved"
    />

    <StartReviewDialog v-model="showStartReview" :case-set-id="id" :modules="modules" @saved="onReviewStarted" />

    <el-dialog v-model="showReviews" title="评审记录" width="720px">
      <div class="data-table">
      <el-table :data="reviews" stripe v-loading="reviewsLoading">
        <el-table-column label="标题" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="goReview(row.id)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="reviewStatusType(row.status)">{{ reviewStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发起人" width="120" prop="initiatorName" />
        <el-table-column label="用例数" width="80" prop="caseCount" align="center" />
        <el-table-column label="评论数" width="80" prop="commentCount" align="center" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goReview(row.id)">进入</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无评审记录</template>
      </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="showImport" title="导入到项目用例池" width="560px" @closed="resetImport">
      <!-- 导入完成态 -->
      <template v-if="importedProjectId">
        <el-result icon="success" :title="`已导入 ${importedCount} 条`" :sub-title="importedProjectName" />
      </template>

      <!-- 选择/新建目标项目 -->
      <template v-else>
        <el-form label-width="110px">
          <template v-if="!createMode">
            <el-form-item label="目标项目">
              <div style="display: flex; gap: 8px; width: 100%">
                <el-select
                  v-model="importProjectId"
                  filterable
                  placeholder="选择模块功能测试项目"
                  style="flex: 1"
                >
                  <el-option
                    v-for="p in importProjectOptions"
                    :key="p.id"
                    :value="p.id"
                    :label="p.label"
                  />
                </el-select>
                <el-button :icon="Plus" @click="enterCreateMode">新建</el-button>
              </div>
            </el-form-item>
          </template>

          <!-- 就地新建 模块功能测试项目 -->
          <template v-else>
            <el-form-item label="上级子项目">
              <el-select v-model="newParentId" filterable placeholder="选择子项目（作为上级）" style="width: 100%">
                <el-option
                  v-for="p in parentProjectOptions"
                  :key="p.id"
                  :value="p.id"
                  :label="p.label"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="项目名称">
              <el-input v-model="newProjectName" placeholder="新模块功能测试项目名称" />
            </el-form-item>
            <el-alert
              v-if="!parentProjectOptions.length"
              type="warning"
              :closable="false"
              title="暂无可用的「子项目」作为上级，请先到项目页创建 项目 → 子项目 层级"
            />
          </template>

          <el-form-item label="导入数量">
            <span>{{ filteredCases.length }} 条{{ moduleId ? '（当前模块筛选）' : '（全部）' }}</span>
          </el-form-item>
        </el-form>
        <el-alert
          v-if="!createMode && !importProjectOptions.length"
          type="warning"
          :closable="false"
          title="暂无可用的「模块功能测试项目」，可点上方「新建」就地创建"
        />
      </template>

      <template #footer>
        <template v-if="importedProjectId">
          <el-button @click="showImport = false">关闭</el-button>
          <el-button type="primary" @click="goImportedProject">前往项目详情</el-button>
        </template>
        <template v-else-if="createMode">
          <el-button @click="createMode = false">返回选择</el-button>
          <el-button
            type="primary"
            :loading="creating"
            :disabled="!newParentId || !newProjectName.trim()"
            @click="onCreateTargetProject"
          >创建并选择</el-button>
        </template>
        <template v-else>
          <el-button @click="showImport = false">取消</el-button>
          <el-button type="primary" :loading="importing" :disabled="!importProjectId" @click="onImportToProject">导入</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Edit, Plus } from '@element-plus/icons-vue';
import { caseSetApi, projectApi, reviewApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import CaseForm from './CaseForm.vue';
import BulkCreateDialog from './BulkCreateDialog.vue';
import SubtreeEditDialog from './SubtreeEditDialog.vue';
import StartReviewDialog from '../CaseReviews/StartReviewDialog.vue';
import { useModuleTreeDrag } from '@/composables/useModuleTreeDrag';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
function goBack() { router.push('/case-sets'); }
const caseSet = ref<any>(null);
const auth = useAuthStore();
const isOwner = computed(() => !!caseSet.value && caseSet.value.ownerUserId === auth.user?.id);
const modules = ref<any[]>([]);
const cases = ref<any[]>([]);
const moduleId = ref<number | undefined>();
const q = ref('');
const showEdit = ref(false);
const showBulk = ref(false);
const editing = ref<any>(null);

// ===== 节点子树管理 =====
const showSubtree = ref(false);
const subtreeNode = ref<any>(null);
const subtreeCases = computed<any[]>(() => {
  if (!subtreeNode.value) return [];
  const set = new Set<number>(flattenIds(subtreeNode.value));
  // 给每条 case 预计算完整路径，避免子组件再做 findPath
  return cases.value
    .filter((c: any) => set.has(c.moduleId))
    .map((c: any) => ({ ...c, modulePathArr: modulePathMap.value.get(c.moduleId) || [] }));
});
const subtreeNodePathArr = computed<string[]>(() => {
  if (!subtreeNode.value) return [];
  return findPath(modules.value, subtreeNode.value.id) || [];
});
function openSubtree(node: any) {
  subtreeNode.value = node;
  showSubtree.value = true;
}
function openCreateUnder(node: any) {
  const path = findPath(modules.value, node.id) || [];
  editing.value = { caseSetId: id, modulePath: path, priority: 'P2', steps: '', expectedResult: '' };
  showEdit.value = true;
}

// ===== 模块树：双击重命名（子模块 / 子功能 / 测试项） =====
const renamingModuleId = ref<number | null>(null);
const renameDraft = ref('');
let renameInputEl: any = null;
function setRenameInput(el: any) {
  renameInputEl = el;
}
function canRenameModule(data: any) {
  return data.level >= 2 && data.level <= 4;
}
function startRename(data: any) {
  renamingModuleId.value = data.id;
  renameDraft.value = data.name;
  nextTick(() => {
    renameInputEl?.focus?.();
    renameInputEl?.select?.();
  });
}
function cancelRename() {
  renamingModuleId.value = null;
  renameDraft.value = '';
}
async function commitRename(data: any) {
  if (renamingModuleId.value !== data.id) return;
  const name = renameDraft.value.trim();
  renamingModuleId.value = null;
  if (!name) {
    ElMessage.warning('名称不能为空');
    return;
  }
  if (name === data.name) return;
  try {
    await caseSetApi.updateModule(data.id, { name });
    ElMessage.success('名称已更新');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '重命名失败');
  }
}

async function onSubtreeSaved() {
  await load();
}

// ===== 用例评审 =====
const showStartReview = ref(false);
const showReviews = ref(false);
const reviews = ref<any[]>([]);
const reviewsLoading = ref(false);
function reviewStatusText(s: string) {
  return s === 'IN_REVIEW' ? '评审中' : s === 'REVISING' ? '修订中' : '已关闭';
}
function reviewStatusType(s: string) {
  return s === 'IN_REVIEW' ? 'warning' : s === 'REVISING' ? 'primary' : 'info';
}
async function openReviews() {
  showReviews.value = true;
  reviewsLoading.value = true;
  try {
    reviews.value = ((await reviewApi.listByCaseSet(id)) as any) || [];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    reviewsLoading.value = false;
  }
}
function goReview(reviewId: number) {
  router.push(`/reviews/${reviewId}`);
}
function onReviewStarted(reviewId: number) {
  if (reviewId) router.push(`/reviews/${reviewId}`);
}

async function load() {
  caseSet.value = await caseSetApi.detail(id);
  modules.value = (await caseSetApi.modules(id)) as any;
  cases.value = (await caseSetApi.cases(id, { q: q.value })) as any;
  if (moduleId.value && !findNode(displayModules.value, moduleId.value)) {
    moduleId.value = undefined;
  }
}
const { allowDrag, allowDrop, onNodeDrop } = useModuleTreeDrag(load, () => id);

// ===== 导入到项目用例池 =====
const showImport = ref(false);
const importing = ref(false);
const importProjectId = ref<number>();
const allProjects = ref<any[]>([]);
const importProjectOptions = computed(() =>
  allProjects.value
    .filter((p: any) => (p.level || 1) === 3)
    .map((p: any) => ({ id: p.id, label: projectPath(p) })),
);
const createMode = ref(false);
const creating = ref(false);
const newParentId = ref<number>();
const newProjectName = ref('');
const importedProjectId = ref<number>();
const importedProjectName = ref('');
const importedCount = ref(0);
const parentProjectOptions = computed(() =>
  allProjects.value
    .filter((p: any) => (p.level || 1) === 2)
    .map((p: any) => ({ id: p.id, label: projectPath(p) })),
);
function projectPath(p: any) {
  // 用 parentId 逐级向上拼出「项目 / 子项目 / 模块功能测试项目」路径
  const byId = new Map(allProjects.value.map((x: any) => [x.id, x]));
  const names: string[] = [];
  let cur: any = p;
  const guard = new Set<number>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return names.join(' / ');
}
async function openImportToProject() {
  try {
    allProjects.value = (await projectApi.list()) as any;
  } catch {
    allProjects.value = [];
  }
  resetImport();
  importProjectId.value = undefined;
  showImport.value = true;
}
function enterCreateMode() {
  createMode.value = true;
  newProjectName.value = '';
  newParentId.value = undefined;
}
async function onCreateTargetProject() {
  if (!newParentId.value || !newProjectName.value.trim()) return;
  creating.value = true;
  try {
    const created: any = await projectApi.create({ name: newProjectName.value.trim(), parentId: newParentId.value });
    allProjects.value = (await projectApi.list()) as any;
    importProjectId.value = created.id;
    createMode.value = false;
    ElMessage.success('模块功能测试项目已创建并选中');
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
async function onImportToProject() {
  if (!importProjectId.value) return;
  const caseIds = filteredCases.value.map((c: any) => c.id);
  if (!caseIds.length) return ElMessage.warning('没有可导入的用例');
  importing.value = true;
  try {
    const res: any = await projectApi.addCases(importProjectId.value, caseIds);
    const added = res?.added ?? caseIds.length;
    const skipped = res?.skipped ?? 0;
    const proj = allProjects.value.find((p: any) => p.id === importProjectId.value);
    importedProjectName.value = proj ? projectPath(proj) : '';
    importedCount.value = added;
    importedProjectId.value = importProjectId.value;
    ElMessage.success(
      skipped > 0
        ? `已导入 ${added} 条，跳过 ${skipped} 条重复用例`
        : `已导入 ${added} 条到项目用例池`,
    );
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败');
  } finally {
    importing.value = false;
  }
}
function goImportedProject() {
  const pid = importedProjectId.value;
  showImport.value = false;
  if (pid) router.push(`/projects/${pid}`);
}
function resetImport() {
  createMode.value = false;
  importedProjectId.value = undefined;
  importedProjectName.value = '';
  importedCount.value = 0;
  newProjectName.value = '';
  newParentId.value = undefined;
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

/** 该模块子树（含自身）下是否至少有一条用例 */
function subtreeHasCases(node: any): boolean {
  const ids = new Set<number>(flattenIds(node));
  return cases.value.some((c: any) => ids.has(c.moduleId));
}

/** 左侧树：隐藏无对应用例的子功能(level=3)、测试项(level=4)节点 */
function filterModulesForDisplay(nodes: any[]): any[] {
  const out: any[] = [];
  for (const n of nodes) {
    const children = filterModulesForDisplay(n.children || []);
    const node = { ...n, children };
    if (n.level === 3 || n.level === 4) {
      if (!subtreeHasCases(node)) continue;
    }
    out.push(node);
  }
  return out;
}

const displayModules = computed(() => filterModulesForDisplay(modules.value));

const filteredCases = computed(() => {
  if (!moduleId.value) return cases.value;
  const node = findNode(modules.value, moduleId.value);
  if (!node) return [];
  const set = new Set<number>(flattenIds(node));
  return cases.value.filter((c: any) => set.has(c.moduleId));
});

// 分页：3000+ 条时不一次性渲染，el-table 默认不虚拟化，每页只渲染 pageSize 条。
const pageSize = ref(50);
const currentPage = ref(1);
const pagedCases = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCases.value.slice(start, start + pageSize.value);
});
// 筛选/搜索/切页大小变化时回到第 1 页
watch([moduleId, () => cases.value, pageSize], () => {
  currentPage.value = 1;
});

// 预计算 moduleId -> 完整路径数组的 Map，避免每个单元格都对整棵模块树做 findPath 递归（原性能瓶颈）。
const modulePathMap = computed(() => {
  const map = new Map<number, string[]>();
  const walk = (nodes: any[], trail: string[]) => {
    for (const n of nodes) {
      const next = [...trail, n.name];
      map.set(n.id, next);
      if (n.children?.length) walk(n.children, next);
    }
  };
  walk(modules.value, []);
  return map;
});

// 当前选中模块的路径（从顶层到该节点）
function findPath(nodes: any[], targetId: number, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...trail, n.name];
    if (n.id === targetId) return next;
    const sub = findPath(n.children || [], targetId, next);
    if (sub) return sub;
  }
  return null;
}
const selectedModulePath = computed<string[]>(() => {
  if (!moduleId.value) return [];
  return findPath(modules.value, moduleId.value) || [];
});

function caseModulePathStr(row: any): string {
  return (modulePathMap.value.get(row.moduleId) || []).join(' / ');
}
// 取模块路径的第 level 级：0=模块 1=子模块 2=子功能 3=测试项（O(1) 查表）
function pathAt(row: any, level: number): string {
  const arr = modulePathMap.value.get(row.moduleId) || [];
  return arr[level] || '';
}

function onNode(n: any) {
  moduleId.value = n ? n.id : undefined;
}
function openCreate() {
  editing.value = { caseSetId: id, modulePath: [], priority: 'P2', steps: '', expectedResult: '' };
  showEdit.value = true;
}
function openEdit(row: any) {
  editing.value = { ...row };
  showEdit.value = true;
}
async function onSaved() {
  showEdit.value = false;
  await load();
  ElMessage.success('已保存');
}
async function onBulkSaved() {
  await load();
}
async function onDelete(row: any) {
  await ElMessageBox.confirm(`确认删除用例 ${row.code} ?`, '提示', { type: 'warning' });
  await caseSetApi.deleteCase(row.id);
  ElMessage.success('已删除');
  await load();
}
async function onDeleteAll() {
  if (!filteredCases.value.length) return;
  const isFullPurge = !moduleId.value && !q.value;
  const scope = moduleId.value ? '当前模块下' : (q.value ? '搜索结果' : '本用例集所有');
  const extra = isFullPurge ? '\n（同时会清空左侧模块树上的所有节点）' : '';
  try {
    await ElMessageBox.confirm(
      `确认删除${scope}全部 ${filteredCases.value.length} 条用例？此操作不可撤销。${extra}`,
      '全部删除',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  if (isFullPurge) {
    // 无过滤：调用一次性 purge，硬删用例+版本+模块+项目池引用
    const res: any = await caseSetApi.purgeAll(id);
    ElMessage.success(`已清空用例集（${res?.deletedCases ?? 0} 条用例，含模块树节点）`);
  } else {
    // 局部范围（当前模块/搜索）：一次批量软删 + 清理空模块，避免逐条请求
    const ids = filteredCases.value.map((c: any) => c.id);
    const res: any = await caseSetApi.bulkDeleteCases(id, ids);
    ElMessage.success(`已删除 ${res?.deleted ?? ids.length} 条`);
  }
  await load();
}
async function onImport(req: any) {
  const fd = new FormData();
  fd.append('file', req.file);
  const res: any = await (
    await fetch(`/api/v1/case-sets/${id}/import`, {
      method: 'POST',
      body: fd,
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    })
  ).json();
  if (res.code === 0) {
    ElMessage.success(`导入完成: 成功 ${res.data.imported} / 跳过 ${res.data.skipped}`);
  } else {
    ElMessage.error(res.message);
  }
  await load();
}
async function onImportXmind(req: any) {
  const fd = new FormData();
  fd.append('file', req.file);
  const res: any = await (
    await fetch(`/api/v1/case-sets/${id}/import-xmind`, {
      method: 'POST',
      body: fd,
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    })
  ).json();
  if (res.code === 0) {
    const { imported, skipped, errors } = res.data;
    if (errors && errors.length) {
      ElMessage.warning(`XMind 导入: 成功 ${imported} / 跳过 ${skipped} / 失败 ${errors.length}（详见控制台）`);
      // eslint-disable-next-line no-console
      console.warn('[XMind 导入错误]', errors);
    } else {
      ElMessage.success(`XMind 导入完成: 成功 ${imported} / 跳过 ${skipped}`);
    }
  } else {
    ElMessage.error(res.message);
  }
  await load();
}
async function onExport() {
  const res = await fetch(`/api/v1/case-sets/${id}/export`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `case-set-${id}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
onMounted(load);
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.cases-pagination {
  margin-top: 8px;
  justify-content: flex-end;
}
.content-card--scroll {
  margin-bottom: 0;
}
.cell-wrap {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: #303133;
}
.case-detail {
  padding: 8px 16px;
  background: #fafafa;
}
.case-detail .d-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #ebeef5;
}
.case-detail .d-item:last-child { border-bottom: none; }
.case-detail .d-label {
  flex: 0 0 72px;
  color: #909399;
  font-size: 12px;
  padding-top: 2px;
}
.case-detail .d-val {
  flex: 1;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  color: #303133;
}
.tree-node {
  display: inline-flex;
  align-items: center;
  flex: 1;
  width: 100%;
  gap: 6px;
}
.tree-label--rename {
  cursor: grab;
}
.tree-label--rename:active {
  cursor: grabbing;
}
.tree-rename-input {
  flex: 1;
  min-width: 0;
}
.tree-rename-input :deep(.el-input__wrapper) {
  padding: 0 6px;
}
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-action {
  opacity: 0;
  color: #909399;
  font-size: 14px;
  padding: 2px;
  border-radius: 3px;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}
.el-tree-node__content:hover .tree-action,
.tree-node:hover .tree-action {
  opacity: 1;
}
.tree-action:hover {
  color: #409eff;
  background: #ecf5ff;
}
</style>
