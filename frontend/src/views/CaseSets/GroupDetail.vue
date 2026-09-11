<!--
  @author zhangyueting
  @date 2026-07-15
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack" style="margin-right:8px">返回</el-button>
      {{ group?.name || '用例集项目' }}
    </div>
    <div class="toolbar">
      <el-button type="primary" @click="showCreate = true">新建用例集</el-button>
      <el-button @click="downloadTemplate">下载导入模板</el-button>
      <el-button
        type="warning"
        plain
        :disabled="!selected.length"
        @click="onStartReview"
      >发起评审{{ selected.length ? `（${selected.length}）` : '' }}</el-button>
      <el-button plain :disabled="!selected.length" @click="openMoveDialog()">
        移动到…{{ selected.length ? `（${selected.length}）` : '' }}
      </el-button>
      <div class="spacer" />
      <el-input
        v-model="keyword"
        placeholder="按名称模糊查询"
        clearable
        :prefix-icon="Search"
        style="width: 240px"
        @input="onKeywordInput"
        @clear="onKeywordInput"
      />
    </div>
    <el-table
      :data="list"
      border
      :default-sort="{ prop: 'lastUpdatedAt', order: 'descending' }"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column prop="name" label="名称">
        <template #default="{ row }">
          <span class="cs-name" @click="$router.push(`/case-sets/${row.id}`)">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column
        prop="lastUpdatedAt"
        label="更新时间"
        width="180"
        sortable
        :sort-method="byLastUpdatedAt"
      >
        <template #default="{ row }">{{ formatTime(row.lastUpdatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/case-sets/${row.id}`)">详情</el-button>
          <el-button link type="primary" @click="openMoveDialog(row)">移动</el-button>
          <el-button v-if="canDelete(row)" link type="danger" @click="onDelete(row)">删除</el-button>
          <el-tooltip v-else content="只有该用例集的创建者或系统管理员可以删除" placement="top">
            <span><el-button link type="danger" disabled>删除</el-button></span>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>
    <el-empty
      v-if="!list.length"
      :description="keyword.trim() ? `没有名称包含「${keyword.trim()}」的用例集` : '该项目下暂无用例集，点上方按钮新建'"
    />

    <el-dialog v-model="showCreate" title="新建用例集" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="所属项目">
          <el-tag>{{ group?.name }}</el-tag>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="例：机械手视觉系统用例库" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showCreate = false">取消</el-button><el-button type="primary" @click="onCreate">创建</el-button></template>
    </el-dialog>

    <StartMultiReviewDialog
      v-model="showReview"
      :case-sets="selected.map((s) => ({ id: s.id, name: s.name }))"
      @saved="onReviewStarted"
    />

    <el-dialog v-model="showMove" title="移动到其他用例集项目" width="480px" :close-on-click-modal="false">
      <p v-if="moveRows.length === 1" class="move-hint">
        将用例集「<strong>{{ moveRows[0].name }}</strong>」移动到：
      </p>
      <p v-else class="move-hint">将选中的 <strong>{{ moveRows.length }}</strong> 个用例集移动到：</p>
      <el-form label-width="100px">
        <el-form-item label="目标项目">
          <el-select v-model="moveTargetGroupId" placeholder="选择用例集项目" filterable style="width: 100%">
            <el-option
              v-for="g in moveTargetOptions"
              :key="g.id"
              :label="g.name"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon title="仅变更所属项目，用例、模块树与评审记录均保留。" />
      <template #footer>
        <el-button @click="showMove = false">取消</el-button>
        <el-button type="primary" :loading="moving" :disabled="!moveTargetGroupId" @click="confirmMove">确认移动</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { caseSetApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import StartMultiReviewDialog from '../CaseReviews/StartMultiReviewDialog.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const gid = Number(route.params.gid);
const group = ref<any>(null);
const allGroups = ref<any[]>([]);
const list = ref<any[]>([]);
const showCreate = ref(false);
const form = reactive({ name: '', description: '' });

// ===== 按名称模糊查询 =====
const keyword = ref('');
let searchTimer: any = null;
function onKeywordInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    load().catch((e: any) => ElMessage.error(e?.message || '查询失败'));
  }, 300);
}
onBeforeUnmount(() => clearTimeout(searchTimer));

function formatTime(t: string) {
  if (!t) return '-';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN', { hour12: false });
}
function byLastUpdatedAt(a: any, b: any) {
  const ta = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
  const tb = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
  return ta - tb;
}

// ===== 多选发起评审 =====
const selected = ref<any[]>([]);
const showReview = ref(false);
function onSelectionChange(rows: any[]) {
  selected.value = rows;
}
function onStartReview() {
  if (!selected.value.length) return ElMessage.warning('请先勾选用例集');
  showReview.value = true;
}
function onReviewStarted(reviewId: number) {
  if (reviewId) router.push(`/reviews/${reviewId}`);
}

// ===== 移动到其他用例集项目 =====
const showMove = ref(false);
const moving = ref(false);
const moveTargetGroupId = ref<number>();
const moveRows = ref<any[]>([]);
const moveTargetOptions = computed(() => allGroups.value.filter((g) => g.id !== gid));

function openMoveDialog(row?: any) {
  const rows = row ? [row] : selected.value;
  if (!rows.length) return ElMessage.warning('请先选择用例集');
  moveRows.value = rows;
  moveTargetGroupId.value = undefined;
  showMove.value = true;
}
async function confirmMove() {
  if (!moveTargetGroupId.value || !moveRows.value.length) return;
  const target = allGroups.value.find((g) => g.id === moveTargetGroupId.value);
  moving.value = true;
  try {
    if (moveRows.value.length === 1) {
      await caseSetApi.moveToGroup(moveRows.value[0].id, moveTargetGroupId.value);
      ElMessage.success(`已移动到「${target?.name || '目标项目'}」`);
    } else {
      const res: any = await caseSetApi.moveToGroupBatch(
        moveRows.value.map((r) => r.id),
        moveTargetGroupId.value,
      );
      const skipped = res?.skipped?.length || 0;
      if (skipped) {
        ElMessage.warning(`成功 ${res.moved} 个，跳过 ${skipped} 个（已在目标项目或不可移动）`);
      } else {
        ElMessage.success(`已将 ${res.moved} 个用例集移动到「${target?.name || '目标项目'}」`);
      }
    }
    showMove.value = false;
    selected.value = [];
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '移动失败');
  } finally {
    moving.value = false;
  }
}

/** 删除用例集为不可恢复的硬删除，仅创建者与系统管理员可操作（后端同样校验）。 */
function canDelete(row: any) {
  return auth.isSysAdmin || (row?.ownerUserId != null && row.ownerUserId === auth.user?.id);
}

function goBack() { router.push('/case-sets'); }
async function load() {
  allGroups.value = (await caseSetApi.groups()) as any[];
  group.value = allGroups.value.find((g) => g.id === gid) || null;
  list.value = (await caseSetApi.list(gid, keyword.value.trim())) as any;
}
async function onCreate() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称');
  try {
    await caseSetApi.create({ ...form, groupId: gid });
    ElMessage.success('创建成功');
    showCreate.value = false;
    Object.assign(form, { name: '', description: '' });
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  }
}
function downloadTemplate() { window.open('/api/v1/case-sets/template/blank'); }
async function onDelete(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除用例集 "${row.name}" ？\n若该用例集下的用例未被任何项目引用，将彻底删除（含用例、模块、评审记录，不可恢复）；若已被项目用例池或测试轮次引用，则无法删除。`,
      '删除用例集',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await caseSetApi.remove(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  }
}
onMounted(load);
</script>

<style scoped>
.cs-name {
  font-weight: 600;
  cursor: pointer;
}
.cs-name:hover {
  color: var(--el-color-primary);
}
.move-hint {
  margin: 0 0 16px;
  color: #606266;
  font-size: 14px;
}
</style>
