<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div>
    <el-alert type="info" :closable="false" style="margin-bottom: 8px">
      可视化构造布尔表达式（AND / OR），叶节点为字段条件。留空则默认匹配项目用例池全部。
    </el-alert>
    <FilterNode :node="root" :depth="0" @update="onRootUpdate" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FilterNode from './FilterNode.vue';

const props = defineProps<{ modelValue: any; prevRoundId?: number }>();
const emit = defineEmits(['update:modelValue']);

const root = computed(() => {
  const v = props.modelValue;
  if (v && typeof v === 'object' && typeof v.op === 'string') return v;
  return { op: 'AND', children: [] };
});

function onRootUpdate(next: any) {
  emit('update:modelValue', next);
}
</script>
