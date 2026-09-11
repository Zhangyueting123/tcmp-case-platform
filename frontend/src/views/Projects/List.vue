<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">项目</div>
    <div class="toolbar" style="display: flex; align-items: center; gap: 12px">
      <el-button type="primary" @click="openCreate">新建项目</el-button>
      <el-button @click="load">刷新</el-button>
      <div class="spacer" style="flex: 1" />
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button label="card">卡片</el-radio-button>
        <el-radio-button label="list">列表</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 卡片视图 -->
    <div v-if="viewMode === 'card'" class="card-grid">
      <el-card v-for="p in projects" :key="p.id" class="proj-card" shadow="hover" @click="enter(p)">
        <div class="proj-card-head">
          <span class="proj-name">{{ p.name }}</span>
          <el-tag v-if="p.isBuiltin" type="warning" size="small" effect="plain">内置</el-tag>
        </div>
        <div class="proj-desc">{{ p.description || '暂无描述' }}</div>
        <div class="proj-card-actions" @click.stop>
          <el-button link type="primary" size="small" @click="enter(p)">进入</el-button>
          <el-button link type="primary" size="small" @click="enterBoard(p)">缺陷看板</el-button>
          <el-button link type="success" size="small" @click="openCreateChild(p)">新建子项目</el-button>
          <el-button v-if="!p.isBuiltin" link type="danger" size="small" @click="onRemove(p)">删除</el-button>
        </div>
      </el-card>
    </div>

    <!-- 列表视图 -->
    <el-table v-else :data="projects" border>
      <el-table-column prop="name" label="项目名称" min-width="220">
        <template #default="{ row }">
          <span class="proj-name" @click="enter(row)">{{ row.name }}</span>
          <el-tag v-if="row.isBuiltin" type="warning" size="small" effect="plain" style="margin-left:6px">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
      <el-table-column label="操作" width="320">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="enter(row)">进入</el-button>
          <el-button link type="primary" size="small" @click="enterBoard(row)">缺陷看板</el-button>
          <el-button link type="success" size="small" @click="openCreateChild(row)">新建子项目</el-button>
          <el-button v-if="!row.isBuiltin" link type="danger" size="small" @click="onRemove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!projects.length" description="暂无项目" />

    <el-dialog v-model="showCreate" :title="createTitle" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item v-if="parent" label="上级">
          <el-tag>{{ parent.name }}</el-tag>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item v-if="parent" label="版本迭代">
          <el-input v-model="form.versionIteration" placeholder="如 3.0.1 或 迭代S1（可选）" />
        </el-form-item>
        <el-form-item v-else label="Teambition URL">
          <el-input v-model="form.tbBugSectionUrl" placeholder="粘贴缺陷分组 URL，自动解析项目/分组 ID（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { projectApi } from '@/api';

const router = useRouter();
const projects = ref<any[]>([]);
const viewMode = ref<'card' | 'list'>('card');
const showCreate = ref(false);
const parent = ref<any>(null);
const form = reactive({ name: '', description: '', tbBugSectionUrl: '', versionIteration: '' });
const createTitle = ref('新建项目');

async function load() {
  const flat = (await projectApi.list()) as any[];
  // 本页仅展示顶层「项目」，子项目/模块功能测试项目在项目详情内查看
  projects.value = flat.filter((p) => (p.level || 1) === 1);
}
function enter(p: any) {
  router.push(`/projects/${p.id}`);
}
function enterBoard(p: any) {
  router.push(`/projects/${p.id}?tab=board`);
}
function openCreate() {
  parent.value = null;
  createTitle.value = '新建项目';
  Object.assign(form, { name: '', description: '', tbBugSectionUrl: '', versionIteration: '' });
  showCreate.value = true;
}
function openCreateChild(p: any) {
  parent.value = p;
  createTitle.value = `在「${p.name}」下新建子项目`;
  Object.assign(form, { name: '', description: '', tbBugSectionUrl: '', versionIteration: '' });
  showCreate.value = true;
}
async function onCreate() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称');
  try {
    await projectApi.create({ ...form, parentId: parent.value?.id ?? null });
    ElMessage.success('创建成功');
    showCreate.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  }
}
async function onRemove(p: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除项目「${p.name}」？此操作不可恢复。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await projectApi.remove(p.id);
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
.proj-card {
  border-radius: 8px;
  cursor: pointer;
}
.proj-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.proj-name {
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}
.proj-name:hover {
  color: var(--el-color-primary);
}
.proj-desc {
  color: #606266;
  font-size: 13px;
  margin: 10px 0;
  min-height: 38px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.proj-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
}
</style>
