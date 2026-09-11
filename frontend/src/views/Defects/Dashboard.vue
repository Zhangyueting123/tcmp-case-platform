<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div class="page">
    <div class="page-title">
      <el-button :icon="ArrowLeft" @click="goBack" style="margin-right:8px">返回</el-button>
      缺陷看板
    </div>
    <DefectsPanel :project-id="id" />
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import DefectsPanel from './Panel.vue';
const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
function goBack() { router.push(`/projects/${id}`); }
</script>
