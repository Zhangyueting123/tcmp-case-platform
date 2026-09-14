<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div>
    <div class="stat-grid defect-stat-grid" v-if="data">
      <div class="stat-tile">
        <div class="stat-tile__num">{{ data.total }}</div>
        <div class="stat-tile__label">缺陷总数</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num stat-tile__num--danger">{{ data.open }}</div>
        <div class="stat-tile__label">未关闭</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num stat-tile__num--success">{{ data.closed }}</div>
        <div class="stat-tile__label">已关闭</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num">{{ data.newThisWeek }}</div>
        <div class="stat-tile__label">本周新增</div>
      </div>
    </div>

    <el-row :gutter="12" class="report-section" v-if="data">
      <el-col :span="8"><el-card class="content-card"><div ref="chartSeverity" class="chart-box" /></el-card></el-col>
      <el-col :span="8"><el-card class="content-card"><div ref="chartStatus" class="chart-box" /></el-card></el-col>
      <el-col :span="8"><el-card class="content-card"><div ref="chartAging" class="chart-box" /></el-card></el-col>
    </el-row>

    <el-card class="content-card report-section" v-if="data">
      <div class="report-section__title">近 30 天新增趋势</div>
      <div ref="chartTrend" class="chart-box chart-box--trend" />
    </el-card>

    <el-card class="content-card report-section">
      <div class="report-section__title">缺陷列表</div>
      <div class="data-table">
      <el-table :data="list" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="severity" label="严重" width="100" />
        <el-table-column prop="tbStatus" label="状态" width="100" />
        <el-table-column label="TB 任务" width="220">
          <template #default="{ row }">
            <a v-if="row.tbUrl" :href="row.tbUrl" target="_blank">{{ row.tbTaskId?.slice(0,12) }}…</a>
            <el-tag v-else type="warning" size="small">待关联</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button v-if="!row.tbUrl" link type="primary" @click="openAttach(row)">关联 TB</el-button>
            <el-button link type="danger" @click="removeDefect(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </el-card>

    <el-dialog v-model="attachVisible" title="关联 Teambition 任务" width="520px">
      <p style="color:#909399;margin:0 0 8px">在 Teambition 任务详情页右上角「分享 / 复制链接」拿到 URL：</p>
      <el-input v-model="attachUrl" placeholder="https://www.teambition.com/project/.../task/..." />
      <template #footer>
        <el-button @click="attachVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!attachUrl" @click="doAttach">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { defectApi } from '@/api';

import { ElMessage, ElMessageBox } from 'element-plus';
const props = defineProps<{ projectId: number }>();
const data = ref<any>(null);
const list = ref<any[]>([]);
const attachVisible = ref(false);
const attachUrl = ref('');
const attachTarget = ref<any>(null);

function openAttach(row: any) {
  attachTarget.value = row;
  attachUrl.value = '';
  attachVisible.value = true;
}
async function doAttach() {
  try {
    await defectApi.attachTb(attachTarget.value.id, attachUrl.value);
    ElMessage.success('关联成功');
    attachVisible.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '关联失败');
  }
}
async function removeDefect(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除缺陷 #${row.id}「${row.title}」？`, '提示', { type: 'warning' });
  } catch { return; }
  await defectApi.remove(row.id);
  ElMessage.success('已删除');
  await load();
}
const chartSeverity = ref<HTMLElement>();
const chartStatus = ref<HTMLElement>();
const chartAging = ref<HTMLElement>();
const chartTrend = ref<HTMLElement>();

async function load() {
  data.value = await defectApi.dashboard(props.projectId);
  list.value = await defectApi.list(props.projectId) as any;
  await nextTick();
  draw();
  observe();
}
function draw() {
  if (!data.value) return;
  render(chartSeverity.value, 'severity', {
    title: { text: '按严重程度', left: 'center', textStyle: { fontSize: 13 } },
    tooltip: {}, series: [{ type: 'pie', radius: ['40%','70%'], data: data.value.bySeverity }],
  });
  render(chartStatus.value, 'status', {
    title: { text: '按状态', left: 'center', textStyle: { fontSize: 13 } },
    tooltip: {},
    xAxis: { type: 'category', data: data.value.byStatus.map((x: any) => x.name) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: data.value.byStatus.map((x: any) => x.value), itemStyle: { color: '#4c8bf5' } }],
  });
  render(chartAging.value, 'aging', {
    title: { text: '老化分布(天)', left: 'center', textStyle: { fontSize: 13 } },
    tooltip: {},
    xAxis: { type: 'category', data: data.value.aging.map((x: any) => x.range) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: data.value.aging.map((x: any) => x.value), itemStyle: { color: '#e6a23c' } }],
  });
  render(chartTrend.value, 'trend', {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.value.trend.map((x: any) => x.date.slice(5)) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, areaStyle: {}, data: data.value.trend.map((x: any) => x.created) }],
  });
}

// 复用 echarts 实例；容器尺寸为 0（如处于隐藏的 el-tab-pane 内）时跳过，
// 等 ResizeObserver 检测到容器变可见（尺寸 0→正）后再绘制，避免画出空白。
const charts: Record<string, echarts.ECharts> = {};
function render(el: HTMLElement | undefined, key: string, option: any) {
  if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
  const inst = charts[key] || (charts[key] = echarts.init(el));
  inst.setOption(option);
  inst.resize();
}

let ro: ResizeObserver | undefined;
function observe() {
  if (ro || typeof ResizeObserver === 'undefined') return;
  const el = chartSeverity.value;
  if (!el) return;
  ro = new ResizeObserver(() => draw());
  ro.observe(el);
}

watch(() => props.projectId, load);
onMounted(load);
onBeforeUnmount(() => {
  ro?.disconnect();
  ro = undefined;
  for (const k of Object.keys(charts)) {
    charts[k].dispose();
    delete charts[k];
  }
});
</script>
