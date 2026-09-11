<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">用例集</div>
    <div class="toolbar" style="display: flex; align-items: center; gap: 12px">
      <el-button type="primary" @click="openCreateGroup">新建用例集项目</el-button>
      <el-button @click="load">刷新</el-button>
      <div class="spacer" style="flex: 1" />
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button label="card">卡片</el-radio-button>
        <el-radio-button label="list">列表</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 卡片视图 -->
    <div v-if="viewMode === 'card'" class="card-grid">
      <el-card v-for="g in groups" :key="g.id" class="grp-card" shadow="hover" @click="enter(g)">
        <div class="grp-head">
          <span class="grp-name">{{ g.name }}</span>
        </div>
        <div class="grp-desc">{{ g.description || '暂无描述' }}</div>
        <div class="grp-actions" @click.stop>
          <el-button link type="primary" size="small" @click="enter(g)">进入</el-button>
          <el-button link type="primary" size="small" @click="openEditGroup(g)">编辑</el-button>
          <el-button link type="danger" size="small" @click="onRemoveGroup(g)">删除</el-button>
        </div>
      </el-card>
    </div>

    <!-- 列表视图 -->
    <el-table v-else :data="groups" border>
      <el-table-column prop="name" label="用例集项目" min-width="220">
        <template #default="{ row }">
          <span class="grp-name" style="cursor:pointer" @click="enter(row)">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="enter(row)">进入</el-button>
          <el-button link type="primary" size="small" @click="openEditGroup(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="onRemoveGroup(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!groups.length" description="暂无用例集项目，点上方按钮新建" />

    <el-dialog v-model="showGroup" :title="editingGroup ? '编辑用例集项目' : '新建用例集项目'" width="480px">
      <el-form :model="groupForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="groupForm.name" placeholder="例：视觉系统用例库" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="groupForm.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGroup = false">取消</el-button>
        <el-button type="primary" @click="onSubmitGroup">{{ editingGroup ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { caseSetApi } from '@/api';

const router = useRouter();
const groups = ref<any[]>([]);
const viewMode = ref<'card' | 'list'>('card');
const showGroup = ref(false);
const editingGroup = ref<any>(null);
const groupForm = reactive({ name: '', description: '' });

async function load() { groups.value = await caseSetApi.groups() as any; }
function enter(g: any) { router.push(`/case-sets/group/${g.id}`); }
function openCreateGroup() {
  editingGroup.value = null;
  Object.assign(groupForm, { name: '', description: '' });
  showGroup.value = true;
}
function openEditGroup(g: any) {
  editingGroup.value = g;
  Object.assign(groupForm, { name: g.name, description: g.description || '' });
  showGroup.value = true;
}
async function onSubmitGroup() {
  if (!groupForm.name.trim()) return ElMessage.warning('请填写名称');
  try {
    if (editingGroup.value) {
      await caseSetApi.updateGroup(editingGroup.value.id, { ...groupForm });
      ElMessage.success('已保存');
    } else {
      await caseSetApi.createGroup({ ...groupForm });
      ElMessage.success('创建成功');
    }
    showGroup.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function onRemoveGroup(g: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除用例集项目「${g.name}」？删除前需先移除其下所有用例集。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await caseSetApi.removeGroup(g.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  }
}
onMounted(load);
</script>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 8px;
}
.grp-card {
  border-radius: 8px;
  cursor: pointer;
}
.grp-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.grp-name {
  font-weight: 600;
  font-size: 15px;
}
.grp-desc {
  color: #606266;
  font-size: 13px;
  margin: 10px 0;
  min-height: 38px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.grp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
}
</style>
