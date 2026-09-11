<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="新建测试轮次"
    width="560px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="120px">
      <el-form-item label="轮次名" required>
        <el-input v-model="form.name" placeholder="如 V2.3 回归 R1" />
      </el-form-item>
      <el-form-item label="被测版本" required>
        <el-input v-model="form.softwareVersion" />
      </el-form-item>
      <el-form-item label="软件路径">
        <el-input v-model="form.softwarePath" placeholder="构建产物路径" />
      </el-form-item>
      <el-form-item label="测试环境">
        <el-input v-model="form.testEnvironment" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="TB 路径">
        <el-input
          v-model="form.tbBugSectionUrl"
          placeholder="粘贴该轮次的 Teambition 缺陷分组 URL（可选，留空则用项目级配置）"
        />
      </el-form-item>
      <el-form-item label="参照上一轮">
        <el-select v-model="form.previousRoundId" clearable filterable placeholder="可选">
          <el-option
            v-for="r in prevRounds"
            :key="r.id"
            :value="r.id"
            :label="`${r.name} (${r.status})`"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <el-alert
      type="info"
      :closable="false"
      style="margin-top: 4px"
      title="创建后将生成草稿轮次。请在轮次详情中进行用例筛选与分配，最后再发布。"
    />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onCreate">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { roundApi } from '@/api';

const props = defineProps<{ modelValue: boolean; projectId: number }>();
const emit = defineEmits(['update:modelValue', 'created']);

const form = reactive<any>({
  name: '',
  softwareVersion: '',
  softwarePath: '',
  testEnvironment: '',
  tbBugSectionUrl: '',
  previousRoundId: null,
});
const prevRounds = ref<any[]>([]);
const loading = ref(false);

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      Object.assign(form, {
        name: '',
        softwareVersion: '',
        softwarePath: '',
        testEnvironment: '',
        tbBugSectionUrl: '',
        previousRoundId: null,
      });
      prevRounds.value = (await roundApi.list(props.projectId)) as any;
    }
  },
);

async function onCreate() {
  if (!form.name || !form.softwareVersion) {
    return ElMessage.warning('请填写轮次名与版本');
  }
  loading.value = true;
  try {
    const r: any = await roundApi.create(props.projectId, form);
    ElMessage.success('已创建草稿轮次');
    emit('created', r);
    emit('update:modelValue', false);
  } finally {
    loading.value = false;
  }
}
</script>
