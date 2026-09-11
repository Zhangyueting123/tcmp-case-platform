/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { defineStore } from 'pinia';
import { authApi } from '@/api';
import { markActivity } from '@/utils/activity';

// 单飞：并发的续期请求只发一次，其余复用同一个 Promise
let refreshPromise: Promise<string> | null = null;

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user') || 'null') as any,
    accessToken: localStorage.getItem('accessToken') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
  }),
  getters: {
    isAuthenticated: (s) => !!s.accessToken,
    isSysAdmin: (s) => (s.user?.systemRoles || []).includes('SysAdmin'),
  },
  actions: {
    async login(email: string, password: string) {
      const res: any = await authApi.login(email, password);
      this.accessToken = res.accessToken;
      this.refreshToken = res.refreshToken;
      this.user = res.user;
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      markActivity();
    },
    setUser(u: any) {
      // 保留 systemRoles 等敏感字段（后端返回可能不含 systemRoles 时不覆盖）
      const merged = { ...(this.user || {}), ...u };
      this.user = merged;
      localStorage.setItem('user', JSON.stringify(merged));
    },
    /** 用 refreshToken 续期，拿到新的 access/refresh token（后端会滚动签发新的 refreshToken）。 */
    refreshTokens(): Promise<string> {
      if (refreshPromise) return refreshPromise;
      const rt = this.refreshToken || localStorage.getItem('refreshToken') || '';
      if (!rt) return Promise.reject(new Error('no refresh token'));
      refreshPromise = (authApi.refresh(rt) as Promise<any>)
        .then((res: any) => {
          this.accessToken = res.accessToken;
          this.refreshToken = res.refreshToken;
          localStorage.setItem('accessToken', res.accessToken);
          localStorage.setItem('refreshToken', res.refreshToken);
          if (res.user) this.setUser(res.user);
          return res.accessToken as string;
        })
        .finally(() => {
          refreshPromise = null;
        });
      return refreshPromise;
    },
    logout() {
      this.accessToken = '';
      this.refreshToken = '';
      this.user = null;
      localStorage.clear();
    },
  },
});
