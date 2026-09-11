<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-form :model="model" label-width="90px" v-if="model">
    <el-form-item label="标题"><el-input v-model="model.title" /></el-form-item>
    <el-form-item label="模块路径">
      <el-input v-model="pathStr" placeholder="模块/子模块/子功能/测试项" />
      <div style="font-size: 12px; color: #909399; margin-top: 4px">用 / 分隔 4 级，留空时编辑现有用例保持原模块</div>
    </el-form-item>
    <el-form-item label="等级">
      <el-select v-model="model.priority"><el-option v-for="p in ['P0','P1','P2','P3']" :key="p" :value="p" :label="p" /></el-select>
    </el-form-item>
    <el-form-item label="类型">
      <el-select v-model="model.type">
        <el-option v-for="t in TYPES" :key="t.v" :value="t.v" :label="t.l" />
      </el-select>
    </el-form-item>
    <el-form-item label="阶段">
      <el-select v-model="model.testStage">
        <el-option v-for="s in STAGES" :key="s.v" :value="s.v" :label="s.l" />
      </el-select>
    </el-form-item>
    <el-form-item label="标签">
      <el-input v-model="tagsStr" placeholder="逗号分隔" />
    </el-form-item>
    <el-form-item label="前置条件"><el-input v-model="model.precondition" type="textarea" :rows="2" /></el-form-item>
    <el-form-item label="测试步骤"><el-input v-model="model.steps" type="textarea" :rows="4" placeholder="1. ... 2. ..." /></el-form-item>
    <el-form-item label="测试数据"><el-input v-model="model.testData" type="textarea" :rows="2" /></el-form-item>
    <el-form-item label="预期结果"><el-input v-model="model.expectedResult" type="textarea" :rows="3" /></el-form-item>
    <el-button type="primary" :loading="loading" @click="save">保存</el-button>
  </el-form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { caseSetApi } from '@/api';

const props = defineProps<{ modelValue: any; modules: any[] }>();
const emit = defineEmits(['update:modelValue', 'saved']);

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const TYPES = [
  { v: 'BUSINESS', l: '业务' }, { v: 'FUNCTION', l: '功能' }, { v: 'API', l: '接口' },
  { v: 'COMPAT', l: '兼容性' }, { v: 'PERF', l: '性能' }, { v: 'SECURITY', l: '安全' },
  { v: 'UX', l: '易用性' }, { v: 'OTHER', l: '其他' },
];
const STAGES = [
  { v: 'SMOKE', l: '冒烟' }, { v: 'SYSTEM', l: '系统' }, { v: 'REGRESSION', l: '回归' },
  { v: 'ACCEPTANCE', l: '验收' }, { v: 'PRE_RELEASE', l: '上线前' },
];

const pathStr = ref((model.value?.modulePath || []).join('/'));
const tagsStr = ref((model.value?.tags || []).join(','));
const loading = ref(false);

async function save() {
  if (!model.value?.title?.trim()) return ElMessage.warning('请填写标题');
  if (!model.value?.expectedResult?.trim()) return ElMessage.warning('请填写预期结果');
  loading.value = true;
  try {
    const dto: any = {
      title: model.value.title,
      priority: model.value.priority,
      type: model.value.type,
      testStage: model.value.testStage,
      precondition: model.value.precondition,
      steps: model.value.steps,
      testData: model.value.testData,
      expectedResult: model.value.expectedResult,
      tags: tagsStr.value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (pathStr.value.trim()) {
      dto.modulePath = pathStr.value.split('/').map((s) => s.trim()).filter(Boolean);
      while (dto.modulePath.length < 4) dto.modulePath.push('默认');
    }
    if (model.value.id) await caseSetApi.updateCase(model.value.id, dto);
    else await caseSetApi.createCase(model.value.caseSetId, dto);
    emit('saved');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally { loading.value = false; }
}
</script>
