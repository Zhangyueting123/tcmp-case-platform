<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div :style="{ border: '1px solid #dcdfe6', borderRadius: '4px', padding: '8px', marginTop: '6px', background: depth === 0 ? '#fafafa' : '#fff' }">
    <template v-if="isGroup">
      <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap">
        <el-select :model-value="node.op" @update:model-value="setOp" style="width: 90px" size="small">
          <el-option value="AND" label="AND" />
          <el-option value="OR" label="OR" />
        </el-select>
        <el-button size="small" type="primary" plain @click="addLeaf">+ 条件</el-button>
        <el-button size="small" plain @click="addGroup">+ 嵌套组</el-button>
        <el-button v-if="depth > 0" size="small" type="danger" link @click="emit('delete')">删除本组</el-button>
        <span style="color:#909399;font-size:12px;margin-left:auto">{{ node.children?.length || 0 }} 项</span>
      </div>
      <div v-if="!node.children || node.children.length === 0" style="color:#c0c4cc;font-size:12px;padding:6px 4px">
        （空组：请点击"+ 条件"或"+ 嵌套组"）
      </div>
      <FilterNode
        v-for="(child, i) in node.children"
        :key="i"
        :node="child"
        :depth="depth + 1"
        @update="onChildUpdate(i, $event)"
        @delete="removeChild(i)"
      />
    </template>
    <template v-else>
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap">
        <el-select :model-value="node.field" @update:model-value="onFieldChange"
          style="width: 150px" size="small" filterable>
          <el-option-group label="基本">
            <el-option value="code" label="用例编号" />
            <el-option value="title" label="用例名称" />
          </el-option-group>
          <el-option-group label="模块路径">
            <el-option value="sub1" label="子模块" />
            <el-option value="sub2" label="子功能" />
            <el-option value="sub3" label="测试项" />
          </el-option-group>
          <el-option-group label="属性">
            <el-option value="priority" label="用例等级" />
            <el-option value="type" label="用例类型" />
            <el-option value="executionMode" label="执行方式" />
            <el-option value="testStage" label="测试阶段" />
          </el-option-group>
          <el-option-group label="内容">
            <el-option value="precondition" label="前置条件" />
            <el-option value="steps" label="测试步骤" />
            <el-option value="testData" label="测试数据" />
            <el-option value="expectedResult" label="预期结果" />
          </el-option-group>
          <el-option-group label="标签">
            <el-option value="tag1" label="标签1" />
            <el-option value="tag2" label="标签2" />
            <el-option value="tag3" label="标签3" />
            <el-option value="tag4" label="标签4" />
            <el-option value="tag5" label="标签5" />
          </el-option-group>
          <el-option-group label="历史">
            <el-option value="previousResult" label="上一轮结果" />
          </el-option-group>
        </el-select>

        <!-- 枚举多选 -->
        <el-select v-if="enumOptions" :model-value="node.value" @update:model-value="setValue"
          multiple collapse-tags collapse-tags-tooltip style="min-width: 240px" size="small" placeholder="多选">
          <el-option v-for="o in enumOptions" :key="o.v" :value="o.v" :label="o.l" />
        </el-select>

        <!-- 标签1-5: allow-create 多选 -->
        <el-select v-else-if="isTagField(node.field)"
          :model-value="node.value" @update:model-value="setValue"
          multiple allow-create filterable default-first-option collapse-tags collapse-tags-tooltip
          placeholder="输入值后回车" style="min-width: 240px" size="small">
          <template #empty><span style="padding:0 8px;color:#909399;font-size:12px">输入标签值后回车</span></template>
        </el-select>

        <!-- 文本字段: 操作符 + 输入 -->
        <template v-else-if="isTextField(node.field)">
          <el-select :model-value="node.operator" @update:model-value="setOperator"
            style="width: 100px" size="small">
            <el-option value="CONTAINS" label="包含" />
            <el-option value="NOT_CONTAINS" label="不包含" />
            <el-option value="EQ" label="等于" />
            <el-option value="NEQ" label="不等于" />
          </el-select>
          <el-input :model-value="node.value" @update:model-value="setValue"
            placeholder="输入文本" style="width: 240px" size="small" clearable />
        </template>

        <el-button size="small" type="danger" link @click="emit('delete')">删除</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'FilterNode' });

const props = withDefaults(
  defineProps<{ node: any; depth?: number }>(),
  { depth: 0 },
);
const emit = defineEmits<{
  (e: 'update', value: any): void;
  (e: 'delete'): void;
}>();

const isGroup = computed(() => props.node && typeof props.node.op === 'string');

const ENUM_MAP: Record<string, { v: string; l: string }[]> = {
  priority: [
    { v: 'P0', l: 'P0' }, { v: 'P1', l: 'P1' }, { v: 'P2', l: 'P2' }, { v: 'P3', l: 'P3' },
  ],
  type: [
    { v: 'BUSINESS', l: '业务' }, { v: 'FUNCTION', l: '功能' }, { v: 'API', l: '接口' },
    { v: 'COMPAT', l: '兼容性' }, { v: 'PERF', l: '性能' }, { v: 'SECURITY', l: '安全' },
    { v: 'UX', l: '易用性' }, { v: 'OTHER', l: '其他' },
  ],
  executionMode: [
    { v: 'MANUAL', l: '手工' }, { v: 'AUTO', l: '自动化' }, { v: 'SEMI_AUTO', l: '半自动' },
  ],
  testStage: [
    { v: 'SMOKE', l: '冒烟' }, { v: 'SYSTEM', l: '系统' }, { v: 'REGRESSION', l: '回归' },
    { v: 'ACCEPTANCE', l: '验收' }, { v: 'PRE_RELEASE', l: '上线前' },
  ],
  previousResult: [
    { v: 'P', l: 'Pass' }, { v: 'F', l: 'Fail' }, { v: 'BLOCK', l: 'Block' },
    { v: 'NT', l: 'NotTested' }, { v: 'NP', l: 'NotPlanned' },
  ],
};

const TEXT_FIELDS = new Set([
  'code', 'title', 'precondition', 'steps', 'testData', 'expectedResult',
  'sub1', 'sub2', 'sub3',
]);

const enumOptions = computed(() => ENUM_MAP[props.node?.field] || null);

function isTagField(f?: string) {
  return f === 'tag1' || f === 'tag2' || f === 'tag3' || f === 'tag4' || f === 'tag5';
}
function isTextField(f?: string) {
  return TEXT_FIELDS.has(f || '');
}

function setOp(op: string) { emit('update', { ...props.node, op }); }
function setValue(value: any) { emit('update', { ...props.node, value }); }
function setOperator(operator: string) { emit('update', { ...props.node, operator }); }

function onFieldChange(field: string) {
  let next: any;
  if (ENUM_MAP[field]) {
    next = { field, operator: 'IN', value: [] };
    if (field === 'priority') next.value = ['P0', 'P1'];
    if (field === 'previousResult') next.value = ['F', 'BLOCK'];
  } else if (isTagField(field)) {
    next = { field, operator: 'IN', value: [] };
  } else if (TEXT_FIELDS.has(field)) {
    next = { field, operator: 'CONTAINS', value: '' };
  } else {
    next = { field, operator: 'IN', value: [] };
  }
  emit('update', next);
}

function addLeaf() {
  const children = [...(props.node.children || []), { field: 'priority', operator: 'IN', value: ['P0', 'P1'] }];
  emit('update', { ...props.node, children });
}
function addGroup() {
  const children = [...(props.node.children || []), { op: 'AND', children: [] }];
  emit('update', { ...props.node, children });
}
function removeChild(i: number) {
  const children = [...(props.node.children || [])];
  children.splice(i, 1);
  emit('update', { ...props.node, children });
}
function onChildUpdate(i: number, value: any) {
  const children = [...(props.node.children || [])];
  children[i] = value;
  emit('update', { ...props.node, children });
}
</script>
