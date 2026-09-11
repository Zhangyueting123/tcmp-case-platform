/**
 * @author zhangyueting
 * @date 2026-06-10
 */
/** 当本系统未取得（或已过期且无法 refresh）的当前用户 Teambition token */
export class TbNotAuthorizedError extends Error {
  code = 'TB_NOT_AUTHORIZED';
  constructor(msg = '当前用户尚未授权 Teambition，请扫码登录') {
    super(msg);
  }
}
