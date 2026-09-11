<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="用例筛选"
    width="1080px"
    top="4vh"
    :close-on-click-modal="false"
  >
    <el-steps :active="step" finish-status="success" simple style="margin-bottom: 16px">
      <el-step title="1. 配置筛选条件" description="先定义可复用的多组筛选条件" />
      <el-step title="2. 应用到模块" description="为每个 Sheet/模块挑选要应用的筛选条件" />
    </el-steps>

    <!-- Step 1: 配置筛选条件 -->
    <div v-if="step === 0">
      <el-alert type="info" :closable="false" style="margin-bottom: 10px">
        每条筛选条件是一棵布尔表达式（可嵌套 AND / OR）。命名后，下一步可在不同模块下复用。<br/>
        “全量执行”是一种特殊条件：哪个模块勾选了它，那个模块就取该模块下的全部用例。
      </el-alert>

      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
        <el-button type="primary" size="small" @click="addTemplate(false)">+ 新增筛选条件</el-button>
        <el-button type="success" size="small" @click="addTemplate(true)">+ 新增全量执行</el-button>
        <span style="color:#606266;font-size:13px">共 <b>{{ templates.length }}</b> 条</span>
      </div>

      <div
        v-if="!templates.length"
        style="border:1px dashed #dcdfe6;padding:24px;text-align:center;color:#909399;border-radius:4px"
      >
        （尚未添加筛选条件：点击「+ 新增筛选条件」开始）
      </div>

      <el-collapse v-else v-model="activeTemplates">
        <el-collapse-item
          v-for="(t, i) in templates"
          :key="t.id"
          :name="t.id"
        >
          <template #title>
            <div style="display:flex;align-items:center;gap:8px;width:100%;padding-right:12px">
              <el-tag v-if="t.fullScan" size="small" type="success">全量执行</el-tag>
              <el-tag v-else size="small" type="info">条件 {{ i + 1 }}</el-tag>
              <span style="font-weight:600">{{ t.name || '(未命名)' }}</span>
              <el-button
                size="small"
                type="danger"
                link
                :icon="Delete"
                title="删除该条件"
                style="font-size:18px;padding:4px"
                @click.stop="removeTemplate(i)"
              />
              <span style="color:#909399;font-size:12px;margin-left:auto">
                {{ t.fullScan ? '勾选模块取全部用例' : `${countLeaves(t.expr)} 个条件项` }}
              </span>
            </div>
          </template>
          <div style="padding:0 8px 8px">
            <el-form inline label-position="top" style="margin-bottom:6px">
              <el-form-item label="条件名称">
                <el-input
                  v-model="t.name"
                  size="small"
                  :placeholder="t.fullScan ? '例如：全量执行' : '例如：P0/P1 冒烟'"
                  style="width:280px"
                />
              </el-form-item>
            </el-form>
            <el-alert
              v-if="t.fullScan"
              type="success"
              :closable="false"
              title="全量执行条件"
              description="应用到某个模块 = 该模块下的全部用例都会入池，无需配置表达式。"
            />
            <FilterNode v-else :node="t.expr" :depth="0" @update="(v: any) => (t.expr = v)" />
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- Step 2: 应用到模块 -->
    <div v-else-if="step === 1">
      <el-alert type="info" :closable="false" style="margin-bottom:10px">
        为每个 Sheet/模块挑选要应用的<strong>筛选条件</strong>（可多选）。同一个模块选多条 = 该模块下结果<strong>并集</strong>；不选 = 该模块不参与筛选。
      </el-alert>

      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
        <el-button size="small" link type="primary" @click="applyAllToAll">全部模块应用全部条件</el-button>
        <el-button size="small" link @click="clearAllAssignments">清空全部分配</el-button>
        <span style="color:#606266;font-size:13px;margin-left:auto">
          已分配 <b>{{ assignedCount }}</b> / {{ totalModules }} 个模块 · 匹配 <b>{{ preview.length }}</b> 条用例
        </span>
      </div>

      <div v-if="!caseSources.length" style="color:#909399;padding:24px;text-align:center">
        当前项目用例池为空，请先在项目详情页添加用例。
      </div>

      <div v-else style="max-height:480px;overflow:auto;border:1px solid #ebeef5;border-radius:4px">
        <div v-for="src in caseSources" :key="src.caseSetId" style="padding:8px 12px;border-bottom:1px solid #f0f2f5">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <h4 style="margin:0;font-size:14px">{{ src.caseSetName }}</h4>
            <el-tag size="small" type="info">{{ src.caseSetCode }}</el-tag>
            <span style="color:#909399;font-size:12px">{{ src.topModules.length }} 个 Sheet</span>
          </div>
          <el-table :data="src.topModules" border size="small">
            <el-table-column label="Sheet / 模块" prop="name" min-width="220" />
            <el-table-column label="用例数" prop="count" width="90" align="center" />
            <el-table-column label="应用筛选条件（多选）" min-width="380">
              <template #default="{ row }">
                <el-select
                  :model-value="assignmentMap[key(src.caseSetId, row.id)] || []"
                  @update:model-value="(v: number[]) => setAssign(src.caseSetId, row.id, v)"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="未选择 = 该模块不参与筛选"
                  style="width:100%"
                  size="small"
                  :disabled="!templates.length"
                >
                  <el-option v-for="t in templates" :key="t.id" :value="t.id" :label="t.name || '(未命名)'" />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <el-table
        v-if="preview.length"
        :data="preview.slice(0, 200)"
        border
        max-height="220"
        style="margin-top:10px"
        size="small"
      >
        <el-table-column prop="code" label="编号" width="130" />
        <el-table-column prop="title" label="标题" show-overflow-tooltip />
        <el-table-column prop="priority" label="等级" width="70" />
      </el-table>
      <div v-if="preview.length > 200" style="font-size:12px;color:#909399;margin-top:4px">仅展示前 200 条预览</div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="step > 0" @click="step--">上一步</el-button>
      <el-button v-if="step === 0" type="primary" :disabled="!templates.length" @click="goNext">下一步</el-button>
      <el-button
        v-if="step === 1"
        type="success"
        :icon="View"
        :loading="previewing"
        :disabled="!assignedCount"
        @click="onPreview"
      >预览匹配用例</el-button>
      <el-button v-if="step === 1" type="primary" :loading="saving" @click="onSave">保存筛选</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, View } from '@element-plus/icons-vue';
import { projectApi, roundApi } from '@/api';
import FilterNode from './FilterNode.vue';

const props = defineProps<{
  modelValue: boolean;
  roundId: number;
  projectId: number;
  initialFilterExpr?: any;
  prevRoundId?: number;
}>();
const emit = defineEmits(['update:modelValue', 'saved']);

interface Template {
  id: number;
  name: string;
  fullScan: boolean;
  expr: any;
}

const step = ref(0);
const templates = ref<Template[]>([]);
const activeTemplates = ref<number[]>([]);
const assignmentMap = ref<Record<string, number[]>>({}); // key=caseSetId:topModuleId → templateIds
const caseSources = ref<any[]>([]);
const preview = ref<any[]>([]);
const previewing = ref(false);
const saving = ref(false);

let nextTmplId = 1;
function genId() { return nextTmplId++; }

watch(() => props.modelValue, async (v) => { if (v) await loadAll(); });
onMounted(() => { if (props.modelValue) loadAll(); });

async function loadAll() {
  try {
    caseSources.value = ((await projectApi.caseSources(props.projectId)) as any) || [];
  } catch {
    caseSources.value = [];
  }
  const init = props.initialFilterExpr;
  const parsed = parseInitial(init);
  templates.value = parsed.templates;
  assignmentMap.value = parsed.assignmentMap;
  nextTmplId = (templates.value.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
  activeTemplates.value = templates.value.length ? [templates.value[0].id] : [];
  step.value = 0;
  preview.value = [];
}

function key(csId: number, tmId: number) { return `${csId}:${tmId}`; }

function parseInitial(expr: any): { templates: Template[]; assignmentMap: Record<string, number[]> } {
  if (!expr) return { templates: [], assignmentMap: {} };
  // 新结构 v3：{ templates: [{id,name,expr}], assignments: [{caseSetId, topModuleId, templateIds}], groups: [...] }
  if (Array.isArray(expr.templates)) {
    const tpls: Template[] = expr.templates.map((t: any, i: number) => ({
      id: Number(t.id) || (i + 1),
      name: String(t.name || `条件${i + 1}`),
      fullScan: !!t.fullScan,
      expr: t.expr || { op: 'AND', children: [] },
    }));
    const map: Record<string, number[]> = {};
    for (const a of (expr.assignments || [])) {
      if (!a.caseSetId || !a.topModuleId) continue;
      map[key(a.caseSetId, a.topModuleId)] = (a.templateIds || []).map(Number);
    }
    return { templates: tpls, assignmentMap: map };
  }
  // 旧结构 v2：{ groups: [{caseSetId, topModuleId, expr}] } → 每组转一个匿名 template，并自动分配
  if (Array.isArray(expr.groups)) {
    const tpls: Template[] = [];
    const map: Record<string, number[]> = {};
    const seenExpr = new Map<string, number>(); // 同一 expr JSON 复用同一个 template
    expr.groups.forEach((g: any, i: number) => {
      const isFull = !!(g.expr && g.expr.fullScan);
      const json = JSON.stringify(g.expr || {});
      let tid = seenExpr.get(json);
      if (!tid) {
        tid = i + 1;
        tpls.push({
          id: tid,
          name: isFull ? `全量执行${tpls.filter((x) => x.fullScan).length + 1}` : `条件${tpls.filter((x) => !x.fullScan).length + 1}`,
          fullScan: isFull,
          expr: g.expr || { op: 'AND', children: [] },
        });
        seenExpr.set(json, tid);
      }
      if (g.caseSetId && g.topModuleId) {
        const k = key(g.caseSetId, g.topModuleId);
        if (!map[k]) map[k] = [];
        if (!map[k].includes(tid)) map[k].push(tid);
      }
    });
    return { templates: tpls, assignmentMap: map };
  }
  // 旧结构 v1：单棵布尔树 { op, children }
  if (typeof expr.op === 'string') {
    return {
      templates: [{ id: 1, name: '条件1', fullScan: false, expr }],
      assignmentMap: {},
    };
  }
  return { templates: [], assignmentMap: {} };
}

function addTemplate(isFullScan: boolean = false) {
  const t: Template = {
    id: genId(),
    name: isFullScan ? `全量执行${templates.value.filter((x) => x.fullScan).length + 1}` : `条件${templates.value.filter((x) => !x.fullScan).length + 1}`,
    fullScan: !!isFullScan,
    expr: { op: 'AND', children: [] },
  };
  templates.value.push(t);
  activeTemplates.value = [t.id];
}
function removeTemplate(i: number) {
  const removed = templates.value[i];
  templates.value.splice(i, 1);
  // 同步清掉分配中对它的引用
  for (const k of Object.keys(assignmentMap.value)) {
    assignmentMap.value[k] = (assignmentMap.value[k] || []).filter((id) => id !== removed.id);
    if (!assignmentMap.value[k].length) delete assignmentMap.value[k];
  }
}

function countLeaves(node: any): number {
  if (!node) return 0;
  if (typeof node.op === 'string') {
    return (node.children || []).reduce((s: number, c: any) => s + countLeaves(c), 0);
  }
  return 1;
}

function setAssign(csId: number, tmId: number, v: number[]) {
  const k = key(csId, tmId);
  if (!v?.length) delete assignmentMap.value[k];
  else assignmentMap.value[k] = v;
}

const totalModules = computed(() =>
  caseSources.value.reduce((s, src) => s + (src.topModules?.length || 0), 0),
);
const assignedCount = computed(() => Object.keys(assignmentMap.value).length);

function applyAllToAll() {
  if (!templates.value.length) return ElMessage.warning('请先在第 1 步添加至少一条筛选条件');
  const all = templates.value.map((t) => t.id);
  for (const src of caseSources.value) {
    for (const tm of (src.topModules || [])) {
      assignmentMap.value[key(src.caseSetId, tm.id)] = [...all];
    }
  }
  ElMessage.success(`已为 ${totalModules.value} 个模块全部应用 ${all.length} 条条件`);
}
function clearAllAssignments() {
  assignmentMap.value = {};
  preview.value = [];
}

function goNext() {
  if (!templates.value.length) return ElMessage.warning('请至少添加 1 条筛选条件');
  // 非全量执行条件需至少有一个子项
  const empty = templates.value.find((t) => !t.fullScan && countLeaves(t.expr) === 0);
  if (empty) return ElMessage.warning(`条件「${empty.name}」为空，请添加至少 1 个条件项`);
  step.value = 1;
}

function buildFilterExpr() {
  const tplMap = new Map(templates.value.map((t) => [t.id, t]));
  const groups: any[] = [];
  const assignments: any[] = [];
  for (const [k, ids] of Object.entries(assignmentMap.value)) {
    if (!ids?.length) continue;
    const [csStr, tmStr] = k.split(':');
    const caseSetId = Number(csStr);
    const topModuleId = Number(tmStr);
    assignments.push({ caseSetId, topModuleId, templateIds: ids });
    for (const tid of ids) {
      const t = tplMap.get(tid);
      if (!t) continue;
      const groupExpr = t.fullScan ? { fullScan: true } : t.expr;
      groups.push({ caseSetId, topModuleId, expr: groupExpr });
    }
  }
  return {
    templates: templates.value.map((t) => ({ id: t.id, name: t.name, fullScan: !!t.fullScan, expr: t.expr })),
    assignments,
    groups,
  };
}

async function onPreview() {
  if (!assignedCount.value) return ElMessage.warning('请至少为 1 个模块分配筛选条件');
  previewing.value = true;
  try {
    const expr = buildFilterExpr();
    await roundApi.update(props.roundId, { filterExpr: expr });
    const p: any = await roundApi.preview(props.roundId);
    preview.value = p.cases || [];
    ElMessage.success(`匹配 ${preview.value.length} 条用例`);
  } finally {
    previewing.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    const expr = buildFilterExpr();
    await roundApi.update(props.roundId, { filterExpr: expr });
    ElMessage.success('筛选已保存');
    emit('saved', expr);
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}
</script>
