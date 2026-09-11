<!--
  @author zhangyueting
  @date 2026-07-28
-->
<template>
  <div class="page" style="padding: 16px">
    <div class="page-title" style="font-size: 18px; font-weight: 600; margin-bottom: 12px">
      我的评审
    </div>
    <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center">
      <el-radio-group v-model="statusFilter" @change="() => 0">
        <el-radio-button label="ALL">全部</el-radio-button>
        <el-radio-button label="IN_REVIEW">评审中</el-radio-button>
        <el-radio-button label="REVISING">修订中</el-radio-button>
        <el-radio-button label="CLOSED">已关闭</el-radio-button>
      </el-radio-group>
      <div style="flex: 1" />
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-table :data="filtered" border v-loading="loading">
      <el-table-column label="标题" min-width="220">
        <template #default="{ row }">
          <el-link type="primary" @click="open(row.id)">{{ row.title }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="用例集" min-width="160" prop="caseSetName" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发起人" width="120" prop="initiatorName" />
      <el-table-column label="角色" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.initiatorUserId === myId ? 'success' : 'info'">
            {{ row.initiatorUserId === myId ? '我发起' : '我参与' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="用例数" width="80" prop="caseCount" align="center" />
      <el-table-column label="评论数" width="80" prop="commentCount" align="center" />
      <el-table-column label="发起时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row.id)">进入</el-button>
        </template>
      </el-table-column>
      <template #empty>暂无评审</template>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { reviewApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const myId = computed(() => auth.user?.id);
const rows = ref<any[]>([]);
const loading = ref(false);
const statusFilter = ref<'ALL' | 'IN_REVIEW' | 'REVISING' | 'CLOSED'>('ALL');

const filtered = computed(() =>
  statusFilter.value === 'ALL'
    ? rows.value
    : rows.value.filter((r) => r.status === statusFilter.value),
);

function statusText(s: string) {
  return s === 'IN_REVIEW' ? '评审中' : s === 'REVISING' ? '修订中' : '已关闭';
}
function statusType(s: string) {
  return s === 'IN_REVIEW' ? 'warning' : s === 'REVISING' ? 'primary' : 'info';
}
function formatTime(t: string) {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    rows.value = ((await reviewApi.mine()) as any) || [];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function open(id: number) {
  router.push(`/reviews/${id}`);
}

onMounted(load);
</script>
