<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    :title="`管理「${nodeName}」节点下的用例`"
    size="92%"
    direction="rtl"
    :close-on-click-modal="false"
  >
    <div class="wrap">
      <el-alert type="info" :closable="false" style="margin-bottom: 8px">
        Excel 风格批量编辑：直接修改单元格 → 点 <b>保存全部修改</b> 提交；可粘贴 Excel 数据；
        新增行只需填用例名称与预期结果。
        <b>路径填写规则</b>：当前主节点为「{{ nodeName }}」，下方"子模块/子功能/测试项"3 列与该节点拼成 4 级路径。
      </el-alert>

      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
        <el-button type="primary" size="small" @click="addRows(1)">+ 1 行</el-button>
        <el-button size="small" @click="addRows(5)">+ 5 行</el-button>
        <el-button size="small" @click="addRows(20)">+ 20 行</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" :disabled="selectedKey == null" @click="insertRow(-1)">↑ 上方插入行</el-button>
        <el-button size="small" :disabled="selectedKey == null" @click="insertRow(1)">↓ 下方插入行</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" type="success" plain :icon="DocumentCopy" :disabled="!checkedKeys.size" @click="copySelected">复制选中行{{ checkedKeys.size ? `（${checkedKeys.size}）` : '' }}</el-button>
        <el-button size="small" :icon="DocumentCopy" @click="copyHeader">复制表头</el-button>
        <el-input v-model="filterQ" size="small" placeholder="过滤标题/编号" clearable style="width:220px;margin-left:8px" />
        <span style="color:#909399;font-size:12px;margin-left:auto">
          共 {{ rows.length }} 行（{{ stats.original }} 已有 · {{ stats.modified }} 已改 · {{ stats.newCnt }} 新增 · {{ stats.deleted }} 待删）
        </span>
      </div>

      <div class="xls-wrap" ref="gridWrap" @paste="onPaste" @scroll="onGridScroll">
        <table class="xls">
          <colgroup>
            <col style="width:34px" /><!-- 勾选 -->
            <col style="width:42px" />
            <col style="width:120px" /><!-- 编号 -->
            <col style="width:130px" /><!-- 子模块 -->
            <col style="width:130px" /><!-- 子功能 -->
            <col style="width:130px" /><!-- 测试项 -->
            <col style="width:220px" /><!-- 用例名称 -->
            <col style="width:80px"  /><!-- 等级 -->
            <col style="width:200px" /><!-- 前置条件 -->
            <col style="width:260px" /><!-- 测试步骤 -->
            <col style="width:180px" /><!-- 测试数据 -->
            <col style="width:200px" /><!-- 预期结果 -->
            <col style="width:90px" v-for="i in 5" :key="`tagcol-${i}`" /><!-- 标签 -->
            <col style="width:48px"  />
          </colgroup>
          <thead>
            <tr>
              <th><el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAll" /></th>
              <th>#</th>
              <th>用例编号</th>
              <th>子模块</th>
              <th>子功能</th>
              <th>测试项</th>
              <th>用例名称 <span class="req">*</span></th>
              <th>等级</th>
              <th>前置条件</th>
              <th>测试步骤</th>
              <th>测试数据</th>
              <th>预期结果 <span class="req">*</span></th>
              <th>标签1</th><th>标签2</th><th>标签3</th><th>标签4</th><th>标签5</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in renderedRows"
              :key="row._key"
              :class="[rowClass(row), { 'r-selected': row._key === selectedKey }]"
            >
              <td class="chk"><el-checkbox :model-value="checkedKeys.has(row._key)" @change="(v: boolean) => toggleRow(row, v)" /></td>
              <td class="idx" style="cursor: pointer" title="点击选中该行（用于上/下方插入）" @click="selectRow(row)">
                <span>{{ ri + 1 }}</span>
                <span v-if="row._state === 'new'" class="tag-new">新</span>
                <span v-else-if="row._state === 'modified'" class="tag-mod">改</span>
                <span v-else-if="row._deleted" class="tag-del">删</span>
              </td>
              <td>
                <input v-model="row.code" :disabled="!!row.id" :title="row.id ? '已有用例不可改编号' : '留空自动生成'"
                  @input="markModified(row)" @keydown="onKey($event, ri, 0)" />
              </td>
              <td><textarea v-model="row.subModule" v-autosize rows="1" @input="markModified(row)" /></td>
              <td><textarea v-model="row.subFunction" v-autosize rows="1" @input="markModified(row)" /></td>
              <td><textarea v-model="row.testItem" v-autosize rows="1" @input="markModified(row)" /></td>
              <td><textarea v-model="row.title" v-autosize rows="1" @input="markModified(row)" /></td>
              <td>
                <select v-model="row.priority" @change="markModified(row)">
                  <option v-for="p in ['P0','P1','P2','P3']" :key="p" :value="p">{{ p }}</option>
                </select>
              </td>
              <td><textarea v-model="row.precondition" v-autosize rows="1" @input="markModified(row)" /></td>
              <td><textarea v-model="row.steps" v-autosize rows="1" placeholder="1. ... 2. ..." @input="markModified(row)" /></td>
              <td><textarea v-model="row.testData" v-autosize rows="1" @input="markModified(row)" /></td>
              <td><textarea v-model="row.expectedResult" v-autosize rows="1" @input="markModified(row)" /></td>
              <td v-for="ti in 5" :key="`tag-${row._key}-${ti}`">
                <textarea v-model="row[`tag${ti}` as 'tag1']" v-autosize rows="1" @input="markModified(row)" />
              </td>
              <td class="op">
                <el-button v-if="!row._deleted" link type="danger" :icon="Delete" @click="deleteRow(row)" title="删除该行" />
                <el-button v-else link type="primary" :icon="RefreshLeft" @click="restoreRow(row)" title="撤销删除" />
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="renderLimit < displayedRows.length"
          style="padding:10px;text-align:center;color:#909399;font-size:12px"
        >
          已显示 {{ renderLimit }} / {{ displayedRows.length }} 行，向下滚动加载更多…
        </div>
        <div v-if="!displayedRows.length" style="padding:24px;text-align:center;color:#909399">
          （暂无行，点击「+ 1 行」或直接 Ctrl+V 粘贴 Excel 数据）
        </div>
      </div>
    </div>

    <template #footer>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!hasChanges" @click="save">
          保存全部修改（{{ stats.modified + stats.newCnt + stats.deleted }}）
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, DocumentCopy, RefreshLeft } from '@element-plus/icons-vue';
import { caseSetApi } from '@/api';

// 让 textarea 高度随内容自增，保证每个单元格文字完整显示、自动换行。
// 关键点：同一行内所有 textarea 高度统一为「该行最高内容高度」，这样内容少/空白的单元格也会
// 铺满整格，点击单元格任意位置都能聚焦输入（否则空白 textarea 只有 32px，其下方是 td 空白区，
// 点下去无法聚焦，表现为“空白单元格无法输入”）。
// 批量分离读写（先整批置 auto→统一读一次 scrollHeight→统一写回），避免逐元素强制同步重排。
// 渲染已窗口化（每屏 ~80 行），待处理量有上限，无需担心卡顿。
const pendingResize = new Set<HTMLTextAreaElement>();
let resizeScheduled = false;
function flushResize() {
  resizeScheduled = false;
  const seeds = Array.from(pendingResize).filter((el) => el.isConnected);
  pendingResize.clear();
  if (!seeds.length) return;
  // 收集受影响行的全部 textarea（按整行处理，保证同行高度一致）
  const trSet = new Set<HTMLTableRowElement>();
  for (const el of seeds) {
    const tr = el.closest('tr');
    if (tr) trSet.add(tr as HTMLTableRowElement);
  }
  const cells: HTMLTextAreaElement[] = [];
  trSet.forEach((tr) => {
    tr.querySelectorAll('textarea').forEach((t) => cells.push(t as HTMLTextAreaElement));
  });
  if (!cells.length) return;
  // 1) 只写：全部置 auto
  for (const el of cells) el.style.height = 'auto';
  // 2) 只读：统一读取每个 textarea 的内容高度
  const nat = cells.map((el) => el.scrollHeight);
  // 3) 计算每行的最大高度
  const rowMax = new Map<HTMLTableRowElement, number>();
  cells.forEach((el, i) => {
    const tr = el.closest('tr') as HTMLTableRowElement;
    rowMax.set(tr, Math.max(rowMax.get(tr) ?? 0, nat[i]));
  });
  // 4) 只写：同行所有 textarea 统一用该行最大高度
  cells.forEach((el) => {
    const tr = el.closest('tr') as HTMLTableRowElement;
    el.style.height = (rowMax.get(tr) ?? 32) + 'px';
  });
}
function scheduleResize(el: HTMLTextAreaElement) {
  pendingResize.add(el);
  if (!resizeScheduled) {
    resizeScheduled = true;
    requestAnimationFrame(flushResize);
  }
}
const vAutosize = {
  mounted(el: HTMLTextAreaElement) {
    el.addEventListener('input', () => scheduleResize(el));
    scheduleResize(el);
  },
  updated(el: HTMLTextAreaElement) {
    scheduleResize(el);
  },
  unmounted(el: HTMLTextAreaElement) {
    pendingResize.delete(el);
  },
};

interface Row {
  _key: number;
  _state: 'original' | 'modified' | 'new';
  _deleted?: boolean;
  _origin?: any; // 原始快照（仅 original 行有）
  _origRoot?: string; // 原始一级主节点名（用于已有用例更新时拼回完整路径）
  id?: number;
  code: string;
  subModule: string;
  subFunction: string;
  testItem: string;
  title: string;
  priority: string;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  tag1: string; tag2: string; tag3: string; tag4: string; tag5: string;
}

const props = defineProps<{
  modelValue: boolean;
  caseSetId: number;
  nodeName: string;
  /** 该节点路径全部段（含主节点），如 ['2D相机模块','2D智能相机管理'] */
  nodePath: string[];
  /** 节点子树下的所有用例 */
  initialCases: any[];
  /** 模块树，用于把 case.moduleId 还原成路径 */
  modules: any[];
}>();
const emit = defineEmits(['update:modelValue', 'saved']);

const COL_KEYS: (keyof Row)[] = [
  'code', 'subModule', 'subFunction', 'testItem',
  'title', 'priority', 'precondition', 'steps', 'testData', 'expectedResult',
  'tag1', 'tag2', 'tag3', 'tag4', 'tag5',
];
const HEADER = [
  '用例编号', '子模块', '子功能', '测试项',
  '用例名称', '等级', '前置条件', '测试步骤', '测试数据', '预期结果',
  '标签1', '标签2', '标签3', '标签4', '标签5',
];

const rows = reactive<Row[]>([]);
const filterQ = ref('');
const saving = ref(false);
const selectedKey = ref<number | null>(null);
const checkedKeys = reactive(new Set<number>());
let keySeq = 1;

// 增量渲染（窗口化）：1000+ 行时不一次性渲染全部，先渲染首屏，滚动到底再追加，避免打开卡顿。
const INITIAL_RENDER = 80;
const RENDER_CHUNK = 80;
const renderLimit = ref(INITIAL_RENDER);
const gridWrap = ref<HTMLElement>();

watch(() => props.modelValue, (v) => {
  if (v) {
    loadFromProps();
    renderLimit.value = INITIAL_RENDER;
    selectedKey.value = null;
    checkedKeys.clear();
    if (gridWrap.value) gridWrap.value.scrollTop = 0;
  } else {
    rows.splice(0, rows.length);
    selectedKey.value = null;
    checkedKeys.clear();
  }
});

function findPath(nodes: any[], targetId: number, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...trail, n.name];
    if (n.id === targetId) return next;
    const sub = findPath(n.children || [], targetId, next);
    if (sub) return sub;
  }
  return null;
}

function caseToRow(c: any): Row {
  // 优先使用父组件预计算好的 modulePathArr，回退到自己查
  const path: string[] = Array.isArray(c.modulePathArr) && c.modulePathArr.length
    ? c.modulePathArr
    : (findPath(props.modules, c.moduleId) || []);
  // 不剥离前缀：始终按用例完整路径的 2/3/4 级回填，与导入时的 Excel 格式一致
  // path[0] = 一级（主节点），path[1..3] = 子模块/子功能/测试项
  // 缺失的列用"已知的最深一级名"向后填充
  const lastKnown = path[path.length - 1] || '';
  const subModule = path[1] || lastKnown;
  const subFunction = path[2] || lastKnown;
  const testItem = path[3] || lastKnown;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  const row: Row = {
    _key: keySeq++,
    _state: 'original',
    id: c.id,
    code: c.code || '',
    subModule, subFunction, testItem,
    title: c.title || '',
    priority: c.priority || 'P2',
    precondition: c.precondition || '',
    steps: c.steps || '',
    testData: c.testData || '',
    expectedResult: c.expectedResult || '',
    tag1: tags[0] || '', tag2: tags[1] || '', tag3: tags[2] || '',
    tag4: tags[3] || '', tag5: tags[4] || '',
  };
  // _origPath 保留用例原本的一级主节点，用于更新时拼回完整路径
  (row as any)._origRoot = path[0] || '';
  // _origin 用于检测"是否被修改"，需在 row 完全填充后再快照
  row._origin = snapshot(row);
  return row;
}
function snapshot(r: Row) {
  const s: any = {};
  for (const k of COL_KEYS) s[k] = (r as any)[k];
  return s;
}
function isModified(r: Row): boolean {
  if (!r._origin) return false;
  for (const k of COL_KEYS) {
    if (((r as any)[k] || '') !== (r._origin[k] || '')) return true;
  }
  return false;
}

function loadFromProps() {
  rows.splice(0, rows.length, ...props.initialCases.map(caseToRow));
}

function newBlankRow(): Row {
  return {
    _key: keySeq++,
    _state: 'new',
    code: '', subModule: '', subFunction: '', testItem: '',
    title: '', priority: 'P2',
    precondition: '', steps: '', testData: '', expectedResult: '',
    tag1: '', tag2: '', tag3: '', tag4: '', tag5: '',
  };
}
function addRows(n: number) {
  for (let i = 0; i < n; i++) rows.push(newBlankRow());
  // 新增行在末尾，确保渲染到位以便填写
  renderLimit.value = rows.length;
}
function selectRow(row: Row) {
  selectedKey.value = selectedKey.value === row._key ? null : row._key;
}
// 在选中行的上方(offset<0)或下方(offset>0)插入一行空白行
function insertRow(offset: number) {
  if (selectedKey.value == null) return;
  const idx = rows.findIndex((r) => r._key === selectedKey.value);
  if (idx < 0) return;
  const anchor = rows[idx];
  const blank = newBlankRow();
  // 继承选中行的模块路径/等级，便于在同一测试项下补充用例
  blank.subModule = anchor.subModule;
  blank.subFunction = anchor.subFunction;
  blank.testItem = anchor.testItem;
  blank.priority = anchor.priority;
  const at = idx + (offset > 0 ? 1 : 0);
  rows.splice(at, 0, blank);
  renderLimit.value = Math.max(renderLimit.value + 1, at + 2);
  selectedKey.value = blank._key; // 选中新行，便于连续插入
}
function deleteRow(row: Row) {
  if (row._state === 'new') {
    const idx = rows.findIndex((r) => r._key === row._key);
    if (idx >= 0) rows.splice(idx, 1);
  } else {
    row._deleted = true;
  }
}
function restoreRow(row: Row) {
  row._deleted = false;
}
function markModified(row: Row) {
  if (row._state === 'new') return;
  row._state = isModified(row) ? 'modified' : 'original';
}

const displayedRows = computed(() => {
  const q = filterQ.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    String(r.title || '').toLowerCase().includes(q) ||
    String(r.code || '').toLowerCase().includes(q),
  );
});
// 实际渲染的行：取 displayedRows 的前 renderLimit 条（窗口化）
const renderedRows = computed(() => {
  const list = displayedRows.value;
  return renderLimit.value >= list.length ? list : list.slice(0, renderLimit.value);
});
function onGridScroll() {
  const el = gridWrap.value;
  if (!el) return;
  if (renderLimit.value >= displayedRows.value.length) return;
  // 接近底部（剩 300px）时追加一批
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    renderLimit.value = Math.min(displayedRows.value.length, renderLimit.value + RENDER_CHUNK);
  }
}
// 筛选变化时重置窗口，回到首屏
watch(filterQ, () => {
  renderLimit.value = INITIAL_RENDER;
  if (gridWrap.value) gridWrap.value.scrollTop = 0;
});
const stats = computed(() => ({
  original: rows.filter((r) => r._state === 'original' && !r._deleted).length,
  modified: rows.filter((r) => r._state === 'modified' && !r._deleted).length,
  newCnt: rows.filter((r) => r._state === 'new' && !r._deleted).length,
  deleted: rows.filter((r) => r._deleted && r.id).length,
}));
const hasChanges = computed(() => stats.value.modified + stats.value.newCnt + stats.value.deleted > 0);

function rowClass(row: Row) {
  if (row._deleted) return 'r-deleted';
  if (row._state === 'new') return 'r-new';
  if (row._state === 'modified') return 'r-modified';
  return '';
}

function onKey(e: KeyboardEvent, _r: number, _c: number) {
  // 简单 Enter/Tab 行为，交给浏览器默认即可；保留接口以便扩展
  if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
    (e.target as HTMLElement).blur();
  }
}

// 粘贴：支持带引号/换行的单元格（Excel 兼容 TSV）
function parseTSV(text: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  const grid = parseTSV(text);
  if (!grid.length) return;
  if (grid.length === 1 && grid[0].length <= 1) return;
  e.preventDefault();
  // 简化：从最后一行的下一行开始批量追加
  let dataRows = grid;
  if (grid[0].length >= 2 &&
      grid[0].slice(0, Math.min(grid[0].length, HEADER.length)).join('|') ===
      HEADER.slice(0, grid[0].length).join('|')) {
    dataRows = grid.slice(1);
  }
  for (const line of dataRows) {
    const r = newBlankRow();
    for (let j = 0; j < line.length && j < COL_KEYS.length; j++) {
      const key = COL_KEYS[j];
      const v = (line[j] || '').toString();
      if (key === 'priority') {
        const vv = v.trim().toUpperCase();
        if (['P0','P1','P2','P3'].includes(vv)) r.priority = vv;
      } else {
        (r as any)[key] = v;
      }
    }
    rows.push(r);
  }
  renderLimit.value = rows.length;
  ElMessage.success(`已新增 ${dataRows.length} 行`);
}

async function copyHeader() {
  const ok = await writeClipboard(HEADER.join('\t'));
  if (ok) ElMessage.success('表头已复制');
  else ElMessage.warning('复制失败');
}

// 写剪贴板：优先 navigator.clipboard（HTTPS/localhost），HTTP 等非安全上下文回退到 execCommand
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 落到回退方案 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ===== 多选 + 复制选中行（可粘贴到 Excel / 其它用例编辑页） =====
function toggleRow(row: Row, v: boolean) {
  if (v) checkedKeys.add(row._key);
  else checkedKeys.delete(row._key);
}
const allChecked = computed(() => {
  const list = displayedRows.value.filter((r) => !r._deleted);
  return list.length > 0 && list.every((r) => checkedKeys.has(r._key));
});
const someChecked = computed(() =>
  displayedRows.value.some((r) => checkedKeys.has(r._key)) && !allChecked.value,
);
function toggleAll(v: boolean) {
  const list = displayedRows.value.filter((r) => !r._deleted);
  if (v) list.forEach((r) => checkedKeys.add(r._key));
  else list.forEach((r) => checkedKeys.delete(r._key));
}
function tsvEscape(v: any): string {
  const s = (v ?? '').toString();
  return /[\t\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function copySelected() {
  // 按当前行顺序取勾选的行
  const sel = rows.filter((r) => checkedKeys.has(r._key) && !r._deleted);
  if (!sel.length) return ElMessage.warning('请先勾选要复制的行');
  const text = sel
    .map((r) => COL_KEYS.map((k) => tsvEscape((r as any)[k])).join('\t'))
    .join('\r\n');
  const ok = await writeClipboard(text);
  if (ok) ElMessage.success(`已复制 ${sel.length} 行（可粘贴到 Excel / 其它用例编辑页 Ctrl+V）`);
  else ElMessage.warning('复制失败（浏览器剪贴板权限）');
}

function buildModulePath(r: Row): string[] {
  // 一级主节点（root）：
  //   - 已有用例（有 _origRoot）→ 保留原本的一级主节点，不会因从某个子节点打开而被搬走
  //   - 新增行 → 用当前子树的【顶层模块】名（nodePath[0]），而不是点开的那个子节点名（nodeName）；
  //     否则在深层子节点里新增用例会把它挂成一个新的顶层模块，导致树上多出一份错误结构。
  const root =
    (r._origRoot && r._origRoot.trim()) ||
    (props.nodePath && (props.nodePath[0] || '').trim()) ||
    props.nodeName ||
    '默认';
  const lvl2 = (r.subModule || '').trim() || '默认';
  const lvl3 = (r.subFunction || '').trim() || '默认';
  const lvl4 = (r.testItem || '').trim() || '默认';
  return [root, lvl2, lvl3, lvl4];
}
function buildTags(r: Row): string[] {
  return [r.tag1, r.tag2, r.tag3, r.tag4, r.tag5].map((t) => (t || '').trim()).filter(Boolean);
}
function pathChanged(r: Row): boolean {
  if (!r._origin) return true;
  return ['subModule', 'subFunction', 'testItem'].some((k) => (r as any)[k] !== r._origin[k]);
}
function buildDto(r: Row, opts: { forUpdate: boolean }): any {
  const dto: any = {
    title: r.title.trim(),
    priority: r.priority,
    precondition: r.precondition,
    steps: r.steps,
    testData: r.testData,
    expectedResult: r.expectedResult,
    tags: buildTags(r),
  };
  // 更新已有用例：只有当 3 列真的变了，才传 modulePath（避免无意义地把 case 挪到"主节点/默认/默认/默认"）
  if (opts.forUpdate) {
    if (pathChanged(r)) dto.modulePath = buildModulePath(r);
  } else {
    dto.modulePath = buildModulePath(r);
  }
  return dto;
}

async function save() {
  // 校验新增/已改的行必须有 title + expectedResult
  const toUpdate = rows.filter((r) => r._state === 'modified' && !r._deleted);
  const toCreate = rows.filter((r) => r._state === 'new' && !r._deleted);
  const toDelete = rows.filter((r) => r._deleted && r.id);

  const invalid = [...toUpdate, ...toCreate].filter((r) => !(r.title.trim() && r.expectedResult.trim()));
  if (invalid.length) {
    return ElMessage.warning(`有 ${invalid.length} 行的"用例名称"或"预期结果"为空，请补全`);
  }

  saving.value = true;
  let okU = 0, okC = 0, okD = 0, fail = 0;
  try {
    // 顺序处理：删除 → 更新 → 新增
    for (const r of toDelete) {
      try { await caseSetApi.deleteCase(r.id!); okD++; } catch { fail++; }
    }
    for (const r of toUpdate) {
      try {
        await caseSetApi.updateCase(r.id!, buildDto(r, { forUpdate: true }));
        okU++;
        // 标记为已提交，避免本次有其它行失败、用户重试时对本行重复更新
        r._state = 'original';
        r._origin = snapshot(r);
      } catch { fail++; }
    }
    // 新增走批量接口（一次请求，服务端带编号冲突重试）
    if (toCreate.length) {
      const items = toCreate.map((r) => {
        const dto = buildDto(r, { forUpdate: false });
        const code = (r.code || '').trim();
        if (code) dto.code = code;
        return dto;
      });
      try {
        const res: any = await caseSetApi.bulkCreateCases(props.caseSetId, items);
        okC += res?.ok ?? 0;
        fail += res?.fail ?? 0;
        // 回填新建用例 id/编号，并标记为已提交：
        // 避免本次有其它行失败、用户修好后再次保存时，这些已创建的行被重复创建。
        for (const rr of res?.results || []) {
          const row = toCreate[rr.index];
          if (row && rr.ok && rr.id != null) {
            row.id = rr.id;
            if (rr.code) row.code = rr.code;
            row._state = 'original';
            row._origin = snapshot(row);
          }
        }
      } catch { fail += toCreate.length; }
    }
    if (fail === 0) {
      // 按当前行顺序（含新插入行）重新生成编号，使编号与顺序一致
      const orderedIds = rows.filter((r) => !r._deleted && r.id).map((r) => r.id as number);
      if (orderedIds.length) {
        try { await caseSetApi.renumberCases(props.caseSetId, orderedIds); } catch { /* 重排失败不阻断保存 */ }
      }
      ElMessage.success(`已保存：修改 ${okU} · 新增 ${okC} · 删除 ${okD}`);
      emit('saved');
      emit('update:modelValue', false);
    } else {
      ElMessage.warning(`修改 ${okU} · 新增 ${okC} · 删除 ${okD} · 失败 ${fail}`);
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.wrap { display: flex; flex-direction: column; height: 100%; padding: 0 12px 12px; }
.xls-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
}
.xls {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  table-layout: fixed;
}
.xls thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  padding: 6px 8px;
  font-weight: 600;
  text-align: left;
  color: #303133;
}
.xls tbody td {
  border: 1px solid #ebeef5;
  padding: 0;
  vertical-align: top;
  background: #fff;
  position: relative;
}
.xls td.idx {
  text-align: center;
  background: #fafafa;
  color: #909399;
  padding: 4px 6px;
  font-variant-numeric: tabular-nums;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 32px;
}
.xls td.op { text-align: center; }
.xls td.chk { text-align: center; vertical-align: middle; padding: 4px; }
.xls thead th:first-child { text-align: center; }
.xls input, .xls select, .xls textarea {
  width: 100%;
  border: none;
  outline: none;
  padding: 6px 8px;
  font: inherit;
  background: transparent;
  box-sizing: border-box;
  min-height: 32px;
  line-height: 1.5;
}
.xls textarea {
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  display: block;
}
.xls input:focus, .xls select:focus, .xls textarea:focus {
  background: #ecf5ff;
  box-shadow: inset 0 0 0 2px #409eff;
}
.xls th .req { color: #f56c6c; }

.r-new td { background: #f0f9ff; }
.r-modified td { background: #fdf6ec; }
.r-deleted td { background: #fef0f0; opacity: 0.7; text-decoration: line-through; }
.r-selected td { box-shadow: inset 0 0 0 9999px rgba(64, 158, 255, 0.08); }
.r-selected td.idx { background: #409eff; color: #fff; }
.tag-new, .tag-mod, .tag-del {
  display: inline-block;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 7px;
  color: #fff;
}
.tag-new { background: #67c23a; }
.tag-mod { background: #e6a23c; }
.tag-del { background: #f56c6c; }
</style>
