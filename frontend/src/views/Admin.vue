<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">系统管理</div>
    <el-tabs v-model="tab">
      <el-tab-pane label="用户" name="users">
        <el-table :data="users" border>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="email" label="邮箱" />
          <el-table-column prop="name" label="姓名" />
          <el-table-column label="系统角色"><template #default="{ row }">{{ (row.systemRoles||[]).join(', ') || '-' }}</template></el-table-column>
          <el-table-column prop="status" label="状态" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="集成配置" name="config">
        <el-card v-if="config">
          <pre style="white-space: pre-wrap">{{ JSON.stringify(config, null, 2) }}</pre>
          <el-alert type="warning" :closable="false">MVP 集成模块均为 Mock 实现；替换真实凭证后即可对接，详见 README</el-alert>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="钉钉推送日志" name="ding">
        <el-table :data="dingLogs" border>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="userId" label="UserId" width="100" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column label="内容">
            <template #default="{ row }"><pre style="margin: 0; white-space: pre-wrap">{{ JSON.stringify(row.payload) }}</pre></template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="180" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import http from '@/api/http';
import { userApi } from '@/api';

const tab = ref('users');
const users = ref<any[]>([]);
const config = ref<any>(null);
const dingLogs = ref<any[]>([]);

onMounted(async () => {
  users.value = await userApi.list() as any;
  config.value = await http.get('/admin/config');
  dingLogs.value = await http.get('/admin/dingtalk-logs') as any;
});
</script>
