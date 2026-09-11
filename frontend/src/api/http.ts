/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';
import { IDLE_LIMIT_MS, getLastActivity } from '@/utils/activity';

const http = axios.create({ baseURL: '/api/v1', timeout: 30000 });

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('accessToken');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (res) => {
    // Binary download passthrough
    if (res.config.responseType === 'blob') return res;
    const body = res.data;
    if (body && body.code === 0) return body.data;
    // 业务码 E9009 = TB 未授权，由调用方自行处理，不在拦截器里弹错
    if (body && body.code === 'E9009') return Promise.reject(body);
    ElMessage.error(body?.message || '请求失败');
    return Promise.reject(body);
  },
  async (err) => {
    const status = err.response?.status;
    const body = err.response?.data;
    // 业务码：TB 未授权 → 不要踢出登录，让调用方处理
    if (body?.code === 'E9009') {
      return Promise.reject(body);
    }
    if (status === 401) {
      const auth = useAuthStore();
      const original = err.config || {};
      const isRefreshCall =
        typeof original.url === 'string' && original.url.includes('/auth/refresh');
      const active = Date.now() - getLastActivity() <= IDLE_LIMIT_MS;
      const hasRefresh = !!localStorage.getItem('refreshToken');
      // token 过期但用户仍在活跃期内 → 静默续期后重放原请求，避免正在操作时被踢出
      if (active && hasRefresh && !isRefreshCall && !original._retried) {
        original._retried = true;
        try {
          const newToken = await auth.refreshTokens();
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return http(original);
        } catch {
          // 续期失败（refreshToken 也失效）→ 登出
        }
      }
      auth.logout();
      router.replace('/login');
      ElMessage.error(body?.message || '登录已过期，请重新登录');
      return Promise.reject(err);
    }
    ElMessage.error(body?.message || err.message || '网络错误');
    return Promise.reject(err);
  },
);

export default http;
