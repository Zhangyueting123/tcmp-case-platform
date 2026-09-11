<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #4c8bf5, #6f3df5)">
    <el-card style="width: 380px">
      <h2 style="text-align: center; margin-top: 0">TCMP 登录</h2>
      <el-form :model="form" label-width="80px" @submit.prevent="onLogin">
        <el-form-item label="邮箱"><el-input v-model="form.email" placeholder="请输入邮箱" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password placeholder="请输入密码" /></el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="onLogin">登录</el-button>
        <div style="display: flex; justify-content: space-between; margin-top: 12px">
          <el-link type="primary" :underline="false" @click="openForgot">忘记密码？</el-link>
          <RouterLink to="/register">没有账号？立即注册</RouterLink>
        </div>
      </el-form>
    </el-card>

    <el-dialog v-model="forgotVisible" title="重置密码" width="440px" :close-on-click-modal="false">
      <el-form ref="forgotFormRef" :model="forgotForm" :rules="forgotRules" label-width="88px" @submit.prevent>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="forgotForm.email" placeholder="name@mech-mind.net" />
        </el-form-item>
        <el-form-item label="验证码" prop="code">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="forgotForm.code" placeholder="6 位数字" maxlength="6" />
            <el-button :disabled="sendCooldown > 0" :loading="sending" @click="onSendCode">
              {{ sendCooldown > 0 ? `${sendCooldown}s 后重发` : '发送验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="forgotForm.newPassword" type="password" show-password placeholder="8-64 位，含字母+数字+特殊字符" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="forgotForm.confirmPassword" type="password" show-password placeholder="再次输入" />
        </el-form-item>
        <div style="font-size: 12px; color: #909399; padding-left: 88px">
          验证码通过邮件发送；若你已在个人设置里填过手机号，也会在钉钉群里 @ 你并附上验证码。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="forgotVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="onResetSubmit">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const form = reactive({ email: '', password: '' });
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function onLogin() {
  loading.value = true;
  try {
    await auth.login(form.email, form.password);
    ElMessage.success('登录成功');
    router.push('/workbench');
  } finally {
    loading.value = false;
  }
}

// ---- 忘记密码 ----
const PWD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;

const forgotVisible = ref(false);
const sending = ref(false);
const resetting = ref(false);
const sendCooldown = ref(0);
let cooldownTimer: any = null;
const forgotFormRef = ref<FormInstance>();
const forgotForm = reactive({
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: '',
});
const forgotRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  code: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { pattern: /^\d{6}$/, message: '验证码为 6 位数字', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        if (!v) return cb();
        if (!PWD_REGEX.test(v)) return cb(new Error('8-64 位且包含字母+数字+特殊字符'));
        cb();
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    {
      validator: (_r, v: string, cb) => {
        if (v !== forgotForm.newPassword) return cb(new Error('两次输入的密码不一致'));
        cb();
      },
      trigger: 'blur',
    },
  ],
};

function openForgot() {
  forgotForm.email = form.email || '';
  forgotForm.code = '';
  forgotForm.newPassword = '';
  forgotForm.confirmPassword = '';
  forgotVisible.value = true;
}

async function onSendCode() {
  if (!forgotForm.email) {
    ElMessage.warning('请先填写邮箱');
    return;
  }
  sending.value = true;
  try {
    await authApi.forgotPasswordSendCode(forgotForm.email);
    ElMessage.success('验证码已发送，请查看邮箱或钉钉群');
    sendCooldown.value = 60;
    cooldownTimer = setInterval(() => {
      sendCooldown.value -= 1;
      if (sendCooldown.value <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 1000);
  } finally {
    sending.value = false;
  }
}

async function onResetSubmit() {
  if (!forgotFormRef.value) return;
  const valid = await forgotFormRef.value.validate().catch(() => false);
  if (!valid) return;
  resetting.value = true;
  try {
    await authApi.resetPassword({
      email: forgotForm.email,
      code: forgotForm.code.trim(),
      newPassword: forgotForm.newPassword,
    });
    ElMessage.success('密码已重置，请使用新密码登录');
    forgotVisible.value = false;
    // 顺手把邮箱回填到登录框
    form.email = forgotForm.email;
    form.password = '';
  } finally {
    resetting.value = false;
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});
</script>
