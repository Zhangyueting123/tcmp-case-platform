<!--
  @author zhangyueting
  @date 2026-07-29
  工作台：聚合当前用户「需要执行的任务」，支持一键进入执行/评审。
-->
<template>
  <div class="page" style="padding: 16px">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px">
      <span style="font-size: 20px; font-weight: 600">工作台</span>
      <span style="color: #909399">你好，{{ auth.user?.name }}</span>
      <div style="flex: 1" />
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <!-- 概览卡片 -->
    <el-row :gutter="12" style="margin-bottom: 16px">
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-num">{{ data.summary?.pendingCaseCount || 0 }}</div>
          <div class="stat-label">待执行用例</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-num">{{ data.summary?.roundCount || 0 }}</div>
          <div class="stat-label">涉及测试轮次</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-num">{{ data.summary?.reviewCount || 0 }}</div>
          <div class="stat-label">待办评审</div>
        </div>
      </el-col>
    </el-row>

    <div v-loading="loading">
      <!-- 待执行用例 -->
      <div class="card" style="margin-bottom: 16px">
        <div class="section-title">
          <el-icon><Tickets /></el-icon>
          <span>待执行用例</span>
          <el-tag size="small" type="warning" v-if="data.executions?.length">{{ data.executions.length }} 个轮次</el-tag>
        </div>
        <el-empty v-if="!data.executions?.length" description="暂无待执行用例" :image-size="80" />
        <el-table
          v-else
          :data="data.executions"
          border
          :default-sort="{ prop: 'createdAt', order: 'descending' }"
        >
          <el-table-column label="项目" min-width="160" prop="projectName" />
          <el-table-column label="测试轮次" min-width="160">
            <template #default="{ row }">
              {{ row.roundName }}
              <el-tag size="small" type="info" style="margin-left: 6px">{{ row.softwareVersion }}</el-tag>
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

      <!-- 待办评审 -->
      <div class="card">
        <div class="section-title">
          <el-icon><ChatLineSquare /></el-icon>
          <span>待办评审</span>
          <el-tag size="small" type="primary" v-if="data.reviews?.length">{{ data.reviews.length }}</el-tag>
        </div>
        <el-empty v-if="!data.reviews?.length" description="暂无待办评审" :image-size="80" />
        <el-table v-else :data="data.reviews" border>
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
.card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 16px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 12px;
}
.stat-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 20px;
  text-align: center;
}
.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: #409eff;
}
.stat-label {
  margin-top: 6px;
  color: #909399;
  font-size: 14px;
}
</style>
