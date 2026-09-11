<!--
  @author zhangyueting
  @date 2026-07-28
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="发起用例评审"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <el-form label-width="96px">
      <el-form-item label="评审标题">
        <el-input v-model="title" maxlength="200" placeholder="例如：2D 匹配优化 阶段二 用例评审" />
      </el-form-item>
      <el-form-item label="评审范围">
        <el-tree-select
          v-model="moduleId"
          :data="scopeOptions"
          :props="{ label: 'name', children: 'children', value: 'id' }"
          node-key="id"
          check-strictly
          clearable
          placeholder="不选=整个用例集；选某模块=其子树"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="评审成员">
        <el-select
          v-model="reviewerUserIds"
          multiple
          filterable
          placeholder="选择参与评审的成员"
          style="width: 100%"
        >
          <el-option
            v-for="u in users"
            :key="u.id"
            :value="u.id"
            :label="`${u.name}（${u.email}）`"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!title.trim() || !reviewerUserIds.length"
        @click="submit"
      >发起</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { reviewApi, userApi } from '@/api';

const props = defineProps<{
  modelValue: boolean;
  caseSetId: number;
  modules: any[];
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved', reviewId: number): void;
}>();

const title = ref('');
const moduleId = ref<number | undefined>();
const reviewerUserIds = ref<number[]>([]);
const users = ref<any[]>([]);
const saving = ref(false);
const scopeOptions = ref<any[]>([]);

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      scopeOptions.value = props.modules || [];
      if (!users.value.length) {
        try {
          users.value = ((await userApi.list()) as any) || [];
        } catch {
          users.value = [];
        }
      }
    }
  },
);

function reset() {
  title.value = '';
  moduleId.value = undefined;
  reviewerUserIds.value = [];
}

async function submit() {
  saving.value = true;
  try {
    const res: any = await reviewApi.create(props.caseSetId, {
      title: title.value.trim(),
      moduleId: moduleId.value ?? null,
      reviewerUserIds: reviewerUserIds.value,
    });
    ElMessage.success('评审已发起');
    emit('update:modelValue', false);
    emit('saved', res?.id);
  } catch (e: any) {
    ElMessage.error(e?.message || '发起失败');
  } finally {
    saving.value = false;
  }
}
</script>
