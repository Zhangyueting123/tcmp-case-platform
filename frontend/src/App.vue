<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { startSession } from '@/utils/session';

onMounted(() => startSession());
</script>
