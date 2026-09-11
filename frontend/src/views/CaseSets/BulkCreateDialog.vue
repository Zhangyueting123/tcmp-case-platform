<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="批量新增用例（多人协作）"
    width="94vw"
    top="3vh"
    :close-on-click-modal="false"
    @close="onClose"
  >
    <el-alert type="info" :closable="false" style="margin-bottom: 8px">
      像 Excel 一样使用：可直接从 Excel 复制单元格 → 点击任一格 → <b>Ctrl/Cmd + V</b> 粘贴；支持 Tab/Enter 跳格。
      <b>多 Sheet</b>：底部可新增多张表，<b>Sheet 名 = 用例树一级模块</b>，所有 sheet 内的数据一起提交。<b>实时协作</b>：所有人编辑同一份表格，单元格变更与光标位置都会实时同步。
    </el-alert>

    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
      <el-button type="primary" size="small" @click="addRows(1)" :disabled="!connected || !activeSheet">+ 1 行</el-button>
      <el-button size="small" @click="addRows(5)" :disabled="!connected || !activeSheet">+ 5 行</el-button>
      <el-button size="small" @click="addRows(20)" :disabled="!connected || !activeSheet">+ 20 行</el-button>
      <el-button size="small" :icon="DocumentCopy" @click="copyHeader" title="复制表头到剪贴板">复制表头</el-button>
      <el-tag v-if="connected" type="success" size="small">已连接</el-tag>
      <el-tag v-else type="warning" size="small">连接中…</el-tag>
      <div style="display:flex;gap:4px;align-items:center;margin-left:8px">
        <span style="color:#909399;font-size:12px">在线：</span>
        <el-tooltip
          v-for="u in presence"
          :key="u.userId"
          :content="`${u.username}${u.userId === selfUserId ? ' (我)' : ''}${u.activeSheet ? ' · ' + sheetName(u.activeSheet) : ''}`"
          placement="top"
        >
          <span class="presence-chip" :style="{ background: u.color }">
            {{ initials(u.username) }}
          </span>
        </el-tooltip>
      </div>
      <span style="color:#909399;font-size:12px;margin-left:auto">
        {{ totalRows }} 行 · 有效 {{ totalValid }} · 当前主节点：{{ activeSheet?.name || '—' }}
      </span>
    </div>

    <div class="xls-wrap" @paste="onPaste">
      <table class="xls" v-if="activeSheet">
        <colgroup>
          <col style="width:42px" />
          <col style="width:120px" />
          <col style="width:130px" />
          <col style="width:130px" />
          <col style="width:130px" />
          <col style="width:220px" />
          <col style="width:80px"  />
          <col style="width:200px" />
          <col style="width:260px" />
          <col style="width:180px" />
          <col style="width:200px" />
          <col style="width:90px"  />
          <col style="width:90px"  />
          <col style="width:90px"  />
          <col style="width:90px"  />
          <col style="width:90px"  />
          <col style="width:48px"  />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>用例编号</th>
            <th>子模块</th>
            <th>子功能</th>
            <th>测试项</th>
            <th>用例名称 <span class="req">*</span></th>
            <th>用例等级</th>
            <th>前置条件</th>
            <th>测试步骤</th>
            <th>测试数据</th>
            <th>预期结果 <span class="req">*</span></th>
            <th>标签1</th>
            <th>标签2</th>
            <th>标签3</th>
            <th>标签4</th>
            <th>标签5</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in activeSheet.rows" :key="ri" :class="{ invalid: !(row.title.trim() && row.expectedResult.trim()) }">
            <td class="idx">{{ ri + 1 }}</td>
            <td :style="cellStyle(ri, 0)">
              <input v-model="row.code" placeholder="留空自动生成"
                :ref="(el) => bindCell(el, ri, 0)"
                @input="onLocalChange(ri, 0, 'code', row.code)"
                @focus="onFocus(ri, 0)" @blur="onBlur" @keydown="onKey($event, ri, 0)" />
              <span v-if="badgeOf(ri, 0)" class="cell-badge" :style="{ background: badgeOf(ri, 0)!.color }">{{ initials(badgeOf(ri, 0)!.username) }}</span>
            </td>
            <td :style="cellStyle(ri, 1)">
              <input v-model="row.subModule"
                :ref="(el) => bindCell(el, ri, 1)"
                @input="onLocalChange(ri, 1, 'subModule', row.subModule)"
                @focus="onFocus(ri, 1)" @blur="onBlur" @keydown="onKey($event, ri, 1)" />
              <span v-if="badgeOf(ri, 1)" class="cell-badge" :style="{ background: badgeOf(ri, 1)!.color }">{{ initials(badgeOf(ri, 1)!.username) }}</span>
            </td>
            <td :style="cellStyle(ri, 2)">
              <input v-model="row.subFunction"
                :ref="(el) => bindCell(el, ri, 2)"
                @input="onLocalChange(ri, 2, 'subFunction', row.subFunction)"
                @focus="onFocus(ri, 2)" @blur="onBlur" @keydown="onKey($event, ri, 2)" />
              <span v-if="badgeOf(ri, 2)" class="cell-badge" :style="{ background: badgeOf(ri, 2)!.color }">{{ initials(badgeOf(ri, 2)!.username) }}</span>
            </td>
            <td :style="cellStyle(ri, 3)">
              <input v-model="row.testItem"
                :ref="(el) => bindCell(el, ri, 3)"
                @input="onLocalChange(ri, 3, 'testItem', row.testItem)"
                @focus="onFocus(ri, 3)" @blur="onBlur" @keydown="onKey($event, ri, 3)" />
              <span v-if="badgeOf(ri, 3)" class="cell-badge" :style="{ background: badgeOf(ri, 3)!.color }">{{ initials(badgeOf(ri, 3)!.username) }}</span>
            </td>
            <td :style="cellStyle(ri, 4)">
              <input v-model="row.title"
                :ref="(el) => bindCell(el, ri, 4)"
                @input="onLocalChange(ri, 4, 'title', row.title)"
                @focus="onFocus(ri, 4)" @blur="onBlur" @keydown="onKey($event, ri, 4)" />
              <span v-if="badgeOf(ri, 4)" class="cell-badge" :style="{ background: badgeOf(ri, 4)!.color }">{{ initials(badgeOf(ri, 4)!.username) }}</span>
            </td>
            <td :style="cellStyle(ri, 5)">
              <select v-model="row.priority"
                :ref="(el) => bindCell(el, ri, 5)"
                @change="onLocalChange(ri, 5, 'priority', row.priority)"
                @focus="onFocus(ri, 5)" @blur="onBlur" @keydown="onKey($event, ri, 5)">
                <option v-for="p in ['P0','P1','P2','P3']" :key="p" :value="p">{{ p }}</option>
              </select>
            </td>
            <td :style="cellStyle(ri, 6)">
              <textarea v-model="row.precondition" rows="1"
                :ref="(el) => bindCell(el, ri, 6)"
                @input="onLocalChange(ri, 6, 'precondition', row.precondition)"
                @focus="onFocus(ri, 6)" @blur="onBlur" @keydown="onKey($event, ri, 6)" />
            </td>
            <td :style="cellStyle(ri, 7)">
              <textarea v-model="row.steps" rows="1" placeholder="1. ... 2. ..."
                :ref="(el) => bindCell(el, ri, 7)"
                @input="onLocalChange(ri, 7, 'steps', row.steps)"
                @focus="onFocus(ri, 7)" @blur="onBlur" @keydown="onKey($event, ri, 7)" />
            </td>
            <td :style="cellStyle(ri, 8)">
              <textarea v-model="row.testData" rows="1"
                :ref="(el) => bindCell(el, ri, 8)"
                @input="onLocalChange(ri, 8, 'testData', row.testData)"
                @focus="onFocus(ri, 8)" @blur="onBlur" @keydown="onKey($event, ri, 8)" />
            </td>
            <td :style="cellStyle(ri, 9)">
              <textarea v-model="row.expectedResult" rows="1"
                :ref="(el) => bindCell(el, ri, 9)"
                @input="onLocalChange(ri, 9, 'expectedResult', row.expectedResult)"
                @focus="onFocus(ri, 9)" @blur="onBlur" @keydown="onKey($event, ri, 9)" />
            </td>
            <td v-for="ti in 5" :key="`tag-${ri}-${ti}`" :style="cellStyle(ri, 9 + ti)">
              <input v-model="row[`tag${ti}` as 'tag1']"
                :ref="(el) => bindCell(el, ri, 9 + ti)"
                @input="onLocalChange(ri, 9 + ti, `tag${ti}` as 'tag1', (row as any)[`tag${ti}`])"
                @focus="onFocus(ri, 9 + ti)" @blur="onBlur" @keydown="onKey($event, ri, 9 + ti)" />
            </td>
            <td class="op">
              <el-button link type="danger" :icon="Delete" :disabled="!connected" @click="removeRow(ri)" />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="activeSheet && !activeSheet.rows.length" style="padding:24px;text-align:center;color:#909399">
        （暂无行，点击「+ 1 行」或直接 Ctrl+V 粘贴 Excel 数据）
      </div>
    </div>

    <!-- Sheet 标签栏 -->
    <div class="sheet-bar">
      <div
        v-for="sh in sheets"
        :key="sh.id"
        class="sheet-tab"
        :class="{ active: sh.id === activeSheetId }"
        @click="switchSheet(sh.id)"
        @dblclick="renameSheet(sh)"
      >
        <span class="sheet-name">{{ sh.name }}</span>
        <span class="sheet-count">{{ sh.rows.length }}</span>
        <el-icon v-if="sheets.length > 1" class="sheet-close" @click.stop="removeSheet(sh)" title="删除该 Sheet">
          <Close />
        </el-icon>
      </div>
      <el-button class="sheet-add" link size="small" :icon="Plus" @click="addSheet" :disabled="!connected">
        新增 Sheet
      </el-button>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!totalValid || !connected" @click="onSave">
        <template v-if="saving && saveProgress.total">保存中 {{ saveProgress.done }} / {{ saveProgress.total }}</template>
        <template v-else>批量保存（{{ totalValid }} / {{ totalRows }}）</template>
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, DocumentCopy, Close, Plus } from '@element-plus/icons-vue';
import { io, type Socket } from 'socket.io-client';
import { caseSetApi } from '@/api';

const props = defineProps<{
  modelValue: boolean;
  caseSetId: number;
  defaultModulePath?: string[];
}>();
const emit = defineEmits(['update:modelValue', 'saved']);

interface Row {
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
  tag1: string;
  tag2: string;
  tag3: string;
  tag4: string;
  tag5: string;
}
interface Sheet {
  id: string;
  name: string;
  rows: Row[];
  /** key=`r:c` → focus info */
  focus: Record<string, FocusInfo>;
}
interface PresenceUser { userId: number; username: string; color: string; activeSheet?: string | null }
interface FocusInfo { userId: number; username: string; color: string }

const COL_KEYS: (keyof Row)[] = [
  'code', 'subModule', 'subFunction', 'testItem',
  'title', 'priority', 'precondition', 'steps', 'testData', 'expectedResult',
  'tag1', 'tag2', 'tag3', 'tag4', 'tag5',
];
const HEADER = [
  '用例编号', '子模块', '子功能', '测试项',
  '用例名称', '用例等级', '前置条件', '测试步骤', '测试数据', '预期结果',
  '标签1', '标签2', '标签3', '标签4', '标签5',
];

const sheets = reactive<Sheet[]>([]);
const activeSheetId = ref<string>('');
const saving = ref(false);
const saveProgress = ref<{ done: number; total: number }>({ done: 0, total: 0 });
const connected = ref(false);
const presence = ref<PresenceUser[]>([]);
const selfUserId = ref<number | null>(null);
const focusedCell = ref<{ r: number; c: number } | null>(null);
const cellRefs = new Map<string, HTMLElement>();

const activeSheet = computed<Sheet | undefined>(() => sheets.find((s) => s.id === activeSheetId.value));
const totalRows = computed(() => sheets.reduce((s, x) => s + x.rows.length, 0));
const totalValid = computed(() => sheets.reduce((s, x) => s + x.rows.filter((r) => r.title.trim() && r.expectedResult.trim()).length, 0));

let socket: Socket | null = null;
const recentLocalChanges = new Map<string, number>(); // key=`sheetId:r:c:key` → ts
function markLocal(sid: string, r: number, c: number, key: string) {
  recentLocalChanges.set(`${sid}:${r}:${c}:${key}`, Date.now());
  setTimeout(() => {
    const k = `${sid}:${r}:${c}:${key}`;
    if (Date.now() - (recentLocalChanges.get(k) || 0) >= 1500) recentLocalChanges.delete(k);
  }, 1600);
}
function isLocalEcho(sid: string, r: number, c: number, key: string) {
  const ts = recentLocalChanges.get(`${sid}:${r}:${c}:${key}`);
  return ts && Date.now() - ts < 1500;
}

const defaultPathLabel = computed(() => (props.defaultModulePath || []).filter(Boolean).join('/'));

watch(() => props.modelValue, (v) => {
  if (v) connect();
  else disconnect();
});
onBeforeUnmount(() => disconnect());

function token() {
  return localStorage.getItem('accessToken') || '';
}

function rowDefaults(): Row {
  return {
    code: '', subModule: '', subFunction: '', testItem: '',
    title: '', priority: 'P2',
    precondition: '', steps: '', testData: '', expectedResult: '',
    tag1: '', tag2: '', tag3: '', tag4: '', tag5: '',
  };
}
function normalizeRow(raw: any): Row {
  return Object.assign(rowDefaults(), raw || {});
}
function normalizeSheet(raw: any): Sheet {
  const focus: Record<string, FocusInfo> = {};
  for (const f of raw.focus || []) {
    focus[`${f.r}:${f.c}`] = { userId: f.userId, username: '', color: '' };
  }
  return {
    id: raw.id,
    name: raw.name || 'Sheet',
    rows: (raw.rows || []).map(normalizeRow),
    focus,
  };
}

function connect() {
  disconnect();
  sheets.splice(0, sheets.length);
  activeSheetId.value = '';
  presence.value = [];
  cellRefs.clear();
  connected.value = false;
  socket = io('/collab', {
    path: '/socket.io',
    auth: { token: token() },
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => {
    socket!.emit('bulk:join', { caseSetId: props.caseSetId });
  });
  socket.on('disconnect', () => { connected.value = false; });
  socket.on('bulk:error', (msg: any) => {
    ElMessage.error(`协作连接失败: ${msg?.message || '未知错误'}`);
  });

  socket.on('bulk:state', (state: any) => {
    connected.value = true;
    if (typeof state.selfUserId === 'number') selfUserId.value = state.selfUserId;
    sheets.splice(0, sheets.length, ...((state.sheets || []).map(normalizeSheet)));
    presence.value = state.presence || [];
    // 给焦点回填用户信息
    for (const sh of sheets) {
      for (const k of Object.keys(sh.focus)) {
        const u = presence.value.find((p) => p.userId === sh.focus[k].userId);
        if (u) sh.focus[k] = { userId: u.userId, username: u.username, color: u.color };
      }
    }
    if (sheets.length && !sheets.find((s) => s.id === activeSheetId.value)) {
      activeSheetId.value = sheets[0].id;
      socket?.emit('bulk:active-sheet', { caseSetId: props.caseSetId, sheetId: activeSheetId.value });
    }
    nextTick(() => focusCell(0, 0));
  });

  socket.on('bulk:cell-change', ({ sheetId, r, c, key, value }: any) => {
    const sh = sheets.find((s) => s.id === sheetId);
    if (!sh) return;
    if (typeof r !== 'number' || typeof c !== 'number' || !key) return;
    if (isLocalEcho(sheetId, r, c, key)) return;
    while (sh.rows.length <= r) sh.rows.push(rowDefaults());
    (sh.rows[r] as any)[key] = value;
  });

  socket.on('bulk:row-op', ({ sheetId, op, index, count }: any) => {
    const sh = sheets.find((s) => s.id === sheetId);
    if (!sh) return;
    if (op === 'add') {
      const idx = typeof index === 'number' ? index : sh.rows.length;
      const fresh = Array.from({ length: count || 1 }, () => rowDefaults());
      sh.rows.splice(idx, 0, ...fresh);
    } else if (op === 'remove') {
      sh.rows.splice(index, count || 1);
    }
  });

  socket.on('bulk:focus', ({ sheetId, r, c, userId, username, color }: any) => {
    if (userId === selfUserId.value) return;
    // 同一用户先清除原焦点（任意 sheet）
    for (const sh of sheets) {
      for (const k of Object.keys(sh.focus)) {
        if (sh.focus[k].userId === userId) delete sh.focus[k];
      }
    }
    const sh = sheets.find((s) => s.id === sheetId);
    if (!sh) return;
    sh.focus[`${r}:${c}`] = { userId, username, color };
  });

  socket.on('bulk:blur', ({ userId }: any) => {
    for (const sh of sheets) {
      for (const k of Object.keys(sh.focus)) {
        if (sh.focus[k].userId === userId) delete sh.focus[k];
      }
    }
  });

  socket.on('bulk:presence', ({ users }: any) => {
    presence.value = users || [];
  });

  socket.on('bulk:sheet-op', ({ op, sheet, sheetId, name }: any) => {
    if (op === 'add' && sheet) {
      if (!sheets.find((s) => s.id === sheet.id)) {
        sheets.push(normalizeSheet(sheet));
      }
    } else if (op === 'remove' && sheetId) {
      const idx = sheets.findIndex((s) => s.id === sheetId);
      if (idx >= 0) sheets.splice(idx, 1);
      if (activeSheetId.value === sheetId && sheets.length) {
        activeSheetId.value = sheets[0].id;
        socket?.emit('bulk:active-sheet', { caseSetId: props.caseSetId, sheetId: activeSheetId.value });
      }
    } else if (op === 'rename' && sheetId) {
      const sh = sheets.find((s) => s.id === sheetId);
      if (sh) sh.name = name;
    }
  });
}

function disconnect() {
  if (socket) {
    try { socket.emit('bulk:leave', { caseSetId: props.caseSetId }); } catch {}
    socket.disconnect();
    socket = null;
  }
  connected.value = false;
}
function onClose() { disconnect(); }

// ===== sheet ops =====
function switchSheet(id: string) {
  if (activeSheetId.value === id) return;
  activeSheetId.value = id;
  cellRefs.clear();
  socket?.emit('bulk:active-sheet', { caseSetId: props.caseSetId, sheetId: id });
  nextTick(() => focusCell(0, 0));
}
function addSheet() {
  if (!socket) return;
  socket.emit('bulk:sheet-op', { caseSetId: props.caseSetId, op: 'add' });
}
async function renameSheet(sh: Sheet) {
  try {
    const { value } = await ElMessageBox.prompt('重命名 Sheet', '提示', {
      inputValue: sh.name,
      inputValidator: (v) => (v && v.trim() ? true : '名称不能为空'),
    });
    socket?.emit('bulk:sheet-op', { caseSetId: props.caseSetId, op: 'rename', sheetId: sh.id, name: value.trim() });
  } catch {}
}
async function removeSheet(sh: Sheet) {
  if (sheets.length <= 1) return ElMessage.warning('至少保留 1 个 Sheet');
  try {
    await ElMessageBox.confirm(`确认删除 Sheet「${sh.name}」？该 Sheet 下 ${sh.rows.length} 行数据将丢失。`, '提示', { type: 'warning' });
    socket?.emit('bulk:sheet-op', { caseSetId: props.caseSetId, op: 'remove', sheetId: sh.id });
  } catch {}
}
function sheetName(id: string) {
  return sheets.find((s) => s.id === id)?.name || '';
}

// ===== rows ops =====
function addRows(n: number) {
  if (!socket || !activeSheet.value) return;
  const sid = activeSheet.value.id;
  socket.emit('bulk:row-op', { caseSetId: props.caseSetId, sheetId: sid, op: 'add', index: activeSheet.value.rows.length, count: n });
  for (let i = 0; i < n; i++) activeSheet.value.rows.push(rowDefaults());
}
function removeRow(i: number) {
  if (!socket || !activeSheet.value) return;
  const sid = activeSheet.value.id;
  socket.emit('bulk:row-op', { caseSetId: props.caseSetId, sheetId: sid, op: 'remove', index: i, count: 1 });
  activeSheet.value.rows.splice(i, 1);
}

// ===== cell change =====
function onLocalChange(r: number, c: number, key: keyof Row, value: any) {
  if (!activeSheet.value) return;
  const sid = activeSheet.value.id;
  markLocal(sid, r, c, key);
  socket?.emit('bulk:cell-change', { caseSetId: props.caseSetId, sheetId: sid, r, c, key, value });
}

// ===== focus =====
function bindCell(el: any, r: number, c: number) {
  if (!el) return;
  const node: HTMLElement = (el as any)?.$el || el;
  if (!(node instanceof HTMLElement)) return;
  cellRefs.set(`${r}:${c}`, node);
}
function focusCell(r: number, c: number) {
  const el = cellRefs.get(`${r}:${c}`);
  if (el) {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try { el.select?.(); } catch {}
    }
  }
}
function onFocus(r: number, c: number) {
  if (!activeSheet.value) return;
  focusedCell.value = { r, c };
  socket?.emit('bulk:focus', { caseSetId: props.caseSetId, sheetId: activeSheet.value.id, r, c });
}
function onBlur() {
  focusedCell.value = null;
  socket?.emit('bulk:blur', { caseSetId: props.caseSetId });
}
function onKey(e: KeyboardEvent, r: number, c: number) {
  if (!activeSheet.value) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    let nc = c + dir;
    let nr = r;
    if (nc < 0) { nr--; nc = COL_KEYS.length - 1; }
    if (nc >= COL_KEYS.length) { nr++; nc = 0; }
    if (nr < 0) return;
    if (nr >= activeSheet.value.rows.length) addRows(1);
    nextTick(() => focusCell(nr, nc));
  } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
    if (r + 1 >= activeSheet.value.rows.length) addRows(1);
    nextTick(() => focusCell(r + 1, c));
  }
}

function cellStyle(r: number, c: number) {
  const f = activeSheet.value?.focus[`${r}:${c}`];
  if (!f || f.userId === selfUserId.value) return {};
  return {
    boxShadow: `inset 0 0 0 2px ${f.color}`,
    background: hexToRgba(f.color, 0.08),
  };
}
function badgeOf(r: number, c: number): FocusInfo | null {
  const f = activeSheet.value?.focus[`${r}:${c}`];
  if (!f || f.userId === selfUserId.value) return null;
  return f;
}
function hexToRgba(hex: string, a: number) {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function initials(name: string) {
  if (!name) return '?';
  const s = String(name).trim();
  return s.slice(0, 2);
}

// ===== paste =====
function parseTSV(text: string): string[][] {
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
  if (!norm) return [];
  return norm.split('\n').map((line) => line.split('\t'));
}
function setCellValue(row: Row, colIdx: number, raw: string) {
  const key = COL_KEYS[colIdx];
  if (!key) return;
  const val = raw ?? '';
  if (key === 'priority') {
    const v = val.trim().toUpperCase();
    if (['P0', 'P1', 'P2', 'P3'].includes(v)) row.priority = v;
  } else {
    (row as any)[key] = val;
  }
}
function onPaste(e: ClipboardEvent) {
  if (!activeSheet.value) return;
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  const grid = parseTSV(text);
  if (!grid.length) return;
  if (grid.length === 1 && grid[0].length <= 1) return;
  e.preventDefault();
  const start = focusedCell.value || { r: 0, c: 0 };
  let dataRows = grid;
  if (
    grid[0].length >= 2 &&
    grid[0].slice(0, Math.min(grid[0].length, HEADER.length)).join('|') ===
      HEADER.slice(0, grid[0].length).join('|')
  ) {
    dataRows = grid.slice(1);
  }
  const need = start.r + dataRows.length;
  if (need > activeSheet.value.rows.length) addRows(need - activeSheet.value.rows.length);
  for (let i = 0; i < dataRows.length; i++) {
    const r = start.r + i;
    const row = activeSheet.value.rows[r];
    if (!row) continue;
    for (let j = 0; j < dataRows[i].length; j++) {
      const c = start.c + j;
      if (c >= COL_KEYS.length) break;
      setCellValue(row, c, dataRows[i][j]);
      onLocalChange(r, c, COL_KEYS[c], (row as any)[COL_KEYS[c]]);
    }
  }
  ElMessage.success(`已粘贴 ${dataRows.length} 行 × ${dataRows[0].length} 列`);
}
async function copyHeader() {
  try {
    await navigator.clipboard.writeText(HEADER.join('\t'));
    ElMessage.success('表头已复制，可粘到 Excel 第一行');
  } catch {
    ElMessage.warning('复制失败');
  }
}

// ===== save =====
function buildModulePath(sh: Sheet, r: Row): string[] {
  // 一级模块 = 当前 sheet 名称（用例树主节点）
  const root = (sh.name || '').trim() || '默认';
  const lvl2 = (r.subModule || '').trim() || '默认';
  const lvl3 = (r.subFunction || '').trim() || '默认';
  const lvl4 = (r.testItem || '').trim() || '默认';
  return [root, lvl2, lvl3, lvl4];
}
function buildTags(r: Row): string[] {
  return [r.tag1, r.tag2, r.tag3, r.tag4, r.tag5].map((t) => (t || '').trim()).filter(Boolean);
}

async function onSave() {
  // 收集所有 sheet 的有效行（带 sheet 引用，以便用 sheet 名做主节点）
  const all: { sheet: Sheet; row: Row }[] = [];
  for (const sh of sheets) {
    for (const r of sh.rows) {
      if (r.title.trim() && r.expectedResult.trim()) all.push({ sheet: sh, row: r });
    }
  }
  if (!all.length) {
    return ElMessage.warning('没有可保存的行（用例名称与预期结果均必填）');
  }
  saving.value = true;
  try {
    const items = all.map(({ sheet, row: r }) => {
      const dto: any = {
        title: r.title.trim(),
        priority: r.priority,
        precondition: r.precondition,
        steps: r.steps,
        testData: r.testData,
        expectedResult: r.expectedResult,
        modulePath: buildModulePath(sheet, r),
        tags: buildTags(r),
      };
      const code = (r.code || '').trim();
      if (code) dto.code = code;
      return dto;
    });
    // 分批提交（每批 2000 条），既能显示进度，也避免单请求过大/超时
    const CHUNK = 2000;
    let ok = 0;
    let fail = 0;
    saveProgress.value = { done: 0, total: items.length };
    for (let i = 0; i < items.length; i += CHUNK) {
      const part = items.slice(i, i + CHUNK);
      const res: any = await caseSetApi.bulkCreateCases(props.caseSetId, part);
      ok += res?.ok ?? 0;
      fail += res?.fail ?? 0;
      saveProgress.value = { done: Math.min(i + CHUNK, items.length), total: items.length };
    }
    if (fail === 0) {
      ElMessage.success(`已新增 ${ok} 条用例`);
      emit('saved');
      emit('update:modelValue', false);
    } else {
      ElMessage.warning(`新增成功 ${ok} 条，失败 ${fail} 条`);
      emit('saved');
    }
  } catch (e: any) {
    ElMessage.error(`保存失败：${e?.message || '未知错误'}`);
  } finally {
    saving.value = false;
    saveProgress.value = { done: 0, total: 0 };
  }
}
</script>

<style scoped>
.xls-wrap {
  max-height: 56vh;
  overflow: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px 4px 0 0;
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
.xls tbody tr.invalid td { background: #fff7e6; }
.xls td.idx {
  text-align: center;
  background: #fafafa;
  color: #909399;
  padding: 4px 6px;
  font-variant-numeric: tabular-nums;
}
.xls td.op { text-align: center; }
.xls input,
.xls select,
.xls textarea {
  width: 100%;
  border: none;
  outline: none;
  padding: 6px 8px;
  font: inherit;
  background: transparent;
  resize: vertical;
  box-sizing: border-box;
  min-height: 32px;
  line-height: 1.5;
}
.xls textarea { font-family: inherit; }
.xls input:focus,
.xls select:focus,
.xls textarea:focus {
  background: #ecf5ff;
  box-shadow: inset 0 0 0 2px #409eff;
}
.xls th .req { color: #f56c6c; }
.cell-badge {
  position: absolute;
  top: -8px;
  right: -2px;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,.15);
  pointer-events: none;
  z-index: 1;
}
.presence-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
.sheet-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-top: none;
  border-radius: 0 0 4px 4px;
  background: #fafafa;
  overflow-x: auto;
}
.sheet-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px 4px 0 0;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  user-select: none;
}
.sheet-tab.active {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
  font-weight: 600;
}
.sheet-tab:hover { background: #f5f7fa; }
.sheet-tab.active:hover { background: #d9ecff; }
.sheet-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.sheet-count {
  background: #e4e7ed;
  color: #606266;
  border-radius: 8px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
}
.sheet-tab.active .sheet-count { background: #409eff; color: #fff; }
.sheet-close {
  font-size: 12px;
  color: #909399;
  border-radius: 50%;
  padding: 2px;
}
.sheet-close:hover { background: #f56c6c; color: #fff; }
.sheet-add { margin-left: 4px; }
</style>
