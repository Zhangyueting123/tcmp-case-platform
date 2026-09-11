<!--
  @author zhangyueting
  @date 2026-07-28
-->
<template>
  <div class="page" style="padding: 16px">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <span style="font-size: 18px; font-weight: 600">{{ review?.title }}</span>
      <el-tag v-if="review" :type="statusType(review.status)" size="small">{{ statusText(review.status) }}</el-tag>
      <el-tag size="small" type="info">用例集：{{ review?.caseSetName }}</el-tag>
      <div style="flex: 1" />
      <el-button v-if="review" :loading="exporting" @click="exportComments">导出评审意见</el-button>
      <el-radio-group v-model="viewMode" size="small" style="margin-right: 8px">
        <el-radio-button label="split">分栏</el-radio-button>
        <el-radio-button label="flat">平铺</el-radio-button>
      </el-radio-group>
      <template v-if="isInitiator && review">
        <el-button
          v-if="review.status === 'IN_REVIEW'"
          @click="openReviewers"
        >管理评审成员</el-button>
        <el-button
          v-if="review.status === 'IN_REVIEW'"
          type="primary"
          plain
          @click="openAddCases"
        >添加用例</el-button>
        <el-button
          v-if="review.status === 'IN_REVIEW'"
          type="warning"
          @click="onEndReview"
        >结束评审</el-button>
        <el-button
          v-if="review.status === 'REVISING'"
          type="success"
          @click="onClose"
        >关闭评审</el-button>
      </template>
      <el-button
        v-if="isReviewer && review && review.status === 'IN_REVIEW'"
        :type="myCompleted ? 'success' : 'primary'"
        :plain="myCompleted"
        @click="onToggleComplete"
      >{{ myCompleted ? '✓ 已完成评审（点击撤销）' : '评审完成' }}</el-button>
    </div>

    <div v-if="review" style="margin-bottom: 12px; color: #606266; font-size: 13px">
      发起人：{{ review.initiatorName }}　评审成员：
      <el-tag
        v-for="r in review.reviewers"
        :key="r.id"
        size="small"
        :type="r.completed ? 'success' : 'info'"
        :effect="r.completed ? 'dark' : 'light'"
        style="margin-right: 4px"
      >{{ r.completed ? '✓ ' : '' }}{{ r.name }}</el-tag>
      <el-tag v-if="review.allReviewersCompleted" size="small" type="success" style="margin-left: 4px">全部评审完成</el-tag>
      　用例数：{{ review.cases.length }}
    </div>

    <div v-if="review" style="margin-bottom: 12px; display: flex; align-items: center; gap: 12px">
      <el-switch v-model="prioritizeComments" active-text="有意见优先" inline-prompt style="--el-switch-on-color: #e6a23c" />
      <el-radio-group v-model="commentFilter" size="small">
        <el-radio-button label="ALL">全部用例</el-radio-button>
        <el-radio-button label="WITH">只看有意见（{{ withCommentCount }}）</el-radio-button>
        <el-radio-button label="UNRESOLVED">只看未处理（{{ unresolvedCaseCount }}）</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 整体意见 / 建议 -->
    <div v-if="review" class="card overall-card">
      <div class="overall-head">
        <el-icon><ChatLineSquare /></el-icon>
        <span>整体意见 / 建议</span>
        <el-tag size="small" type="info">{{ overallComments.length }}</el-tag>
      </div>
      <div v-if="!overallComments.length" style="color: #909399; font-size: 13px">暂无整体意见</div>
      <div
        v-for="c in overallComments"
        :key="c.id"
        class="overall-item"
      >
        <div style="display: flex; align-items: center; gap: 8px">
          <span style="font-weight: 600">{{ c.authorName }}</span>
          <span style="color: #909399; font-size: 12px">{{ formatTime(c.createdAt) }}</span>
        </div>
        <div class="cell-wrap" style="margin-top: 2px">{{ c.content }}</div>
      </div>
      <div v-if="canComment" style="margin-top: 10px; display: flex; gap: 8px; align-items: flex-start">
        <el-input
          v-model="newOverall"
          type="textarea"
          :rows="2"
          maxlength="10000"
          show-word-limit
          placeholder="填写对本次评审的整体意见或建议…"
          style="flex: 1"
        />
        <el-button
          type="primary"
          :loading="postingOverall"
          :disabled="!newOverall.trim()"
          @click="postOverall"
        >提交</el-button>
      </div>
    </div>

    <el-row v-if="viewMode === 'split'" :gutter="12" v-loading="loading">
      <el-col :span="8">
        <div class="card" style="max-height: 74vh; overflow: auto; padding: 0">
          <el-table
            :data="pagedSplitCases"
            border
            height="74vh"
            highlight-current-row
            @current-change="onSelect"
          >
            <el-table-column label="编号" width="110" prop="code" />
            <el-table-column label="等级" width="64" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="priorityType(row.priority)">{{ row.priority }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="150">
              <template #default="{ row }">
                <el-tag v-if="row.caseSetName" size="small" type="warning" effect="plain" style="margin-bottom: 2px">{{ row.caseSetName }}</el-tag>
                <div v-if="row.modulePath" class="module-path">{{ row.modulePath }}</div>
                <div class="cell-wrap">{{ row.title }}</div>
              </template>
            </el-table-column>
            <el-table-column label="意见" min-width="180">
              <template #default="{ row }">
                <div v-if="commentsOf(row.id).length" class="opinion-cell">
                  <div
                    v-for="cm in commentsOf(row.id)"
                    :key="cm.id"
                    class="opinion-line"
                    :class="{ resolved: cm.resolved }"
                  >
                    <span class="opinion-author">{{ cm.authorName }}：</span>{{ cm.content }}
                  </div>
                </div>
                <span v-else style="color: #c0c4cc">—</span>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-if="displayCases.length > splitPageSize"
            background
            small
            layout="total, prev, pager, next, sizes"
            :total="displayCases.length"
            :page-sizes="[50, 100, 200, 500]"
            v-model:current-page="splitPage"
            v-model:page-size="splitPageSize"
            style="margin-top: 8px; justify-content: flex-end"
          />
        </div>
      </el-col>

      <el-col :span="16">
        <div v-if="selectedCase" class="card" style="max-height: 74vh; overflow: auto">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
            <el-tag size="small">{{ selectedCase.code }}</el-tag>
            <span style="font-weight: 600">{{ selectedCase.title }}</span>
            <el-tag size="small" type="info">{{ selectedCase.priority }}</el-tag>
            <el-tag size="small" type="info">v{{ selectedCase.currentVersion }}</el-tag>
            <div style="flex: 1" />
            <el-button
              v-if="canRevise"
              type="primary"
              size="small"
              @click="openRevise"
            >修订此用例</el-button>
            <el-button
              v-if="isInitiator && review.status === 'IN_REVIEW'"
              type="danger"
              plain
              size="small"
              @click="onRemoveCase(selectedCase)"
            >移出评审</el-button>
          </div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="模块路径">{{ selectedCase.modulePath }}</el-descriptions-item>
            <el-descriptions-item label="前置条件"><pre class="cell-wrap">{{ selectedCase.precondition }}</pre></el-descriptions-item>
            <el-descriptions-item label="测试步骤"><pre class="cell-wrap">{{ selectedCase.steps }}</pre></el-descriptions-item>
            <el-descriptions-item label="测试数据"><pre class="cell-wrap">{{ selectedCase.testData }}</pre></el-descriptions-item>
            <el-descriptions-item label="预期结果"><pre class="cell-wrap">{{ selectedCase.expectedResult }}</pre></el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">评审意见（{{ selectedComments.length }}）</el-divider>
          <div v-if="!selectedComments.length" style="color: #909399; font-size: 13px">暂无评审意见</div>
          <div
            v-for="c in selectedComments"
            :key="c.id"
            style="border-bottom: 1px solid #ebeef5; padding: 8px 0"
          >
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-weight: 600">{{ c.authorName }}</span>
              <span style="color: #909399; font-size: 12px">{{ formatTime(c.createdAt) }}</span>
              <el-tag v-if="c.resolved" size="small" type="success">已处理</el-tag>
              <div style="flex: 1" />
              <el-button
                v-if="isInitiator"
                link
                :type="c.resolved ? 'info' : 'primary'"
                size="small"
                @click="toggleResolve(c)"
              >{{ c.resolved ? '标记未处理' : '标记已处理' }}</el-button>
            </div>
            <div class="cell-wrap" style="margin-top: 4px">{{ c.content }}</div>
          </div>

          <div v-if="canComment" style="margin-top: 12px">
            <el-input
              v-model="newComment"
              type="textarea"
              :rows="3"
              maxlength="10000"
              show-word-limit
              placeholder="填写评审意见…"
            />
            <div style="margin-top: 8px; text-align: right">
              <el-button
                type="primary"
                :loading="posting"
                :disabled="!newComment.trim()"
                @click="postComment"
              >提交意见</el-button>
            </div>
          </div>
          <el-alert
            v-else-if="review && review.status !== 'IN_REVIEW'"
            style="margin-top: 12px"
            type="info"
            :closable="false"
            title="评审已结束，评论区只读"
          />
        </div>
        <el-empty v-else description="从左侧选择一条用例查看" />
      </el-col>
    </el-row>

    <!-- 平铺模式：所有用例竖排展开（分页 + 轻量渲染，避免上百条卡顿） -->
    <div v-else v-loading="loading">
      <el-empty v-if="!review?.cases?.length" description="暂无用例" />
      <el-empty v-else-if="!displayCases.length" description="没有符合筛选条件的用例" />
      <template v-else>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px">
          <span style="color: #909399; font-size: 13px">共 {{ displayCases.length }} 条</span>
          <div style="flex: 1" />
          <el-pagination
            background
            layout="prev, pager, next, sizes, jumper"
            :total="displayCases.length"
            :page-sizes="[20, 50, 100, 200]"
            v-model:current-page="flatPage"
            v-model:page-size="flatPageSize"
          />
        </div>
        <div
          v-for="c in pagedFlatCases"
          :key="c.id"
          class="card"
          style="margin-bottom: 12px"
        >
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
            <el-tag size="small">{{ c.code }}</el-tag>
            <el-tag v-if="c.caseSetName" size="small" type="warning" effect="plain">{{ c.caseSetName }}</el-tag>
            <span style="font-weight: 600">{{ c.title }}</span>
            <el-tag size="small" :type="priorityType(c.priority)">{{ c.priority }}</el-tag>
            <el-tag size="small" type="info">v{{ c.currentVersion }}</el-tag>
            <span v-if="c.modulePath" class="module-path">{{ c.modulePath }}</span>
            <div style="flex: 1" />
            <el-badge
              v-if="c.commentCount"
              :value="c.commentCount"
              :type="c.unresolvedCount ? 'danger' : 'info'"
            />
            <el-button
              v-if="canRevise"
              type="primary"
              size="small"
              @click="openReviseFor(c)"
            >修订此用例</el-button>
            <el-button
              v-if="isInitiator && review.status === 'IN_REVIEW'"
              type="danger"
              plain
              size="small"
              @click="onRemoveCase(c)"
            >移出评审</el-button>
          </div>
          <div class="kv"><span class="kv-label">前置条件</span><pre class="cell-wrap">{{ c.precondition }}</pre></div>
          <div class="kv"><span class="kv-label">测试步骤</span><pre class="cell-wrap">{{ c.steps }}</pre></div>
          <div class="kv"><span class="kv-label">测试数据</span><pre class="cell-wrap">{{ c.testData }}</pre></div>
          <div class="kv"><span class="kv-label">预期结果</span><pre class="cell-wrap">{{ c.expectedResult }}</pre></div>

          <div class="flat-comments-title">评审意见（{{ commentsOf(c.id).length }}）</div>
          <div v-if="!commentsOf(c.id).length" style="color: #909399; font-size: 13px">暂无评审意见</div>
          <div
            v-for="cm in commentsOf(c.id)"
            :key="cm.id"
            style="border-bottom: 1px solid #ebeef5; padding: 6px 0"
          >
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-weight: 600">{{ cm.authorName }}</span>
              <span style="color: #909399; font-size: 12px">{{ formatTime(cm.createdAt) }}</span>
              <el-tag v-if="cm.resolved" size="small" type="success">已处理</el-tag>
              <div style="flex: 1" />
              <el-button
                v-if="isInitiator"
                link
                :type="cm.resolved ? 'info' : 'primary'"
                size="small"
                @click="toggleResolve(cm)"
              >{{ cm.resolved ? '标记未处理' : '标记已处理' }}</el-button>
            </div>
            <div class="cell-wrap" style="margin-top: 4px">{{ cm.content }}</div>
          </div>

          <template v-if="canComment">
            <!-- 懒加载评论框：点击「写意见」再渲染 textarea，避免上百个 textarea 同时挂载 -->
            <div v-if="openInputs[c.id]" style="margin-top: 10px; display: flex; gap: 8px; align-items: flex-start">
              <el-input
                v-model="flatDrafts[c.id]"
                type="textarea"
                :rows="2"
                maxlength="10000"
                placeholder="填写评审意见…"
                style="flex: 1"
              />
              <el-button
                type="primary"
                :loading="flatPosting === c.id"
                :disabled="!(flatDrafts[c.id] || '').trim()"
                @click="postFlatComment(c.id)"
              >提交</el-button>
            </div>
            <el-button
              v-else
              link
              type="primary"
              size="small"
              style="margin-top: 8px"
              @click="openInputs[c.id] = true"
            >＋ 写评审意见</el-button>
          </template>
        </div>
      </template>
    </div>

    <el-drawer v-model="showRevise" title="修订用例" size="600px">
      <CaseForm v-if="showRevise" v-model="editing" :modules="modules" @saved="onRevised" />
    </el-drawer>

    <!-- 管理评审成员 -->
    <el-dialog v-model="showReviewers" title="管理评审成员" width="480px">
      <el-select
        v-model="reviewerDraft"
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
      <template #footer>
        <el-button @click="showReviewers = false">取消</el-button>
        <el-button
          type="primary"
          :loading="savingReviewers"
          :disabled="!reviewerDraft.length"
          @click="saveReviewers"
        >保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加用例到评审 -->
    <el-dialog v-model="showAddCases" title="添加用例到评审" width="760px" @open="loadCandidates">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
        <el-select
          v-if="review?.multiSet"
          v-model="candSetId"
          placeholder="全部用例集"
          clearable
          style="width: 240px"
          @change="loadCandidates"
        >
          <el-option
            v-for="s in review?.caseSets || []"
            :key="s.id"
            :value="s.id"
            :label="s.name"
          />
        </el-select>
        <el-input v-model="candQuery" placeholder="搜索编号/标题" clearable style="width: 240px" />
        <div style="flex: 1" />
        <span style="color: #909399; font-size: 13px">已选 {{ candSelected.length }} 条</span>
      </div>
      <el-table
        :data="filteredCandidates"
        border
        height="50vh"
        v-loading="candLoading"
        @selection-change="(rows: any[]) => (candSelected = rows)"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column label="编号" width="120" prop="code" />
        <el-table-column v-if="review?.multiSet" label="用例集" width="150" prop="caseSetName" />
        <el-table-column label="等级" width="64" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityType(row.priority)">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">
            <div v-if="row.modulePath" class="module-path">{{ row.modulePath }}</div>
            <div class="cell-wrap">{{ row.title }}</div>
          </template>
        </el-table-column>
        <template #empty>没有可添加的用例</template>
      </el-table>
      <template #footer>
        <el-button @click="showAddCases = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addingCases"
          :disabled="!candSelected.length"
          @click="submitAddCases"
        >添加（{{ candSelected.length }}）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ChatLineSquare } from '@element-plus/icons-vue';
import { reviewApi, caseSetApi, userApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import CaseForm from '../CaseSets/CaseForm.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const id = Number(route.params.id);
const myId = computed(() => auth.user?.id);

const review = ref<any>(null);
const loading = ref(false);
const exporting = ref(false);
const selectedCaseId = ref<number | null>(null);
const newComment = ref('');
const posting = ref(false);
const modules = ref<any[]>([]);
const viewMode = ref<'split' | 'flat'>('split');
const flatDrafts = reactive<Record<number, string>>({});
const flatPosting = ref<number | null>(null);
const flatPage = ref(1);
const flatPageSize = ref(20);
const splitPage = ref(1);
const splitPageSize = ref(100);
const openInputs = reactive<Record<number, boolean>>({});
const moduleCache = reactive<Record<number, any[]>>({});

// 有意见优先 / 筛选
const prioritizeComments = ref(false);
let prioritizedInitialized = false;
const commentFilter = ref<'ALL' | 'WITH' | 'UNRESOLVED'>('ALL');
const withCommentCount = computed(
  () => (review.value?.cases || []).filter((c: any) => c.commentCount > 0).length,
);
const unresolvedCaseCount = computed(
  () => (review.value?.cases || []).filter((c: any) => c.unresolvedCount > 0).length,
);
// 依据筛选 + 排序（有意见优先：未处理数 > 评论数 > 原顺序）得到展示用列表
const displayCases = computed(() => {
  let list = [...(review.value?.cases || [])];
  if (commentFilter.value === 'WITH') list = list.filter((c: any) => c.commentCount > 0);
  else if (commentFilter.value === 'UNRESOLVED') list = list.filter((c: any) => c.unresolvedCount > 0);
  if (prioritizeComments.value) {
    list.sort((a: any, b: any) => {
      if ((b.unresolvedCount || 0) !== (a.unresolvedCount || 0)) return (b.unresolvedCount || 0) - (a.unresolvedCount || 0);
      return (b.commentCount || 0) - (a.commentCount || 0);
    });
  }
  return list;
});
const pagedFlatCases = computed(() => {
  const list = displayCases.value;
  const start = (flatPage.value - 1) * flatPageSize.value;
  return list.slice(start, start + flatPageSize.value);
});
const pagedSplitCases = computed(() => {
  const list = displayCases.value;
  const start = (splitPage.value - 1) * splitPageSize.value;
  return list.slice(start, start + splitPageSize.value);
});
// 筛选/排序/分页大小变化时回到第 1 页
watch([prioritizeComments, commentFilter, flatPageSize, splitPageSize], () => {
  flatPage.value = 1;
  splitPage.value = 1;
});

const isInitiator = computed(() => review.value && review.value.initiatorUserId === myId.value);
const isReviewer = computed(
  () => review.value && (review.value.reviewers || []).some((r: any) => r.id === myId.value),
);
const canComment = computed(
  () => review.value && review.value.status === 'IN_REVIEW' && (isInitiator.value || isReviewer.value),
);
const myCompleted = computed(
  () => review.value && (review.value.completedReviewerIds || []).includes(myId.value),
);
function priorityType(p: string) {
  return p === 'P0' ? 'danger' : p === 'P1' ? 'warning' : p === 'P2' ? 'primary' : 'info';
}
const selectedCase = computed(
  () => (review.value?.cases || []).find((c: any) => c.id === selectedCaseId.value) || null,
);
const selectedComments = computed(() =>
  (review.value?.comments || []).filter((c: any) => c.caseId === selectedCaseId.value),
);
// 按 caseId 索引评论，避免表格每行重复 filter 全量评论列表
const commentMap = computed(() => {
  const map = new Map<number, any[]>();
  for (const c of review.value?.comments || []) {
    if (!map.has(c.caseId)) map.set(c.caseId, []);
    map.get(c.caseId)!.push(c);
  }
  return map;
});
function commentsOf(caseId: number) {
  return commentMap.value.get(caseId) || [];
}

// 整体意见 / 建议（caseId=0 的评论）
const overallComments = computed(() => review.value?.overallComments || []);
const newOverall = ref('');
const postingOverall = ref(false);
async function postOverall() {
  if (!newOverall.value.trim()) return;
  postingOverall.value = true;
  try {
    await reviewApi.addComment(id, { caseId: 0, content: newOverall.value.trim() });
    newOverall.value = '';
    ElMessage.success('已提交');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '提交失败');
  } finally {
    postingOverall.value = false;
  }
}

// 边评审边修订：评审中/修订中（未关闭）发起者均可修订用例
const canRevise = computed(
  () => isInitiator.value && review.value && review.value.status !== 'CLOSED',
);

function statusText(s: string) {
  return s === 'IN_REVIEW' ? '评审中' : s === 'REVISING' ? '修订中' : '已关闭';
}
function statusType(s: string) {
  return s === 'IN_REVIEW' ? 'warning' : s === 'REVISING' ? 'primary' : 'info';
}
function formatTime(t: string) {
  if (!t) return '';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}
function goBack() {
  router.back();
}

async function exportComments() {
  exporting.value = true;
  try {
    const res = await fetch(reviewApi.exportUrl(id), {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    });
    if (!res.ok) {
      let msg = '导出失败';
      try {
        const body = await res.json();
        msg = body.message || msg;
      } catch {
        /* 非 JSON 响应 */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = m ? decodeURIComponent(m[1]) : `review-${id}-comments.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('评审意见已导出');
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    review.value = await reviewApi.detail(id);
    // 修订阶段（发起者）默认「有意见优先」，方便优先处理有评审意见的用例
    if (!prioritizedInitialized && review.value?.status === 'REVISING' && isInitiator.value) {
      prioritizeComments.value = true;
    }
    prioritizedInitialized = true;
    if (review.value?.cases?.length) {
      if (!selectedCaseId.value || !review.value.cases.some((c: any) => c.id === selectedCaseId.value)) {
        selectedCaseId.value = review.value.cases[0].id;
      }
    } else {
      selectedCaseId.value = null;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function onSelect(row: any) {
  if (row) selectedCaseId.value = row.id;
}

async function postComment() {
  if (!selectedCaseId.value || !newComment.value.trim()) return;
  posting.value = true;
  try {
    await reviewApi.addComment(id, { caseId: selectedCaseId.value, content: newComment.value.trim() });
    newComment.value = '';
    ElMessage.success('已提交');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '提交失败');
  } finally {
    posting.value = false;
  }
}

async function toggleResolve(c: any) {
  try {
    await reviewApi.resolveComment(id, c.id, !c.resolved);
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function postFlatComment(caseId: number) {
  const content = (flatDrafts[caseId] || '').trim();
  if (!content) return;
  flatPosting.value = caseId;
  try {
    await reviewApi.addComment(id, { caseId, content });
    flatDrafts[caseId] = '';
    ElMessage.success('已提交');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '提交失败');
  } finally {
    flatPosting.value = null;
  }
}

async function onToggleComplete() {
  try {
    const next = !myCompleted.value;
    await reviewApi.complete(id, next);
    ElMessage.success(next ? '已标记评审完成' : '已撤销完成');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function onEndReview() {
  await ElMessageBox.confirm('结束评审后成员将无法再添加意见，你可开始修订用例。确认结束？', '提示', {
    type: 'warning',
  });
  try {
    await reviewApi.endReview(id);
    ElMessage.success('已结束评审，进入修订');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function onClose() {
  await ElMessageBox.confirm('关闭评审后将归档为只读，确认关闭？', '提示', { type: 'warning' });
  try {
    await reviewApi.close(id);
    ElMessage.success('评审已关闭');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

// ===== 修订 =====
const showRevise = ref(false);
const editing = ref<any>(null);
async function openReviseFor(caseObj: any) {
  if (!caseObj) return;
  const setId = caseObj.caseSetId || review.value?.caseSetId;
  if (setId) {
    try {
      if (!moduleCache[setId]) {
        moduleCache[setId] = ((await caseSetApi.modules(setId)) as any) || [];
      }
      modules.value = moduleCache[setId];
    } catch {
      modules.value = [];
    }
  }
  try {
    // 拉完整用例字段（含 type/testStage/tags），避免部分字段丢失
    const full: any = await caseSetApi.caseDetail(caseObj.id);
    editing.value = { ...full, modulePath: [] };
  } catch {
    editing.value = { ...caseObj, modulePath: [] };
  }
  showRevise.value = true;
}
function openRevise() {
  return openReviseFor(selectedCase.value);
}
async function onRevised() {
  showRevise.value = false;
  ElMessage.success('已修订并生成新版本');
  await load();
}

// ===== 管理评审成员 =====
const users = ref<any[]>([]);
const showReviewers = ref(false);
const reviewerDraft = ref<number[]>([]);
const savingReviewers = ref(false);
async function ensureUsers() {
  if (users.value.length) return;
  try {
    users.value = ((await userApi.list()) as any) || [];
  } catch {
    users.value = [];
  }
}
async function openReviewers() {
  await ensureUsers();
  reviewerDraft.value = [...(review.value?.reviewerUserIds || [])];
  showReviewers.value = true;
}
async function saveReviewers() {
  if (!reviewerDraft.value.length) return;
  savingReviewers.value = true;
  try {
    await reviewApi.setReviewers(id, reviewerDraft.value);
    ElMessage.success('评审成员已更新');
    showReviewers.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '更新失败');
  } finally {
    savingReviewers.value = false;
  }
}

// ===== 添加 / 移除评审用例 =====
const showAddCases = ref(false);
const candidates = ref<any[]>([]);
const candSelected = ref<any[]>([]);
const candLoading = ref(false);
const candSetId = ref<number | undefined>();
const candQuery = ref('');
const addingCases = ref(false);
const filteredCandidates = computed(() => {
  const q = candQuery.value.trim().toLowerCase();
  if (!q) return candidates.value;
  return candidates.value.filter(
    (c: any) =>
      (c.code || '').toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q),
  );
});
function openAddCases() {
  candSetId.value = undefined;
  candQuery.value = '';
  candSelected.value = [];
  showAddCases.value = true;
}
async function loadCandidates() {
  candLoading.value = true;
  try {
    candidates.value = ((await reviewApi.candidateCases(id, candSetId.value)) as any) || [];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
    candidates.value = [];
  } finally {
    candLoading.value = false;
  }
}
async function submitAddCases() {
  if (!candSelected.value.length) return;
  addingCases.value = true;
  try {
    const res: any = await reviewApi.addCases(
      id,
      candSelected.value.map((c: any) => c.id),
    );
    ElMessage.success(`已添加 ${res?.added ?? candSelected.value.length} 条用例`);
    showAddCases.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '添加失败');
  } finally {
    addingCases.value = false;
  }
}
async function onRemoveCase(caseObj: any) {
  if (!caseObj) return;
  try {
    await ElMessageBox.confirm(
      `确认将用例「${caseObj.code} ${caseObj.title}」移出本次评审？其在本评审下的意见也会一并删除。`,
      '移出评审',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await reviewApi.removeCase(id, caseObj.id);
    ElMessage.success('已移出评审');
    if (selectedCaseId.value === caseObj.id) selectedCaseId.value = null;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

onMounted(load);
</script>

<style scoped>
.card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
}
.cell-wrap {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: inherit;
}
.module-path {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
  word-break: break-word;
}
.kv {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #f0f0f0;
}
.kv-label {
  flex: 0 0 72px;
  color: #909399;
  font-size: 13px;
}
.flat-comments-title {
  margin: 10px 0 6px;
  font-weight: 600;
  font-size: 13px;
  color: #606266;
}
.overall-card {
  margin-bottom: 12px;
}
.overall-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.overall-item {
  border-bottom: 1px solid #ebeef5;
  padding: 6px 0;
}
.overall-item:last-of-type {
  border-bottom: none;
}
.opinion-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.opinion-line {
  font-size: 12px;
  line-height: 1.4;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
}
.opinion-line.resolved {
  color: #909399;
  text-decoration: line-through;
}
.opinion-author {
  color: #409eff;
  font-weight: 600;
}
</style>
