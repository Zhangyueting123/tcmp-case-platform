<!--
  @author zhangyueting
  @date 2026-06-10
-->
<template>
  <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f2f5">
    <el-card style="width: 460px">
      <h2 style="text-align: center; margin-top: 0">注册新账号</h2>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="邮箱" prop="email" required>
          <el-input v-model="form.email" placeholder="name@mech-mind.net" />
        </el-form-item>
        <el-form-item label="姓名" prop="name" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone" required>
          <el-input v-model="form.phone" placeholder="用于钉钉群内 @ 执行人" />
        </el-form-item>
        <el-form-item label="密码" prop="password" required>
          <el-input v-model="form.password" type="password" show-password placeholder="≥8位 含字母+数字+特殊字符" />
        </el-form-item>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="onSubmit">注册</el-button>
        <div style="text-align: center; margin-top: 12px">
          <RouterLink to="/login">已有账号？返回登录</RouterLink>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
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
    const payload: any = {
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
