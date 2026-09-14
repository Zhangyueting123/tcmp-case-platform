<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="exec-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" link @click="goBack">返回轮次详情</el-button>
    </div>
    <div class="exec-layout">
    <div class="exec-tree" :style="{ width: treeWidth + 'px' }">
      <div class="exec-tree-head">
        <span>用例</span>
        <span class="exec-tree-meta">{{ doneCount }} / {{ instances.length }}</span>
      </div>
      <el-input v-model="filter" class="tree-filter" placeholder="搜索 标题/编号" clearable size="small" />
      <div class="result-filter">
        <el-radio-group v-model="resultFilter" size="small">
          <el-radio-button label="ALL">全部</el-radio-button>
          <el-radio-button label="PENDING">待执行</el-radio-button>
          <el-radio-button label="P">P</el-radio-button>
          <el-radio-button label="F">F</el-radio-button>
          <el-radio-button label="BLOCK">B</el-radio-button>
        </el-radio-group>
      </div>
      <div class="tree-wrapper">
        <el-tree
          ref="treeRef"
          :data="tree"
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          :filter-node-method="filterNode"
          :default-expanded-keys="defaultExpandedKeys"
          :auto-expand-parent="false"
          :expand-on-click-node="false"
          highlight-current
          draggable
          :allow-drop="allowDrop"
          :allow-drag="allowDrag"
          @node-drop="onNodeDrop"
          @node-click="onNodeClick"
          @node-expand="onNodeExpand"
          @node-collapse="onNodeCollapse"
        >
          <template #default="{ data }">
            <span v-if="data.isLeaf" class="leaf-row" :class="{ 'is-active': data.instanceId === currentId }">
              <span :class="`result-badge result-${data.result}`">{{ data.result === 'PENDING' ? '·' : data.result }}</span>
              <span class="leaf-code">{{ data.code }}</span>
              <span class="leaf-title">{{ data.label }}</span>
            </span>
            <span v-else class="branch-row" :title="data.moduleId ? '拖动可调整模块位置' : undefined">
              {{ data.label }}
              <span class="branch-meta">
                <span v-if="data.passCount" class="dot-p">{{ data.passCount }}</span>
                <span v-if="data.failCount" class="dot-f">{{ data.failCount }}</span>
                <span v-if="data.blockCount" class="dot-b">{{ data.blockCount }}</span>
                <span v-if="data.pendingCount" class="dot-pending">{{ data.pendingCount }}</span>
                <span class="dot-total">/ {{ data.leafCount }}</span>
              </span>
            </span>
          </template>
        </el-tree>
        <div v-if="!filtered.length" class="empty">暂无数据</div>
      </div>
    </div>

    <div class="exec-resizer" @mousedown="startResize" title="拖拽调节宽度"></div>

    <div class="exec-detail" v-if="current">
      <div class="exec-detail-head">
        <h3 class="exec-detail-title">{{ current.case?.code }} · {{ current.case?.title }}</h3>
        <el-tag>{{ current.case?.priority }}</el-tag>
        <el-tag type="info">v{{ current.caseVersion }}</el-tag>
        <el-button size="small" :icon="EditPen" @click="openEditCase">编辑用例</el-button>
        <el-button size="small" type="danger" plain :icon="Delete" @click="onRemoveInstance">从本轮删除</el-button>
      </div>
      <el-descriptions class="case-desc" :column="1" border size="small">
        <el-descriptions-item label="前置条件"><pre class="case-field-pre">{{ current.case?.precondition }}</pre></el-descriptions-item>
        <el-descriptions-item label="测试步骤"><pre class="case-field-pre">{{ current.case?.steps }}</pre></el-descriptions-item>
        <el-descriptions-item label="测试数据"><pre class="case-field-pre">{{ current.case?.testData }}</pre></el-descriptions-item>
        <el-descriptions-item label="预期结果"><pre class="case-field-pre">{{ current.case?.expectedResult }}</pre></el-descriptions-item>
      </el-descriptions>

      <!-- 上一轮执行结果（如有） -->
      <el-alert
        v-if="current.previousResult"
        :type="prevResultAlertType(current.previousResult.result)"
        :closable="false"
        show-icon
        class="prev-result-alert"
      >
        <template #title>
          <span class="prev-result-title">上一轮（{{ current.previousResult.roundName }}）：</span>
          <span :class="`result-badge result-${current.previousResult.result} tag-inline`">
            {{ current.previousResult.result }}
          </span>
          <span v-if="current.previousResult.executedAt" class="exec-tree-meta tag-inline">
            {{ formatTime(current.previousResult.executedAt) }}
          </span>
        </template>
        <div v-if="current.previousResult.actualResult" class="prev-result-line">
          <b>实际结果：</b><span class="pre-wrap">{{ current.previousResult.actualResult }}</span>
        </div>
        <div v-if="current.previousResult.comment" class="prev-result-line">
          <b>备注：</b><span class="pre-wrap">{{ current.previousResult.comment }}</span>
        </div>
      </el-alert>

      <el-divider />
      <el-form label-width="90px">
        <el-form-item label="实际结果">
          <el-input v-model="form.actualResult" type="textarea" :rows="3" placeholder="失败或阻塞时必填" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <div class="exec-result-actions">
        <el-button type="success" @click="setResult('P', true)">P 并跳到下一条 →</el-button>
        <el-button type="success" plain @click="setResult('P')">Pass (P)</el-button>
        <el-button type="danger" @click="setResult('F')">Fail (F)</el-button>
        <el-button type="warning" @click="setResult('BLOCK')">Block (B)</el-button>
        <el-button @click="setResult('NP')">NP</el-button>
        <el-button @click="setResult('NT')">NT</el-button>
        <div class="spacer" />
        <el-button type="primary" link @click="next">下一条 →</el-button>
      </div>

      <el-divider />
      <div class="exec-subhead">
        <div class="exec-subhead__title">关联缺陷</div>
        <span class="exec-subhead__hint">在 TB 提交后复制任务 URL 粘到草稿行的输入框里 → 点「关联」</span>
      </div>
      <div class="data-table">
      <el-table :data="defects" stripe size="small" empty-text="暂无缺陷">
        <el-table-column label="来源轮次" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.isCurrentRound !== false" type="primary" size="small">本轮</el-tag>
            <el-tag v-else type="info" size="small">{{ row.sourceRoundName || '历史轮次' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="TB Task" width="320">
          <template #default="{ row }">
            <template v-if="row.tbTaskId && row.tbTaskId !== 'DRAFT'">
              <a :href="row.tbUrl" target="_blank">{{ row.tbTaskId.slice(0,8) }}…</a>
            </template>
            <template v-else>
              <el-input
                v-model="attachInputs[row.id]"
                size="small"
                placeholder="粘贴 TB 任务 URL"
                clearable
                :disabled="row.isCurrentRound === false"
                @keydown.enter="attachDefect(row.id)"
              />
            </template>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="severity" label="严重" width="80" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.tbTaskId === 'DRAFT'" type="warning" size="small">待关联</el-tag>
            <span v-else>{{ row.tbStatus }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <template v-if="row.isCurrentRound === false">
              <span class="exec-tree-meta">仅查看</span>
            </template>
            <template v-else-if="row.tbTaskId === 'DRAFT'">
              <el-button
                size="small"
                type="primary"
                :loading="attachingId === row.id"
                :disabled="!attachInputs[row.id]"
                @click="attachDefect(row.id)"
              >关联</el-button>
              <el-button size="small" link type="danger" @click="removeDefect(row.id)">删除</el-button>
            </template>
            <template v-else>
              <el-button size="small" link type="primary" :loading="syncingId === row.id" @click="syncDefectStatus(row)">🔄 同步</el-button>
              <el-button size="small" link type="danger" @click="removeDefect(row.id)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </div>

    <!-- 油猜脚本安装引导（F 时如未装则弹出） -->
    <el-dialog v-model="showInstallDialog" title="首次使用：请安装油猜脚本" width="560px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" style="margin-bottom:12px">
        TCMP 依赖一个轻量油猜脚本在 TB 页面里自动点“+ 创建缺陷”，并在你提交后从网络响应里拿到 task ID 回传到 TCMP 自动关联。装一次永久生效。
      </el-alert>
      <ol style="line-height:2;padding-left:18px;margin:0">
        <li>Chrome / Edge 安装 <el-link type="primary" href="https://www.tampermonkey.net/" target="_blank">Tampermonkey 扩展</el-link>（如已装跳过）</li>
        <li>点击右侧按钮打开脚本安装页 → Tampermonkey 会弹“安装”确认 → 点安装</li>
        <li>装好后回这里点“我装好了”，下一次按 F 会自动跳转 TB 并打开创建弹窗</li>
      </ol>
      <div style="margin-top:14px;text-align:center">
        <el-button type="primary" size="large" tag="a" :href="userscriptUrl" target="_blank" rel="noopener">
          📜 打开脚本安装页
        </el-button>
      </div>
      <template #footer>
        <el-button @click="showInstallDialog = false">稍后装</el-button>
        <el-button type="success" @click="onInstalled">我装好了，重试</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDefect" title="提交缺陷" width="720px" :close-on-click-modal="false">
      <!-- 步骤 1：填表 -->
      <el-form v-if="defectStep === 'edit'" :model="defectForm" label-width="110px">
        <el-form-item label="标题"><el-input v-model="defectForm.title" /></el-form-item>
        <el-form-item label="严重程度">
          <el-select v-model="defectForm.severity">
            <el-option v-for="s in ['致命','严重','一般','轻微']" :key="s" :value="s" :label="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="defectForm.priority">
            <el-option v-for="p in ['极高','高','普通','低','极低']" :key="p" :value="p" :label="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否稳定复现">
          <el-select v-model="defectForm.occurrenceProb">
            <el-option value="STABLE" label="稳定复现" />
            <el-option value="HIGH" label="高频偶发" />
            <el-option value="LOW" label="低频偶发" />
          </el-select>
        </el-form-item>
        <el-form-item label="待认领人">
          <el-select v-model="defectForm.assigneeUserId" filterable clearable placeholder="（未指定）">
            <el-option
              v-for="m in projectMembers"
              :key="m.userId"
              :value="m.userId"
              :label="`${userMap[m.userId]?.name || ''}（${m.roleCode}）`"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明"><el-input v-model="defectForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-alert type="info" :closable="false">
          下一步会打开 Teambition 网页，用你自己的账号扫码登录后手工新建任务；
          标题/描述等内容可一键复制粘贴。任务创建好后把 TB 任务 URL 粘回这里即可关联。
        </el-alert>
      </el-form>

      <!-- 步骤 1.5：TB 未登录 → 扫码登录 -->
      <div v-else-if="defectStep === 'login'" style="text-align:center">
        <el-alert type="warning" :closable="false" style="margin-bottom: 16px; text-align:left">
          检测到尚未登录 Teambition。请用手机扫描下方二维码，或点击「在浏览器打开」完成登录。登录后回到这里点「我已完成登录」即可继续。
        </el-alert>
        <div v-if="qrDataUrl" style="margin: 8px 0">
          <img :src="qrDataUrl" alt="TB 登录二维码" style="width: 220px; height: 220px; border: 1px solid #dcdfe6; padding: 8px; background:#fff" />
          <div style="color:#909399; font-size:12px; margin-top:8px">扫码后请在该设备完成 Teambition 登录</div>
        </div>
        <div v-else style="padding:80px 0;color:#909399">二维码生成中…</div>
        <div style="margin-top: 12px">
          <el-button @click="openTbLogin">在浏览器打开登录页 ↗</el-button>
        </div>
      </div>

      <!-- 步骤 2：在 TB 上手动提交 + 回填 URL -->
      <div v-else-if="defectStep === 'tb'">
        <el-alert type="success" :closable="false" style="margin-bottom: 12px">
          已在本系统记录草稿缺陷 #{{ draftDefect?.id }}。点下方按钮会打开 TB 缺陷分组页并自动填表。
        </el-alert>

        <!-- 主流程：window.open 带 hash → UserScript 自动填表 -->
        <el-card shadow="never" style="margin-bottom: 12px; border-color: #67c23a">
          <div class="step-row">
            <span class="step-num" style="background:#67c23a">★</span>
            <div style="flex:1">
              <div style="font-weight:600;margin-bottom:6px">
                ✨ 一键打开 TB 缺陷分组并自动填表
                <el-tag size="small" :type="userscriptInstalled ? 'success' : 'warning'" style="margin-left:6px">
                  {{ userscriptInstalled ? '油猴脚本已就绪' : '首次使用需装油猴脚本' }}
                </el-tag>
              </div>
              <div style="color:#909399;font-size:12px;margin-bottom:8px">
                未登录 TB 会自动跳登录页，扫码登录后会自动跳回缺陷分组并继续自动填表。
              </div>
              <el-button type="success" size="large" @click="openTbAutoFill">
                ✨ 打开 TB 并自动填表 ↗
              </el-button>
              <el-button size="small" link @click="showInstallGuide = !showInstallGuide">
                {{ showInstallGuide ? '收起' : '查看安装指南' }}
              </el-button>
              <div v-if="showInstallGuide" style="margin-top:10px;padding:10px;background:#f5f7fa;border-radius:4px;font-size:12px;line-height:1.7">
                <b>首次使用（约 30 秒）：</b><br />
                1. Chrome/Edge 装 <a href="https://www.tampermonkey.net/" target="_blank">Tampermonkey 扩展</a><br />
                2. 点击 <a :href="userscriptUrl" target="_blank">📜 安装 TCMP TB 自动填表脚本</a>（Tampermonkey 会弹安装确认）<br />
                3. 装完后点击「我已装好」<br />
                <el-button v-if="!userscriptInstalled" size="small" type="primary" style="margin-top:6px" @click="markInstalled">我已装好</el-button>
                <el-button v-else size="small" @click="userscriptInstalled = false; localStorage.removeItem('tcmp_tb_userscript')">重置</el-button>
              </div>
            </div>
          </div>
        </el-card>

        <el-divider content-position="left" style="color:#909399;font-size:12px">不想用脚本？也可手工复制</el-divider>

        <el-card shadow="never" style="margin-bottom: 8px">
          <el-input :model-value="prefill.title" readonly size="small">
            <template #prepend>标题</template>
            <template #append>
              <el-button @click="copy(prefill.title, '标题')">复制</el-button>
            </template>
          </el-input>
        </el-card>
        <el-card shadow="never" style="margin-bottom: 8px">
          <el-input :model-value="prefill.description" type="textarea" :rows="4" readonly />
          <el-button size="small" style="margin-top:6px" @click="copy(prefill.description, '描述')">复制描述</el-button>
          <el-button size="small" style="margin-top:6px" @click="openTb">打开 TB 缺陷分组 ↗</el-button>
        </el-card>

        <el-divider content-position="left" style="color:#909399;font-size:12px">缺陷创建好后，把 TB 任务 URL 粘回这里关联</el-divider>
        <el-input v-model="tbUrlInput" placeholder="https://www.teambition.com/project/.../task/..." clearable />
      </div>

      <template #footer>
        <template v-if="defectStep === 'edit'">
          <el-button @click="showDefect = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="goToTbStep">下一步 →</el-button>
        </template>
        <template v-else-if="defectStep === 'login'">
          <el-button @click="defectStep = 'edit'">← 上一步</el-button>
          <el-button type="primary" @click="confirmTbLogin">我已完成登录 →</el-button>
        </template>
        <template v-else>
          <el-button @click="defectStep = 'edit'">← 上一步</el-button>
          <el-button @click="resetTbLogin" title="如登录态失效，可在这里重置">未登录？重置状态</el-button>
          <el-button @click="skipAttach">跳过关联（仅本地保存）</el-button>
          <el-button type="primary" :disabled="!tbUrlInput" :loading="attaching" @click="doAttach">完成关联</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 编辑用例弹窗 -->
    <el-dialog v-model="showEditCase" title="编辑用例" width="720px" :close-on-click-modal="false">
      <el-form v-if="editForm" :model="editForm" label-width="90px">
        <el-form-item label="标题"><el-input v-model="editForm.title" /></el-form-item>
        <el-form-item label="等级">
          <el-select v-model="editForm.priority">
            <el-option v-for="p in ['P0','P1','P2','P3']" :key="p" :value="p" :label="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="前置条件">
          <el-input v-model="editForm.precondition" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="测试步骤">
          <el-input v-model="editForm.steps" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="测试数据">
          <el-input v-model="editForm.testData" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="预期结果">
          <el-input v-model="editForm.expectedResult" type="textarea" :rows="3" />
        </el-form-item>
        <el-alert type="warning" :closable="false">
          保存后将以新版本发布到用例集，本轮次实例同步升级到新版本。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showEditCase = false">取消</el-button>
        <el-button type="primary" :loading="savingEdit" @click="saveEditCase">保存</el-button>
      </template>
    </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Delete, EditPen } from '@element-plus/icons-vue';
import QRCode from 'qrcode';
import { defectApi, execApi, projectApi, roundApi, tbAuthApi, tbFillerApi, userApi } from '@/api';
import { useModuleTreeDrag } from '@/composables/useModuleTreeDrag';
import { compareCaseRowsBySetListOrder, sortExecTreeBranches } from '@/utils/caseDisplayOrder';

const route = useRoute();
const router = useRouter();
const rid = Number(route.params.roundId);
const pid = Number(route.params.id);
function goBack() {
  router.push(`/projects/${pid}/rounds/${rid}`);
}

const instances = ref<any[]>([]);
const currentId = ref<number | null>(null);
const current = ref<any>(null);
const filter = ref('');
const resultFilter = ref<'ALL' | 'PENDING' | 'P' | 'F' | 'BLOCK'>('ALL');
const treeRef = ref<any>(null);
const form = reactive({ actualResult: '', comment: '' });

/** 左侧用例树面板宽度（可拖拽调节，持久化到 localStorage） */
const TREE_WIDTH_KEY = 'tcmp_exec_tree_width';
const treeWidth = ref<number>(Number(localStorage.getItem(TREE_WIDTH_KEY)) || 280);
let resizing = false;
function startResize(e: MouseEvent) {
  resizing = true;
  const startX = e.clientX;
  const startW = treeWidth.value;
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
  const onMove = (ev: MouseEvent) => {
    if (!resizing) return;
    const next = startW + (ev.clientX - startX);
    treeWidth.value = Math.min(Math.max(next, 200), 900);
  };
  const onUp = () => {
    resizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    localStorage.setItem(TREE_WIDTH_KEY, String(treeWidth.value));
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

const defects = ref<any[]>([]);
const showDefect = ref(false);
const projectMembers = ref<any[]>([]);
const userMap = ref<Record<number, any>>({});
const tbBugSectionUrl = ref<string>('');
const roundSoftwareVersion = ref<string>('');
const attachInputs = reactive<Record<number, string>>({});
const attachingId = ref<number | null>(null);
const syncingId = ref<number | null>(null);
const defectForm = reactive<{
  title: string; severity: string; priority: string;
  occurrenceProb: string; description: string; assigneeUserId: number | null;
}>({
  title: '', severity: '一般', priority: '普通',
  occurrenceProb: 'LOW', description: '', assigneeUserId: null,
});

const filtered = computed(() =>
  instances.value.filter((i) => {
    if (resultFilter.value !== 'ALL' && i.result !== resultFilter.value) return false;
    if (!filter.value) return true;
    const t = (i.case?.title || '') + (i.case?.code || '');
    return t.toLowerCase().includes(filter.value.toLowerCase());
  }),
);

const doneCount = computed(() => instances.value.filter((i) => i.result !== 'PENDING').length);

/** 与用例集详情一致：按用例编号 code 升序（同后端 ORDER BY code ASC） */
const orderedInstances = computed(() => {
  const list = [...filtered.value];
  list.sort((a, b) => compareCaseRowsBySetListOrder(a.case || {}, b.case || {}));
  return list;
});

// 树：用例集 → 模块链 → 用例
const tree = computed(() => {
  const bySet = new Map<number, any>();
  for (const ins of orderedInstances.value) {
    const c = ins.case || {};
    const setId = c.caseSetId ?? -1;
    const setKey = `set-${setId}`;
    if (!bySet.has(setId)) {
      bySet.set(setId, {
        key: setKey,
        label: c.caseSetName || `用例集#${setId}`,
        isLeaf: false,
        children: [],
        _moduleMap: new Map<string, any>(),
        leafCount: 0, passCount: 0, failCount: 0, blockCount: 0, pendingCount: 0,
      });
    }
    const setNode = bySet.get(setId);
    setNode.leafCount++;
    bumpCount(setNode, ins.result);
    let parent = setNode;
    let chainKey = setKey;
    let parentModuleId: number | null = null;
    for (let i = 0; i < (c.modulePath || []).length; i++) {
      const m = c.modulePath[i];
      chainKey += `-m${m.id}`;
      let mod = parent._moduleMap.get(chainKey);
      if (!mod) {
        mod = {
          key: chainKey,
          label: m.name,
          isLeaf: false,
          children: [],
          _moduleMap: new Map<string, any>(),
          leafCount: 0,
          passCount: 0,
          failCount: 0,
          blockCount: 0,
          pendingCount: 0,
          moduleId: m.id,
          caseSetId: setId,
          level: i + 1,
          parentModuleId,
          orderNo: m.orderNo ?? 0,
        };
        parent._moduleMap.set(chainKey, mod);
        parent.children.push(mod);
      }
      mod.leafCount++;
      bumpCount(mod, ins.result);
      parentModuleId = m.id;
      parent = mod;
    }
    parent.children.push({
      key: `inst-${ins.id}`,
      instanceId: ins.id,
      label: c.title || `用例#${c.id}`,
      code: c.code,
      moduleId: c.moduleId,
      result: ins.result,
      isLeaf: true,
    });
  }
  const roots = Array.from(bySet.values());
  for (const r of roots) sortExecTreeBranches(r.children);
  return roots;
});

function bumpCount(n: any, r: string) {
  if (r === 'P') n.passCount++;
  else if (r === 'F') n.failCount++;
  else if (r === 'BLOCK') n.blockCount++;
  else if (r === 'PENDING') n.pendingCount++;
}

// 默认展开的节点 key：仅在树首次拿到数据时初始化为"全部展开"；
// 之后由 @node-expand / @node-collapse 事件同步用户的展开/折叠操作，
// 这样执行用例导致 tree 计算属性重算、el-tree 内部按 default-expanded-keys 重建
// 展开状态时，被用户折叠过的节点不会再次被强制展开。
const defaultExpandedKeys = ref<string[]>([]);
const expandedSet = new Set<string>();
let expandedInitialized = false;
watch(
  tree,
  (nodes) => {
    if (expandedInitialized) return;
    if (!nodes || !nodes.length) return;
    const keys: string[] = [];
    const walk = (arr: any[]) => {
      for (const n of arr) {
        if (!n.isLeaf) {
          keys.push(n.key);
          if (n.children) walk(n.children);
        }
      }
    };
    walk(nodes);
    expandedSet.clear();
    keys.forEach((k) => expandedSet.add(k));
    defaultExpandedKeys.value = keys;
    expandedInitialized = true;
  },
  { immediate: true },
);

function onNodeExpand(data: any) {
  if (data?.key) {
    expandedSet.add(data.key);
    defaultExpandedKeys.value = Array.from(expandedSet);
  }
}
function onNodeCollapse(data: any) {
  if (!data?.key) return;
  // 折叠该节点：连同其所有后代分支 key 一并移除，避免下次应用
  // default-expanded-keys 时子节点被展开而把本节点重新撑开。
  expandedSet.delete(data.key);
  const removeDesc = (n: any) => {
    if (!n || !n.children) return;
    for (const c of n.children) {
      if (!c.isLeaf) {
        expandedSet.delete(c.key);
        removeDesc(c);
      }
    }
  };
  removeDesc(data);
  defaultExpandedKeys.value = Array.from(expandedSet);
}

function filterNode(value: string, data: any) {
  if (!value) return true;
  if (!data.isLeaf) return false;
  const v = value.toLowerCase();
  return (data.label || '').toLowerCase().includes(v) || (data.code || '').toLowerCase().includes(v);
}
watch(filter, (v) => treeRef.value?.filter(v));

function onNodeClick(data: any) {
  if (!data.isLeaf) return;
  const ins = instances.value.find((x) => x.id === data.instanceId);
  if (ins) select(ins);
}

async function load(preserveInstanceId?: number) {
  instances.value = (await roundApi.cases(rid)) as any;
  await loadMembers();
  if (!instances.value.length) return;
  const ordered = [...instances.value].sort((a, b) =>
    compareCaseRowsBySetListOrder(a.case || {}, b.case || {}),
  );
  const keep =
    preserveInstanceId != null && ordered.some((x) => x.id === preserveInstanceId)
      ? preserveInstanceId
      : ordered[0].id;
  const ins = instances.value.find((x) => x.id === keep)!;
  await select(ins);
}
async function reloadAfterModuleDrag() {
  await load(currentId.value ?? undefined);
}
const { allowDrag, allowDrop, onNodeDrop } = useModuleTreeDrag(reloadAfterModuleDrag);
async function loadMembers() {
  const [ms, us, proj, rnd] = await Promise.all([
    projectApi.members(pid) as any,
    userApi.list() as any,
    projectApi.detail(pid) as any,
    roundApi.detail(rid) as any,
  ]);
  userMap.value = Object.fromEntries((us || []).map((u: any) => [u.id, u]));
  projectMembers.value = (ms || []).filter((m: any) => userMap.value[m.userId]);
  // TB 路径按轮次配置，未配置时回退到项目级
  tbBugSectionUrl.value = rnd?.tbBugSectionUrl || proj?.tbBugSectionUrl || '';
  roundSoftwareVersion.value = rnd?.softwareVersion || '';
}
async function select(ins: any) {
  currentId.value = ins.id;
  current.value = await execApi.detail(ins.id) as any;
  form.actualResult = current.value.actualResult || '';
  form.comment = current.value.comment || '';
  defects.value = await defectApi.listByInstance(ins.id) as any;
  await nextTick();
  treeRef.value?.setCurrentKey(`inst-${ins.id}`);
}
async function setResult(result: string, jumpNext = false) {
  if ((result === 'F' || result === 'BLOCK') && !form.actualResult) {
    return ElMessage.warning('请填写实际结果');
  }
  let updated: any;
  try {
    // 带上打开表单时读到的 version，实现乐观锁：若期间被他人更新，后端返回 E7003 冲突
    updated = await execApi.setResult(currentId.value!, {
      result,
      actualResult: form.actualResult,
      comment: form.comment,
      version: current.value?.version,
    });
  } catch (e: any) {
    // 冲突：拦截器已弹出提示，这里刷新当前实例拿到最新内容与 version，避免再次提交仍然冲突
    if (e?.code === 'E7003') {
      current.value = (await execApi.detail(currentId.value!)) as any;
      form.actualResult = current.value.actualResult || '';
      form.comment = current.value.comment || '';
    }
    return;
  }
  // 同步最新 version，便于在同一条上连续提交
  if (current.value && updated?.version != null) current.value.version = updated.version;
  ElMessage.success(`已记录 ${result}`);
  const idx = instances.value.findIndex((x) => x.id === currentId.value);
  if (idx >= 0) instances.value[idx].result = result;
  if (result === 'F') {
    // F → 检查油猜脚本、起本地草稿、打开 TB
    if (!tbBugSectionUrl.value) {
      ElMessage.warning('未配置项目的 TB 缺陷分组 URL，请在项目设置中填写');
      if (jumpNext) next();
      return;
    }
    // 没装油猜脚本：先弹安装引导，不立刻打开 TB，避免用户装不上又被莫名跳出去
    if (!userscriptInstalled.value) {
      pendingFDraftAction.value = () => doOpenTbForF();
      showInstallDialog.value = true;
      if (jumpNext) next();
      return;
    }
    await doOpenTbForF();
  }
  if (jumpNext) next();
}

/** F 后真正去创建草稿 + 打开 TB 的动作（抽出来供“装好后重试”使用） */
async function doOpenTbForF() {
  if (!current.value || !currentId.value || !tbBugSectionUrl.value) return;
  const draftTitle = `[${current.value.case?.code}] ${current.value.case?.title} - 异常`;
  // 备注 6 段模板：趁点 F 的用户手势把它写进剪贴板，TB 里按 Ctrl+V 即可粘贴
  // （TB 备注是 Cangjie/Slate 编辑器，只认真实粘贴，无法用脚本合成事件写入）
  const cc: any = current.value.case || {};
  const noteText = [
    `[前置条件]：${(cc.precondition || '').trim()}`,
    `[操作步骤描述]：${(cc.steps || '').trim()}`,
    `[实际结果]：${(form.actualResult || '').trim()}`,
    `[预期结果]：${(cc.expectedResult || '').trim()}`,
    `[问题定位]：`,
    `[补充说明]：`,
  ].join('\n');
  try { await navigator.clipboard.writeText(noteText); } catch { /* 剪贴板不可用则忽略 */ }
  let draftId: number | null = null;
  try {
    const res: any = await defectApi.submitManual(currentId.value!, {
      title: draftTitle,
      description: form.actualResult || '',
      severity: '一般', priority: '普通', occurrenceProb: 'LOW',
    });
    draftId = res?.defect?.id || null;
    defects.value = await defectApi.listByInstance(currentId.value!) as any;
  } catch (e) {
    // 草稿创建失败不阻断打开 TB
  }
  const sep = tbBugSectionUrl.value.includes('#') ? '&' : '#';
  const ret = encodeURIComponent(location.origin);
  const did = draftId ? `&tcmp_did=${draftId}` : '';
  // 自动回填数据（标题=实际结果、软件版本）经 hash 传给油猜脚本；备注走剪贴板
  const c: any = current.value.case || {};
  const fill = {
    title: form.actualResult || '',
    softwareVersion: roundSoftwareVersion.value || '',
    precondition: c.precondition || '',
    steps: c.steps || '',
    actualResult: form.actualResult || '',
    expectedResult: c.expectedResult || '',
    noteCopied: true,
  };
  let fillParam = '';
  try {
    fillParam = `&tcmp_fill=${encodeURIComponent(JSON.stringify(fill))}`;
  } catch { fillParam = ''; }
  window.open(`${tbBugSectionUrl.value}${sep}tcmp_open=1&tcmp_origin=${ret}${did}${fillParam}`, '_blank');
}
function next() {
  const list = orderedInstances.value;
  const idx = list.findIndex((x) => x.id === currentId.value);
  for (let i = idx + 1; i < list.length; i++) {
    if (list[i].result === 'PENDING') return select(list[i]);
  }
  ElMessage.success('已完成全部 PENDING 用例');
}

/** 上一轮结果展示用 alert 颜色映射 */
function prevResultAlertType(r: string): 'success' | 'warning' | 'error' | 'info' {
  if (r === 'P') return 'success';
  if (r === 'F') return 'error';
  if (r === 'BLOCK') return 'warning';
  return 'info';
}
function formatTime(t: string | Date | null | undefined) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 编辑/删除当前用例 =====
const showEditCase = ref(false);
const savingEdit = ref(false);
const editForm = ref<any>(null);

function openEditCase() {
  if (!current.value?.case) return;
  const c = current.value.case;
  editForm.value = {
    title: c.title || '',
    priority: c.priority || 'P2',
    precondition: c.precondition || '',
    steps: c.steps || '',
    testData: c.testData || '',
    expectedResult: c.expectedResult || '',
  };
  showEditCase.value = true;
}

async function saveEditCase() {
  if (!editForm.value || !currentId.value) return;
  if (!editForm.value.title?.trim()) {
    return ElMessage.warning('标题不能为空');
  }
  savingEdit.value = true;
  try {
    await execApi.reviseCase(currentId.value, { ...editForm.value });
    ElMessage.success('已保存（新版本已发布）');
    showEditCase.value = false;
    // 重新加载当前实例（含新版本快照）
    const refreshed = await execApi.detail(currentId.value) as any;
    current.value = refreshed;
    // 树里同步标题（如果改了）
    const idx = instances.value.findIndex((x) => x.id === currentId.value);
    if (idx >= 0) {
      instances.value[idx].title = refreshed.case?.title || instances.value[idx].title;
      instances.value[idx].caseVersion = refreshed.caseVersion;
    }
  } finally {
    savingEdit.value = false;
  }
}

async function onRemoveInstance() {
  if (!current.value || !currentId.value) return;
  try {
    await ElMessageBox.confirm(
      `确认从本轮删除用例「${current.value.case?.code} - ${current.value.case?.title}」？\n（仅从本轮次移除，不影响用例集；如已配置筛选条件，重新保存条件会找回该用例）`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  const removedId = currentId.value;
  try {
    await execApi.removeInstance(removedId);
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
    return;
  }
  ElMessage.success('已从本轮删除');
  // 从列表里移除并跳到下一个
  const idx = instances.value.findIndex((x) => x.id === removedId);
  if (idx >= 0) instances.value.splice(idx, 1);
  if (instances.value.length) {
    const nextIns = instances.value[Math.min(idx, instances.value.length - 1)];
    await select(nextIns);
  } else {
    current.value = null;
    currentId.value = null;
  }
}
async function submitDefect() {
  try {
    await defectApi.submit(currentId.value!, defectForm);
  } catch (err: any) {
    if (err?.code === 'E9009') {
      // 未授权 Teambition → 弹窗扫码授权后自动重试
      const ok = await ensureTbAuth();
      if (!ok) return;
      try {
        await defectApi.submit(currentId.value!, defectForm);
      } catch (e: any) {
        ElMessage.error(e?.message || '授权后重试仍失败');
        return;
      }
    } else {
      // 其他错误已被拦截器弹过 ElMessage
      return;
    }
  }
  ElMessage.success('已提交 Teambition');
  showDefect.value = false;
  defects.value = await defectApi.listByInstance(currentId.value!) as any;
  next();
}

// ===== 手动提交模式（C 方案）：用户自己在 TB 网页上提任务 =====
const defectStep = ref<'edit' | 'login' | 'tb'>('edit');
const submitting = ref(false);
const attaching = ref(false);
const draftDefect = ref<any>(null);
const prefill = reactive({ title: '', description: '', tbBugSectionUrl: '' });
const tbUrlInput = ref('');
const qrDataUrl = ref('');
const TB_LOGIN_URL = 'https://account.teambition.com/login';
const TB_LOGIN_KEY = 'tcmp_tb_logged_in';

function isTbLogged(): boolean {
  return localStorage.getItem(TB_LOGIN_KEY) === '1';
}
async function genLoginQr() {
  try {
    qrDataUrl.value = await QRCode.toDataURL(TB_LOGIN_URL, { width: 220, margin: 1 });
  } catch {
    qrDataUrl.value = '';
  }
}
function openTbLogin() {
  window.open(TB_LOGIN_URL, '_blank');
}
function confirmTbLogin() {
  localStorage.setItem(TB_LOGIN_KEY, '1');
  defectStep.value = 'tb';
}
function resetTbLogin() {
  localStorage.removeItem(TB_LOGIN_KEY);
  ElMessage.info('已重置 TB 登录态，下次提缺陷会再次校验');
}

// ===== 油猴脚本自动填表（window.open TB + hash 传参）=====
const showInstallGuide = ref(false);
const userscriptInstalled = ref(localStorage.getItem('tcmp_tb_userscript') === '1');
const userscriptUrl = computed(() => {
  // 直接指向后端的脚本地址（Tampermonkey 识别 .user.js 会弹安装）
  const base = location.origin.includes('5173')
    ? 'http://localhost:3000'
    : location.origin;
  return `${base}/api/v1/tb-filler/userscript`;
});

// 油猜脚本装上后要重试的动作
const pendingFDraftAction = ref<null | (() => void | Promise<void>)>(null);
const showInstallDialog = ref(false);
function markInstalled() {
  localStorage.setItem('tcmp_tb_userscript', '1');
  userscriptInstalled.value = true;
  ElMessage.success('已标记油猜脚本就绪');
  showInstallGuide.value = false;
}
/** F 引导弹窗中点“我装好了” */
function onInstalled() {
  localStorage.setItem('tcmp_tb_userscript', '1');
  userscriptInstalled.value = true;
  showInstallDialog.value = false;
  ElMessage.success('已记录脚本状态，重试打开 TB…');
  if (pendingFDraftAction.value) {
    const fn = pendingFDraftAction.value;
    pendingFDraftAction.value = null;
    Promise.resolve(fn()).catch(() => {});
  }
}

/** 一键打开 TB 缺陷分组，并把缺陷数据通过 URL hash 传给油猴脚本 */
function openTbAutoFill() {
  if (!prefill.tbBugSectionUrl) {
    ElMessage.warning('未配置 TB 缺陷分组 URL');
    return;
  }
  const assigneeName = defectForm.assigneeUserId
    ? (userMap.value[defectForm.assigneeUserId]?.name || '')
    : '';
  const payload = {
    title: prefill.title,
    description: prefill.description,
    severity: defectForm.severity || '一般',
    priority: defectForm.priority || '普通',
    frequency: ({ STABLE: '稳定复现', HIGH: '高频偶发', LOW: '低频偶发' } as any)[defectForm.occurrenceProb] || '低频偶发',
    assigneeName,
  };
  // base64 + encodeURIComponent，避免中文/换行问题
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = `${prefill.tbBugSectionUrl}#tcmp=${encodeURIComponent(b64)}`;
  window.open(url, '_blank');
  if (!userscriptInstalled.value) {
    ElMessage.warning('未检测到油猴脚本，请先按指南安装；如已装好请点击"我已装好"');
    showInstallGuide.value = true;
  } else {
    ElMessage.success('已打开 TB 标签页，自动填表将在页面就绪后开始');
  }
}

async function goToTbStep() {
  if (!defectForm.title) {
    ElMessage.warning('请填写标题');
    return;
  }
  submitting.value = true;
  try {
    const res: any = await defectApi.submitManual(currentId.value!, defectForm);
    draftDefect.value = res.defect;
    prefill.title = res.prefill.title;
    prefill.description = res.prefill.description;
    prefill.tbBugSectionUrl = res.prefill.tbBugSectionUrl;
    tbUrlInput.value = '';
    if (isTbLogged()) {
      // 已登录 → 进 tb 步骤
      defectStep.value = 'tb';
    } else {
      // 未登录 → 先弹二维码
      defectStep.value = 'login';
      genLoginQr();
    }
  } finally {
    submitting.value = false;
  }
}

function openTb() {
  window.open(prefill.tbBugSectionUrl, '_blank');
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text || '');
    ElMessage.success(`${label} 已复制`);
  } catch {
    ElMessage.warning('复制失败，请手动选中复制');
  }
}

async function doAttach() {
  if (!draftDefect.value?.id) return;
  attaching.value = true;
  try {
    await defectApi.attachTb(draftDefect.value.id, tbUrlInput.value.trim());
    ElMessage.success('已关联 TB 任务');
    showDefect.value = false;
    defects.value = await defectApi.listByInstance(currentId.value!) as any;
    next();
  } finally {
    attaching.value = false;
  }
}

async function skipAttach() {
  ElMessage.info('已仅本地保存草稿，可稍后在缺陷看板回填 TB URL');
  showDefect.value = false;
  defects.value = await defectApi.listByInstance(currentId.value!) as any;
  next();
}

/** 行内关联：把草稿缺陷绑定到 TB 任务 URL */
async function attachDefect(defectId: number) {
  const url = (attachInputs[defectId] || '').trim();
  if (!url) return ElMessage.warning('请粘贴 TB 任务 URL');
  attachingId.value = defectId;
  try {
    await defectApi.attachTb(defectId, url);
    ElMessage.success('已关联 TB 任务');
    delete attachInputs[defectId];
    defects.value = await defectApi.listByInstance(currentId.value!) as any;
  } finally {
    attachingId.value = null;
  }
}

/** 删除一条缺陷（草稿或已关联） */
async function removeDefect(defectId: number) {
  try {
    await ElMessageBox.confirm('确定删除这条缺陷？', '确认', { type: 'warning' });
  } catch { return; }
  await defectApi.remove(defectId);
  delete attachInputs[defectId];
  defects.value = await defectApi.listByInstance(currentId.value!) as any;
  ElMessage.success('已删除');
}

/** 同步 TB 状态：打开 TB 任务页（带 #tcmp_sync 参数），油猜脚本读 DOM 状态后回传 */
async function syncDefectStatus(row: any) {
  if (!row?.tbUrl) return ElMessage.warning('缺陷未关联 TB');
  syncingId.value = row.id;
  // 30 秒超时释放 loading
  setTimeout(() => { if (syncingId.value === row.id) syncingId.value = null; }, 30000);
  const ret = encodeURIComponent(location.origin);
  const sep = row.tbUrl.includes('#') ? '&' : '#';
  window.open(`${row.tbUrl}${sep}tcmp_sync=${row.id}&tcmp_origin=${ret}`, '_blank');
}

/**
 * 弹出 Teambition 授权窗，扫码完成后 resolve(true)；用户关闭则 resolve(false)
 */
async function ensureTbAuth(): Promise<boolean> {
  let res: any;
  try {
    res = await tbAuthApi.start() as any;
  } catch (e: any) {
    ElMessage.error(e?.message || '生成授权链接失败');
    return false;
  }
  const popup = window.open(res.url, 'tb-oauth', 'width=560,height=720');
  if (!popup) {
    ElMessage.error('无法打开授权窗口，请允许浏览器弹窗');
    return false;
  }
  return new Promise((resolve) => {
    const onMsg = (evt: MessageEvent) => {
      const m = evt.data;
      if (!m || m.type !== 'tb-oauth') return;
      window.removeEventListener('message', onMsg);
      clearInterval(closedChecker);
      if (m.payload?.ok) {
        ElMessage.success(`Teambition 授权成功：${m.payload.tbUserName || ''}`);
        resolve(true);
      } else {
        ElMessage.error(m.payload?.error || 'Teambition 授权失败');
        resolve(false);
      }
    };
    window.addEventListener('message', onMsg);
    const closedChecker = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedChecker);
        window.removeEventListener('message', onMsg);
        resolve(false);
      }
    }, 500);
  });
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'p' || e.key === 'P') setResult('P');
  else if (e.key === 'f' || e.key === 'F') setResult('F');
  else if (e.key === 'b' || e.key === 'B') setResult('BLOCK');
  else if (e.key === 'n' || e.key === 'N') setResult('NP');
  else if (e.key === 't' || e.key === 'T') setResult('NT');
}
onMounted(() => {
  load();
  window.addEventListener('keydown', onKey);
  window.addEventListener('message', onTbDefectMessage);
  window.addEventListener('storage', onStorageRelay);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('message', onTbDefectMessage);
  window.removeEventListener('storage', onStorageRelay);
});

/** localStorage 兜底通道（postMessage 失败时） */
function onStorageRelay(evt: StorageEvent) {
  if (evt.key === 'tcmp_tb_defect_relay' && evt.newValue) {
    try {
      const data = JSON.parse(evt.newValue);
      onTbDefectMessage({ data } as any);
      localStorage.removeItem('tcmp_tb_defect_relay');
    } catch {}
  } else if (evt.key === 'tcmp_tb_status_relay' && evt.newValue) {
    try {
      const data = JSON.parse(evt.newValue);
      onTbDefectMessage({ data } as any);
      localStorage.removeItem('tcmp_tb_status_relay');
    } catch {}
  }
}

/** 接收油猜脚本从 TB 标签页发回的“提交成功 + 任务 URL”消息，自动关联 */
async function onTbDefectMessage(evt: MessageEvent) {
  const data: any = evt?.data;
  if (!data) return;
  // 分支 1：状态同步回传
  if (data.type === 'tcmp_tb_status_synced') {
    const { defectId, status, title } = data;
    // 状态或标题任一有值即回写（有时只读到标题）
    if (!defectId || (!status && !title)) return;
    try {
      await defectApi.syncStatus(Number(defectId), String(status || ''), title ? String(title) : undefined);
      ElMessage.success(status ? `TB 状态已同步: ${status}` : 'TB 标题已同步');
      if (currentId.value) {
        defects.value = await defectApi.listByInstance(currentId.value) as any;
      }
    } catch (e: any) {
      ElMessage.error(e?.message || '同步状态失败');
    } finally {
      if (syncingId.value === Number(defectId)) syncingId.value = null;
    }
    return;
  }
  // 分支 2：提交成功关联
  if (data.type !== 'tcmp_tb_defect_submitted') return;
  const { defectId, tbUrl, taskId, hasUrl, title } = data;
  // taskId / tbUrl 两者都没拿到 → 提醒手粘
  if (!taskId && (!tbUrl || hasUrl === false)) {
    ElMessage.warning('TB 弹窗已关闭但未抓到任务 URL，请手动粘贴 URL 到草稿行点"关联"');
    if (currentId.value) {
      defects.value = await defectApi.listByInstance(currentId.value) as any;
    }
    return;
  }
  const tbTitle = title ? String(title) : undefined;
  try {
    if (defectId) {
      await defectApi.attachTb(Number(defectId), String(tbUrl || ''), taskId ? String(taskId) : undefined, tbTitle);
      ElMessage.success('TB 提交成功，已自动关联到该用例');
    } else if (currentId.value) {
      // 没有 defectId 时：取当前用例最新一条 DRAFT 缺陷关联
      const list = await defectApi.listByInstance(currentId.value) as any[];
      const draft = list.find((d: any) => d.tbTaskId === 'DRAFT');
      if (draft) {
        await defectApi.attachTb(draft.id, String(tbUrl || ''), taskId ? String(taskId) : undefined, tbTitle);
        ElMessage.success('TB 提交成功，已自动关联');
      }
    }
    if (currentId.value) {
      defects.value = await defectApi.listByInstance(currentId.value) as any;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '自动关联失败');
  }
}
</script>

<style scoped>
.exec-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 0;
  max-width: none;
}
.exec-page .page-header {
  margin-bottom: 0;
  padding: 0 4px;
}
.exec-layout {
  display: flex;
  gap: 12px;
  height: calc(100vh - var(--tcmp-header-height) - 52px);
  padding: 0;
}
.exec-tree {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--tcmp-border);
  border-radius: var(--tcmp-radius);
  padding: 12px;
  background: var(--tcmp-page-bg);
  box-shadow: var(--tcmp-shadow-sm);
}
.tree-filter { margin-bottom: 8px; }
.exec-resizer {
  flex-shrink: 0;
  width: 6px;
  margin: 0 -3px;
  cursor: col-resize;
  border-radius: 3px;
  background: transparent;
  transition: background 0.15s;
  z-index: 2;
}
.exec-resizer:hover,
.exec-resizer:active { background: var(--tcmp-primary); }
.result-filter { margin-bottom: 8px; }
.tree-wrapper {
  flex: 1;
  background: var(--tcmp-card-bg);
  border: 1px solid var(--tcmp-border);
  border-radius: var(--tcmp-radius-sm);
  padding: 6px;
  overflow: auto;
}
/* 让树节点按内容宽度撑开，超出时由 tree-wrapper 出现横向滚动条 */
.tree-wrapper :deep(.el-tree) { display: inline-block; min-width: 100%; }
.tree-wrapper :deep(.el-tree-node__content) { height: auto; }
.exec-detail {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 16px 20px;
  background: var(--tcmp-card-bg);
  border: 1px solid var(--tcmp-border);
  border-radius: var(--tcmp-radius);
  box-shadow: var(--tcmp-shadow-sm);
}
.exec-detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.exec-detail-title {
  margin: 0;
  flex: 1;
  min-width: 200px;
  font-size: 17px;
  font-weight: 600;
  color: var(--tcmp-text-primary);
}
.case-field-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.prev-result-alert { margin-top: 10px; }
.prev-result-title { font-weight: 600; }
.prev-result-line { margin-top: 4px; }
.pre-wrap { white-space: pre-wrap; }
.exec-result-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.exec-subhead {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
.exec-subhead__title { font-weight: 600; }
.exec-subhead__hint {
  color: var(--tcmp-text-muted);
  font-size: 12px;
}
.case-desc {
  width: 50%;
  min-width: 480px;
  max-width: 100%;
}
.case-desc :deep(.el-descriptions__body) { width: 100%; }
.case-desc :deep(.el-descriptions__table) { width: 100% !important; table-layout: fixed; }
.case-desc :deep(.el-descriptions__label) { width: 110px; }
.case-desc :deep(.el-descriptions__cell pre) { font-size: 14px; line-height: 1.7; }
.leaf-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.leaf-row.is-active { color: var(--tcmp-primary); font-weight: 500; }
.leaf-code { color: var(--tcmp-text-muted); font-size:12px; white-space:nowrap; }
.leaf-title { flex:1; white-space:nowrap; }
.branch-row { display: inline-flex; align-items: center; gap: 6px; width: 100%; color: var(--tcmp-text-secondary); white-space:nowrap; cursor: grab; }
.branch-row:active { cursor: grabbing; }
.branch-meta { margin-left: auto; font-size: 12px; display:flex; gap:4px; align-items:center; }
.dot-p { color: #67c23a; }
.dot-f { color: #f56c6c; }
.dot-b { color: #e6a23c; }
.dot-pending { color: #909399; }
.dot-total { color: #c0c4cc; }

.result-badge {
  display: inline-block;
  min-width: 22px;
  padding: 0 4px;
  text-align: center;
  border-radius: 3px;
  font-size: 12px;
  line-height: 18px;
  color: #fff;
  background: #c0c4cc;
}
.result-PENDING { background:#dcdfe6; color:#909399; }
.result-P { background:#67c23a; }
.result-F { background:#f56c6c; }
.result-BLOCK { background:#e6a23c; }
.result-NP { background:#909399; }
.result-NT { background:#a0cfff; }

.step-row { display: flex; gap: 12px; align-items: flex-start; }
.step-num {
  flex-shrink: 0;
  width: 24px; height: 24px; line-height: 24px;
  text-align: center; border-radius: 50%;
  background: #409eff; color: #fff;
  font-size: 13px; font-weight: 600;
}
</style>
