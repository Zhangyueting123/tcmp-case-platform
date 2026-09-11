<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <el-container style="height: 100vh">
    <el-header class="app-header">
      <div class="brand">
        <img :src="mechMindLogo" alt="Mech-Mind" class="brand-logo" />
        <div class="brand-text">
          <span class="brand-name">TCMP</span>
          <span class="brand-dot">·</span>
          <span class="brand-subtitle">用例管理平台</span>
        </div>
      </div>
      <el-menu
        class="app-nav"
        mode="horizontal"
        :default-active="activeMenu"
        background-color="#001529"
        text-color="rgba(255,255,255,0.78)"
        active-text-color="#fff"
        @select="onMenu"
      >
        <el-menu-item index="/workbench">工作台</el-menu-item>
        <el-menu-item index="/projects">项目</el-menu-item>
        <el-menu-item index="/case-sets">用例集</el-menu-item>
        <el-menu-item index="/my-reviews">我的评审</el-menu-item>
        <el-menu-item index="/admin" v-if="auth.isSysAdmin">管理</el-menu-item>
      </el-menu>
      <el-dropdown style="margin-right: 24px" @command="onManual">
        <span style="color: #fff; cursor: pointer">用户手册 ▾</span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="preview">在线预览</el-dropdown-item>
            <el-dropdown-item command="pdf" divided>下载 PDF</el-dropdown-item>
            <el-dropdown-item command="docx">下载 Word</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown @command="onCmd">
        <span style="color: #fff; cursor: pointer">{{ auth.user?.name }} ▾</span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">个人设置</el-dropdown-item>
            <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </el-header>
    <el-main style="padding: 0; background: #f5f7fa; overflow: auto">
      <RouterView />
    </el-main>

    <el-dialog v-model="profileVisible" title="个人设置" width="480px" :close-on-click-modal="false">
      <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-width="88px" @submit.prevent>
        <el-form-item label="邮箱">
          <el-input :model-value="auth.user?.email" disabled />
        </el-form-item>
        <el-form-item label="用户名" prop="name">
          <el-input v-model="profileForm.name" maxlength="32" show-word-limit placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="profileForm.phone" maxlength="11" placeholder="用于钉钉群内 @ 执行人" />
        </el-form-item>
        <el-divider content-position="left">修改密码（可选）</el-divider>
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="profileForm.currentPassword" type="password" show-password autocomplete="current-password" placeholder="修改密码时必填" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="profileForm.newPassword" type="password" show-password autocomplete="new-password" placeholder="8-64 位，含字母+数字+特殊字符，留空表示不修改" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="profileForm.confirmPassword" type="password" show-password autocomplete="new-password" placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitProfile">保存</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/api';
import mechMindLogo from '@/assets/mech-mind-logo.png';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const activeMenu = computed(() => {
  if (route.path.startsWith('/workbench')) return '/workbench';
  if (route.path.startsWith('/case-sets')) return '/case-sets';
  if (route.path.startsWith('/my-reviews') || route.path.startsWith('/reviews')) return '/my-reviews';
  if (route.path.startsWith('/admin')) return '/admin';
  return '/projects';
});

function onMenu(idx: string) {
  router.push(idx);
}
function onManual(cmd: string) {
  const base = '/docs/manual';
  if (cmd === 'preview') window.open(`${base}.html`, '_blank');
  else if (cmd === 'pdf') window.open(`${base}.pdf`, '_blank');
  else if (cmd === 'docx') window.open(`${base}.docx`, '_blank');
}
function onCmd(cmd: string) {
  if (cmd === 'logout') {
    auth.logout();
    router.replace('/login');
  } else if (cmd === 'profile') {
    openProfile();
  }
}

const profileVisible = ref(false);
const saving = ref(false);
const profileFormRef = ref<FormInstance>();
const profileForm = reactive({
  name: '',
  phone: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const PWD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;

const profileRules: FormRules = {
  name: [
    { required: true, message: '用户名不能为空', trigger: 'blur' },
    { max: 32, message: '用户名最多 32 字', trigger: 'blur' },
  ],
  phone: [
    { required: true, message: '手机号不能为空', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  newPassword: [
    {
      validator: (_r, v, cb) => {
        if (!v) return cb();
        if (!PWD_REGEX.test(v)) return cb(new Error('8-64 位且包含字母+数字+特殊字符'));
        cb();
      },
      trigger: 'blur',
    },
  ],
  currentPassword: [
    {
      validator: (_r, _v, cb) => {
        if (profileForm.newPassword && !profileForm.currentPassword) {
          return cb(new Error('修改密码时必须输入当前密码'));
        }
        cb();
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    {
      validator: (_r, v, cb) => {
        if (!profileForm.newPassword) return cb();
        if (v !== profileForm.newPassword) return cb(new Error('两次输入的密码不一致'));
        cb();
      },
      trigger: 'blur',
    },
  ],
};

async function openProfile() {
  profileForm.name = auth.user?.name || '';
  profileForm.phone = auth.user?.phone || '';
  profileForm.currentPassword = '';
  profileForm.newPassword = '';
  profileForm.confirmPassword = '';
  // 拉一次最新 me，避免 store 里手机号缺失
  try {
    const me: any = await authApi.me();
    if (me?.phone && !auth.user?.phone) profileForm.phone = me.phone;
    auth.setUser({ email: me.email, name: me.name, phone: me.phone, systemRoles: me.systemRoles });
  } catch {}
  profileVisible.value = true;
}

async function submitProfile() {
  if (!profileFormRef.value) return;
  const valid = await profileFormRef.value.validate().catch(() => false);
  if (!valid) return;
  const payload: any = {};
  if (profileForm.name !== auth.user?.name) payload.name = profileForm.name.trim();
  if (profileForm.phone !== auth.user?.phone) payload.phone = profileForm.phone.trim();
  if (profileForm.newPassword) {
    payload.currentPassword = profileForm.currentPassword;
    payload.newPassword = profileForm.newPassword;
  }
  if (!Object.keys(payload).length) {
    ElMessage.info('未修改任何信息');
    profileVisible.value = false;
    return;
  }
  saving.value = true;
  try {
    const res: any = await authApi.updateProfile(payload);
    auth.setUser({ name: res.name, phone: res.phone, email: res.email, systemRoles: res.systemRoles });
    ElMessage.success('修改成功');
    profileVisible.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.app-header {
  background: #001529;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 24px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-right: 28px;
  padding-right: 24px;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}
.brand-logo {
  height: 32px;
  width: auto;
  display: block;
  filter: brightness(0) invert(1);
  opacity: 0.95;
}
.brand-text {
  display: flex;
  align-items: baseline;
  gap: 7px;
  line-height: 1;
}
.brand-name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: linear-gradient(135deg, #7ec0ff 0%, #b89cff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-dot {
  font-size: 20px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.35);
  transform: translateY(-1px);
}
.brand-subtitle {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.06em;
}
.app-nav {
  flex: 1;
  border: none !important;
  background-color: transparent !important;
}
.app-nav :deep(.el-menu-item) {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0 24px !important;
  height: 60px;
  line-height: 60px;
  border-bottom: 3px solid transparent !important;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}
.app-nav :deep(.el-menu-item:hover) {
  color: #fff !important;
  background-color: rgba(255, 255, 255, 0.06) !important;
}
.app-nav :deep(.el-menu-item.is-active) {
  font-size: 17px;
  font-weight: 700;
  color: #fff !important;
  border-bottom-color: #7ec0ff !important;
  background-color: rgba(126, 192, 255, 0.1) !important;
}
</style>
