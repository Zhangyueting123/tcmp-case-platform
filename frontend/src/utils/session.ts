/**
 * @author zhangyueting
 * @date 2026-07-08
 * 会话守护：滑动过期 + 空闲登出。
 * - 监听用户交互事件，持续刷新「最近活动时间」。
 * - 定时巡检：用户活跃且 token 临近过期 → 静默续期；空闲超限 → 登出并跳登录。
 */
import router from '@/router';
import { useAuthStore } from '@/stores/auth';
import {
  IDLE_LIMIT_MS,
  REFRESH_MARGIN_MS,
  CHECK_INTERVAL_MS,
  markActivity,
  getLastActivity,
  decodeTokenExp,
} from './activity';

let timer: number | null = null;
let listenersBound = false;

const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'wheel', 'scroll', 'touchstart'];

function forceLogout() {
  const auth = useAuthStore();
  auth.logout();
  if (router.currentRoute.value.path !== '/login') {
    router.replace('/login');
  }
}

async function tick() {
  const token = localStorage.getItem('accessToken');
  if (!token) return; // 未登录，无需处理
  const now = Date.now();
  // 空闲超时：长时间无操作 → 会话过期
  if (now - getLastActivity() > IDLE_LIMIT_MS) {
    forceLogout();
    return;
  }
  // 活跃中：token 临近过期则提前续期，保证「一直操作不掉线」
  const exp = decodeTokenExp(token);
  if (exp && exp - now < REFRESH_MARGIN_MS) {
    try {
      await useAuthStore().refreshTokens();
    } catch {
      forceLogout();
    }
  }
}

export function startSession(): void {
  if (!listenersBound) {
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, markActivity, { passive: true }),
    );
    listenersBound = true;
  }
  if (timer == null) {
    markActivity();
    timer = window.setInterval(tick, CHECK_INTERVAL_MS);
  }
}

export function stopSession(): void {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}
