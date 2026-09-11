<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack" style="margin-right:8px">返回</el-button>
      轮次报告：{{ data?.round?.name }}
      <el-button type="primary" link @click="exportExcel">导出 Excel</el-button>
    </div>

    <el-row :gutter="12" v-if="data">
      <el-col :span="4"><el-card><Stat label="用例总数" :value="data.summary.total" /></el-card></el-col>
      <el-col :span="4"><el-card><Stat label="Pass" :value="data.summary.P" color="#67c23a" /></el-card></el-col>
      <el-col :span="4"><el-card><Stat label="Fail" :value="data.summary.F" color="#f56c6c" /></el-card></el-col>
      <el-col :span="4"><el-card><Stat label="Block" :value="data.summary.BLOCK" color="#e6a23c" /></el-card></el-col>
      <el-col :span="4"><el-card><Stat label="执行率" :value="`${(data.summary.executionRate*100).toFixed(1)}%`" color="#4c8bf5" /></el-card></el-col>
      <el-col :span="4"><el-card><Stat label="通过率" :value="`${(data.summary.passRate*100).toFixed(1)}%`" color="#4c8bf5" /></el-card></el-col>
    </el-row>

    <el-card style="margin-top: 12px" v-if="data">
      <div style="font-weight: 600; margin-bottom: 8px">模块测试充分性（绿≥90% / 黄≥30% / 红&lt;30%）</div>
      <el-table :data="data.moduleCoverage" border>
        <el-table-column prop="moduleName" label="模块" />
        <el-table-column prop="total" label="模块总用例" width="120" />
        <el-table-column label="本轮充分性" width="180">
          <template #default="{ row }">
            <div :style="{ background: rateColor(row.thisRoundRate), padding: '4px 8px', borderRadius: '3px', display: 'inline-block', minWidth: '80px', textAlign: 'center' }">
              {{ (row.thisRoundRate * 100).toFixed(1) }}%
            </div>
          </template>
        </el-table-column>
        <el-table-column label="截止本轮（含本轮）充分性" width="220">
          <template #default="{ row }">
            <div :style="{ background: rateColor(row.cumulativeRate), padding: '4px 8px', borderRadius: '3px', display: 'inline-block', minWidth: '80px', textAlign: 'center' }">
              {{ (row.cumulativeRate * 100).toFixed(1) }}%
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top: 12px" v-if="data">
      <div style="font-weight: 600; margin-bottom: 8px">人员维度</div>
      <el-table :data="data.byUser" border>
        <el-table-column prop="userName" label="执行人" />
        <el-table-column prop="total" label="分配" width="80" />
        <el-table-column prop="P" label="P" width="60" /><el-table-column prop="F" label="F" width="60" />
        <el-table-column prop="BLOCK" label="Block" width="80" />
        <el-table-column label="通过率" width="100">
          <template #default="{ row }">{{ (row.passRate * 100).toFixed(1) }}%</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top: 12px" v-if="data">
      <div style="font-weight: 600; margin-bottom: 8px">缺陷汇总 ({{ data.defects.length }})</div>
      <el-table :data="data.defects" border>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="severity" label="严重" width="100" />
        <el-table-column prop="tbStatus" label="状态" width="100" />
        <el-table-column label="是否稳定复现" width="120">
          <template #default="{ row }">
            {{ ({ STABLE: '稳定复现', HIGH: '高频偶发', LOW: '低频偶发' } as any)[row.occurrenceProb] || row.occurrenceProb }}
          </template>
        </el-table-column>
        <el-table-column label="TB" width="120"><template #default="{ row }"><a :href="row.tbUrl" target="_blank">查看</a></template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { reportApi } from '@/api';

const route = useRoute();
const router = useRouter();
const pid = Number(route.params.id);
const rid = Number(route.params.roundId);
const data = ref<any>(null);
function goBack() { router.push(`/projects/${pid}/rounds/${rid}`); }

const Stat = (props: any) => h('div', {}, [
  h('div', { style: `font-size: 22px; font-weight: 600; color: ${props.color || '#303133'}` }, String(props.value)),
  h('div', { style: 'color: #909399; font-size: 12px' }, props.label),
]);

function rateColor(r: number) {
  if (r >= 0.9) return '#92D050';
  if (r >= 0.3) return '#FFFF00';
  return '#FF0000';
}
async function exportExcel() {
  const res = await fetch(`/api/v1/rounds/${rid}/report/export`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `round-${rid}-report.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => { data.value = await reportApi.get(rid); });
</script>
