<!--
  @author zhangyueting
  @date 2026-07-29
  工作台：聚合当前用户「需要执行的任务」，支持一键进入执行/评审。
-->
<template>
  <div class="page">
    <div class="page-header">
      <span class="page-header__title">工作台</span>
      <span class="page-header__meta">你好，{{ auth.user?.name }}</span>
      <div class="spacer" />
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__num">{{ data.summary?.pendingCaseCount || 0 }}</div>
        <div class="stat-tile__label">待执行用例</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num">{{ data.summary?.roundCount || 0 }}</div>
        <div class="stat-tile__label">涉及测试轮次</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num">{{ data.summary?.reviewCount || 0 }}</div>
        <div class="stat-tile__label">待办评审</div>
      </div>
    </div>

    <div v-loading="loading">
      <div class="content-card">
        <div class="section-head">
          <el-icon><Tickets /></el-icon>
          <span>待执行用例</span>
          <el-tag size="small" type="warning" v-if="data.executions?.length">{{ data.executions.length }} 个轮次</el-tag>
        </div>
        <el-empty v-if="!data.executions?.length" description="暂无待执行用例" :image-size="96" />
        <div v-else class="data-table">
          <el-table
            :data="data.executions"
            stripe
            :default-sort="{ prop: 'createdAt', order: 'descending' }"
          >
            <el-table-column label="项目" min-width="160" prop="projectName" />
            <el-table-column label="测试轮次" min-width="160">
              <template #default="{ row }">
                {{ row.roundName }}
                <el-tag size="small" type="info" class="ml-6">{{ row.softwareVersion }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column
              label="创建时间"
              prop="createdAt"
              width="170"
              sortable
              :sort-method="byCreatedAt"
            >
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="待执行" prop="pendingCount" width="100" align="center" sortable>
              <template #default="{ row }">
                <el-tag type="warning">{{ row.pendingCount }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="goExecute(row)">去执行</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="content-card">
        <div class="section-head">
          <el-icon><ChatLineSquare /></el-icon>
          <span>待办评审</span>
          <el-tag size="small" type="primary" v-if="data.reviews?.length">{{ data.reviews.length }}</el-tag>
        </div>
        <el-empty v-if="!data.reviews?.length" description="暂无待办评审" :image-size="96" />
        <div v-else class="data-table">
          <el-table :data="data.reviews" stripe>
            <el-table-column label="评审标题" min-width="200" prop="title" />
            <el-table-column label="用例集" min-width="150" prop="caseSetName" />
            <el-table-column label="类型" width="100" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.action === 'REVIEW' ? 'warning' : 'success'">{{ row.actionLabel }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="用例数" width="90" align="center" prop="caseCount" />
            <el-table-column
              label="创建时间"
              prop="createdAt"
              width="170"
              sortable
              :sort-method="byCreatedAt"
            >
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="goReview(row)">
                  {{ row.action === 'REVIEW' ? '去评审' : '去修订' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Tickets, ChatLineSquare } from '@element-plus/icons-vue';
import { taskApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const data = ref<any>({ executions: [], reviews: [], summary: {} });
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    data.value = (await taskApi.mine()) as any;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function formatTime(t: string) {
  if (!t) return '-';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN', { hour12: false });
}
function byCreatedAt(a: any, b: any) {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return ta - tb;
}
function goExecute(row: any) {
  router.push(`/projects/${row.projectId}/rounds/${row.roundId}/execute`);
}
function goReview(row: any) {
  router.push(`/reviews/${row.reviewId}`);
}

onMounted(load);
</script>

<style scoped>
.ml-6 {
  margin-left: 6px;
}
.content-card:last-child {
  margin-bottom: 0;
}
</style>
