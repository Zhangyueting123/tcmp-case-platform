<!--
  @author zhangyueting
  @date 2026-08-07
  用例集列表页：勾选多个用例集，一起发起评审。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="发起用例评审（多用例集）"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <el-form label-width="96px">
      <el-form-item label="评审标题">
        <el-input v-model="title" maxlength="200" placeholder="例如：视觉系统用例库 阶段二 联合评审" />
      </el-form-item>
      <el-form-item label="评审用例集">
        <div style="width: 100%">
          <el-tag
            v-for="cs in caseSets"
            :key="cs.id"
            type="info"
            style="margin: 0 6px 6px 0"
          >{{ cs.name }}</el-tag>
          <div style="color: #909399; font-size: 12px">共 {{ caseSets.length }} 个用例集，将纳入其中全部用例</div>
        </div>
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
        :disabled="!title.trim() || !reviewerUserIds.length || !caseSets.length"
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
  caseSets: { id: number; name: string }[];
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved', reviewId: number): void;
}>();

const title = ref('');
const reviewerUserIds = ref<number[]>([]);
const users = ref<any[]>([]);
const saving = ref(false);

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      if (props.caseSets.length && !title.value) {
        title.value = `${props.caseSets.map((c) => c.name).join('、')} 用例评审`;
      }
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
  reviewerUserIds.value = [];
}

async function submit() {
  saving.value = true;
  try {
    const res: any = await reviewApi.createMulti({
      title: title.value.trim(),
      caseSetIds: props.caseSets.map((c) => c.id),
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
