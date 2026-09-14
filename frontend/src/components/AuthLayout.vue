<template>
  <div class="auth-page">
    <div class="auth-shell" :class="{ 'auth-shell--tall': tall }">
      <aside class="auth-visual" aria-hidden="true">
        <div class="visual-grid" />
        <div class="visual-scene">
          <div class="iso-platform">
            <div class="iso-core">
              <span class="iso-core-icon">TC</span>
            </div>
            <div v-for="(f, i) in features" :key="f.title" class="iso-node" :class="`iso-node-${i}`">
              <div class="iso-node-card">
                <span class="iso-node-dot" />
                <span class="iso-node-text">{{ f.title }}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="auth-panel">
        <header class="auth-brand">
          <div class="auth-logo-wrap">
            <img :src="mechMindLogo" alt="Mech-Mind" class="auth-logo" />
          </div>
          <div class="auth-product">
            <h1 class="auth-title">{{ pageTitle }}</h1>
            <ul class="auth-tags">
              <li v-for="t in highlights" :key="t">{{ t }}</li>
            </ul>
          </div>
        </header>

        <nav class="auth-tabs">
          <RouterLink to="/login" class="auth-tab" :class="{ 'auth-tab--active': activeTab === 'login' }">
            账号登录
          </RouterLink>
          <RouterLink to="/register" class="auth-tab" :class="{ 'auth-tab--active': activeTab === 'register' }">
            注册新账号
          </RouterLink>
        </nav>

        <slot />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import mechMindLogo from '@/assets/mech-mind-logo.png';
import { PRODUCT_PAGE_TITLE } from '@/constants/product';

const pageTitle = PRODUCT_PAGE_TITLE;

withDefaults(
  defineProps<{
    activeTab: 'login' | 'register';
    tall?: boolean;
  }>(),
  { tall: false },
);

const highlights = ['用例集中管理', '轮次执行可追踪', '评审协作一体化'];
const features = [
  { title: '用例集与模块树' },
  { title: '轮次测试执行' },
  { title: '评审与意见导出' },
  { title: '缺陷与测试报告' },
];
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(24, 144, 255, 0.14), transparent 55%),
    radial-gradient(ellipse 70% 50% at 85% 70%, rgba(74, 158, 255, 0.12), transparent 50%),
    linear-gradient(135deg, var(--tcmp-brand-slate-mid) 0%, #3d4654 45%, var(--tcmp-brand-slate) 100%);
}

.auth-shell {
  display: flex;
  width: min(960px, 100%);
  min-height: 520px;
  background: #fff;
  border-radius: var(--tcmp-radius);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.auth-shell--tall {
  min-height: 580px;
}

.auth-visual {
  position: relative;
  flex: 1;
  min-width: 0;
  background: linear-gradient(145deg, #f3f4f6 0%, #e8eaef 100%);
  border-right: 1px solid #ebeef5;
}

.visual-grid {
  position: absolute;
  inset: 0;
  opacity: 0.45;
  background-image:
    linear-gradient(#d8dce3 1px, transparent 1px),
    linear-gradient(90deg, #d8dce3 1px, transparent 1px);
  background-size: 28px 28px;
  transform: skewY(-6deg) scale(1.15);
  transform-origin: center;
}

.visual-scene {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.auth-shell--tall .visual-scene {
  min-height: 580px;
}

.iso-platform {
  position: relative;
  width: 280px;
  height: 280px;
}

.iso-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 96px;
  height: 96px;
  margin: -48px 0 0 -48px;
  border-radius: 20px;
  background: linear-gradient(145deg, var(--tcmp-brand-accent-light) 0%, var(--tcmp-primary) 55%, var(--tcmp-primary-hover) 100%);
  box-shadow:
    0 16px 32px rgba(24, 144, 255, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-45deg);
}

.iso-core-icon {
  transform: rotate(45deg);
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.04em;
}

.iso-node {
  position: absolute;
  width: 140px;
}

.iso-node-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(24, 144, 255, 0.2);
}

.iso-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--tcmp-primary);
  flex-shrink: 0;
}

.iso-node-text {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.iso-node-0 {
  left: -8%;
  top: 8%;
}
.iso-node-1 {
  right: -12%;
  top: 18%;
}
.iso-node-2 {
  left: -14%;
  bottom: 22%;
}
.iso-node-3 {
  right: -10%;
  bottom: 10%;
}

.auth-panel {
  width: min(460px, 100%);
  flex-shrink: 0;
  padding: 0 44px 32px;
  display: flex;
  flex-direction: column;
}

.auth-brand {
  margin-bottom: 2px;
}

.auth-logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 -44px 22px;
  padding: 20px 32px 22px;
  background: linear-gradient(180deg, #eef3f9 0%, var(--tcmp-page-bg) 100%);
  border-bottom: 1px solid var(--tcmp-border);
}

.auth-logo {
  width: 100%;
  max-width: 320px;
  height: 72px;
  display: block;
  object-fit: contain;
  object-position: center center;
}

.auth-product {
  padding: 0 2px;
}

.auth-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1.4;
  letter-spacing: 0.02em;
}

.auth-tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
}

.auth-tags li {
  position: relative;
  padding-left: 14px;
  font-size: 13px;
  color: #606266;
}

.auth-tags li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 6px;
  height: 6px;
  background: var(--tcmp-primary);
  border-radius: 1px;
}

.auth-tabs {
  margin: 20px 0 18px;
  border-bottom: 1px solid #ebeef5;
}

.auth-tab {
  display: inline-block;
  padding: 0 4px 12px;
  margin-right: 24px;
  font-size: 15px;
  font-weight: 600;
  color: #909399;
  text-decoration: none;
  transition: color 0.15s;
}

.auth-tab:hover {
  color: #606266;
}

.auth-tab--active {
  color: #303133;
  box-shadow: inset 0 -2px 0 var(--tcmp-primary);
}

@media (max-width: 820px) {
  .auth-visual {
    display: none;
  }
  .auth-panel {
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }
}
</style>

<style>
/* 登录/注册表单共用（子页面 class="auth-form"） */
.auth-form .el-form-item {
  margin-bottom: 16px;
}

.auth-form .el-form-item__error {
  padding-top: 2px;
}

.auth-form .el-input__wrapper {
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.auth-form .el-input__wrapper:hover,
.auth-form .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--tcmp-primary) inset;
}

.auth-submit {
  width: 100%;
  margin-top: 4px;
  border: none !important;
  background: linear-gradient(90deg, var(--tcmp-brand-accent) 0%, var(--tcmp-primary) 100%) !important;
  color: #fff !important;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.auth-submit:hover,
.auth-submit:focus {
  background: linear-gradient(90deg, var(--tcmp-brand-accent-light) 0%, var(--tcmp-primary-hover) 100%) !important;
  color: #fff !important;
}

.auth-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  font-size: 13px;
}

.auth-link {
  color: var(--tcmp-primary);
  text-decoration: none;
}

.auth-link:hover {
  color: var(--tcmp-primary-hover);
  text-decoration: underline;
}
</style>
