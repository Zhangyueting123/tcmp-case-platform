<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <AuthLayout active-tab="register" tall>
    <el-form ref="formRef" class="auth-form" :model="form" :rules="rules" @submit.prevent="onSubmit">
      <el-form-item prop="email">
        <el-input v-model="form.email" size="large" placeholder="name@mech-mind.net">
          <template #prefix>
            <el-icon><Message /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item prop="name">
        <el-input v-model="form.name" size="large" placeholder="请输入姓名">
          <template #prefix>
            <el-icon><User /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item prop="phone">
        <el-input v-model="form.phone" size="large" placeholder="手机号（钉钉 @ 执行人）">
          <template #prefix>
            <el-icon><Iphone /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model="form.password"
          size="large"
          type="password"
          show-password
          placeholder="≥8 位，含字母+数字+特殊字符"
          @keyup.enter="onSubmit"
        >
          <template #prefix>
            <el-icon><Lock /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      <el-button class="auth-submit" size="large" :loading="loading" @click="onSubmit">注册</el-button>
      <div class="auth-footer auth-footer--center">
        <RouterLink class="auth-link" to="/login">已有账号？返回登录</RouterLink>
      </div>
    </el-form>
  </AuthLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Iphone, Lock, Message, User } from '@element-plus/icons-vue';
import AuthLayout from '@/components/AuthLayout.vue';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const form = reactive({ email: '', name: '', phone: '', password: '' });
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      validator: (_r, value: string, cb) => {
        if (!value) return cb();
        if (value.length < 8 || value.length > 64) return cb(new Error('密码长度需 8-64 位'));
        if (!/[A-Za-z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
          return cb(new Error('密码需包含字母+数字+特殊字符'));
        }
        cb();
      },
      trigger: 'blur',
    },
  ],
};

async function onSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    const payload = {
      email: form.email,
      name: form.name,
      phone: form.phone.trim(),
      password: form.password,
    };
    const res: any = await authApi.register(payload);
    auth.accessToken = res.accessToken;
    auth.user = res.user;
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    ElMessage.success('注册成功');
    router.push('/projects');
  } finally {
    loading.value = false;
  }
}
</script>

<style>
.auth-footer--center {
  justify-content: center;
}
</style>
