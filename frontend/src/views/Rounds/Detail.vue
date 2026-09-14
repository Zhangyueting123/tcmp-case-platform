<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      {{ round?.name }}
      <el-tag :type="statusType(round?.status)" size="small">{{ round?.status }}</el-tag>
      <span class="page-meta">版本 {{ round?.softwareVersion }}</span>
    </div>
    <div class="toolbar">
      <el-button v-if="canEdit" type="primary" @click="showFilter = true">用例筛选</el-button>
      <el-button v-if="canEdit" type="primary" @click="showAssign = true">分配</el-button>
      <el-button @click="$router.push(`/projects/${pid}/rounds/${rid}/execute`)">进入执行</el-button>
      <el-button @click="$router.push(`/projects/${pid}/rounds/${rid}/report`)">查看报告</el-button>
      <el-button @click="onEditTbUrl">TB 路径</el-button>
      <el-button v-if="round?.status === 'IN_PROGRESS'" type="warning" @click="onPause">暂停</el-button>
      <el-button v-if="round?.status === 'IN_PROGRESS'" type="danger" @click="onClose">关闭轮次</el-button>
      <el-button v-if="round?.status === 'PAUSED' || round?.status === 'DRAFT'" type="success" @click="onPublish">发布</el-button>
    </div>
    <el-card class="content-card">
      <div class="round-stats">
        <Stat label="总数" :value="stat.total" />
        <Stat label="Pass" :value="stat.P" color="#67c23a" />
        <Stat label="Fail" :value="stat.F" color="#f56c6c" />
        <Stat label="Block" :value="stat.BLOCK" color="#e6a23c" />
        <Stat label="NP" :value="stat.NP" color="#909399" />
        <Stat label="NT" :value="stat.NT" color="#9c27b0" />
        <Stat label="Pending" :value="stat.PENDING" color="#c0c4cc" />
        <Stat label="执行率" :value="`${(stat.exec*100).toFixed(1)}%`" color="#4c8bf5" />
        <Stat label="通过率" :value="`${(stat.pass*100).toFixed(1)}%`" color="#4c8bf5" />
      </div>
    </el-card>
    <div class="data-table" style="margin-top: 12px">
    <el-table :data="instances" stripe>
      <el-table-column label="编号" width="120"><template #default="{ row }">{{ row.case?.code }}</template></el-table-column>
      <el-table-column label="标题"><template #default="{ row }">{{ row.case?.title }}</template></el-table-column>
      <el-table-column label="分配人" width="100" prop="assigneeUserId" />
      <el-table-column label="结果" width="100">
        <template #default="{ row }"><span :class="`result-badge result-${row.result}`">{{ row.result }}</span></template>
      </el-table-column>
      <el-table-column label="实际结果" show-overflow-tooltip prop="actualResult" />
    </el-table>
    </div>

    <RoundFilterDialog
      v-if="showFilter"
      v-model="showFilter"
      :round-id="rid"
      :project-id="pid"
      :initial-filter-expr="round?.filterExpr"
      :prev-round-id="round?.previousRoundId"
      @saved="onFilterSaved"
    />
    <RoundAssignDialog
      v-if="showAssign"
      v-model="showAssign"
      :round-id="rid"
      :project-id="pid"
      @assigned="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft } from '@element-plus/icons-vue';
import { roundApi } from '@/api';
import RoundFilterDialog from './RoundFilterDialog.vue';
import RoundAssignDialog from './RoundAssignDialog.vue';

const route = useRoute();
const router = useRouter();
const pid = Number(route.params.id);
const rid = Number(route.params.roundId);
function goBack() { router.push(`/projects/${pid}`); }
const round = ref<any>(null);
const instances = ref<any[]>([]);
const showFilter = ref(false);
const showAssign = ref(false);
const canEdit = computed(() => ['DRAFT', 'PAUSED'].includes(round.value?.status));

const Stat = (props: any) => h('div', { style: 'min-width: 88px' }, [
  h('div', { style: `font-size: 22px; font-weight: 600; color: ${props.color || '#303133'}` }, String(props.value)),
  h('div', { style: 'color: #909399; font-size: 12px' }, props.label),
]);

const stat = computed(() => {
  const cnt: any = { P: 0, F: 0, BLOCK: 0, NP: 0, NT: 0, PENDING: 0 };
  for (const i of instances.value) cnt[i.result]++;
  const total = instances.value.length;
  const denom = total - cnt.NT - cnt.NP;
  const exec = denom > 0 ? (cnt.P + cnt.F + cnt.BLOCK) / denom : 0;
  const pass = cnt.P + cnt.F + cnt.BLOCK > 0 ? cnt.P / (cnt.P + cnt.F + cnt.BLOCK) : 0;
  return { total, ...cnt, exec, pass };
});

function statusType(s?: string) {
  return ({ DRAFT: 'info', IN_PROGRESS: 'success', PAUSED: 'warning', CLOSED: '' } as any)[s || ''];
}
async function load() {
  round.value = await roundApi.detail(rid);
  instances.value = await roundApi.cases(rid) as any;
}
async function onClose() {
  await ElMessageBox.confirm('关闭轮次后不可执行，确认？', '提示', { type: 'warning' });
  await roundApi.close(rid); ElMessage.success('已关闭'); load();
}
async function onPause() { await roundApi.pause(rid); load(); }
async function onPublish() { await roundApi.publish(rid); load(); }
async function onEditTbUrl() {
  const res = await ElMessageBox.prompt(
    '粘贴该轮次的 Teambition 缺陷分组 URL；留空则回退使用项目级配置。',
    '配置 TB 路径（按轮次）',
    {
      inputValue: round.value?.tbBugSectionUrl || '',
      inputPlaceholder: 'https://www.teambition.com/project/xxx/bug/section/yyy',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    },
  ).catch(() => null);
  if (!res) return; // 取消
  await roundApi.update(rid, { tbBugSectionUrl: (res.value || '').trim() });
  ElMessage.success('已更新该轮次的 TB 路径');
  load();
}
function onFilterSaved(expr: any) {
  if (round.value) round.value.filterExpr = expr;
}
onMounted(load);
</script>
