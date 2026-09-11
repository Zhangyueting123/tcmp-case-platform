/**
 * @author zhangyueting
 * @date 2026-07-08
 * 会话活动检测（叶子模块，不依赖 store/router/api，避免循环引用）。
 * 用于「滑动过期」：只要用户一直在操作就不断续期 token；长时间不操作才让其过期。
 */

// 空闲超过该时长（无任何用户交互）则视为会话过期，需重新登录。
export const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 分钟
// accessToken 剩余有效期低于该阈值且用户仍活跃时，提前静默续期。
export const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 分钟
// 后台巡检间隔。
export const CHECK_INTERVAL_MS = 30 * 1000; // 30 秒

const ACTIVITY_KEY = 'lastActivity';
let lastWrite = 0;

/** 记录一次用户活动（节流：最多每 5 秒写一次 localStorage，跨标签页共享）。 */
export function markActivity(): void {
  const now = Date.now();
  if (now - lastWrite < 5000) return;
  lastWrite = now;
  localStorage.setItem(ACTIVITY_KEY, String(now));
}

/** 读取最近一次活动时间戳（无记录时按「刚刚活动」处理）。 */
export function getLastActivity(): number {
  const v = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
  return v > 0 ? v : Date.now();
}

/** 从 JWT 中解出过期时间（毫秒）；解析失败返回 0。 */
export function decodeTokenExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
}
