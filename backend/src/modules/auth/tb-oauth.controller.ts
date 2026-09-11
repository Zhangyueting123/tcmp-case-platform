/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser } from '../../common/decorators';
import { TbOauthService } from './tb-oauth.service';

@ApiTags('auth')
@Controller('auth/tb')
export class TbOauthController {
  constructor(private readonly svc: TbOauthService) {}

  /** 当前登录用户请求生成 TB 授权 URL（要求已登录） */
  @Get('start')
  start(@CurrentUser() user: any) {
    const url = this.svc.buildAuthorizeUrl(user.sub);
    return { url };
  }

  /** 当前登录用户查询自己的 TB 授权状态 */
  @Get('status')
  status(@CurrentUser() user: any) {
    return this.svc.status(user.sub);
  }

  /** 解除当前用户授权 */
  @Post('revoke')
  revoke(@CurrentUser() user: any) {
    return this.svc.revoke(user.sub);
  }

  /**
   * TB 授权回调（公开访问，因为是 TB 服务器跳转过来的）
   * 完成后返回一段 HTML：先 postMessage 给 opener 窗口，再自动关闭弹窗
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res
        .type('text/html; charset=utf-8')
        .send(html({ ok: false, error: `TB 返回错误：${error}` }));
    }
    if (!code || !state) {
      return res
        .type('text/html; charset=utf-8')
        .send(html({ ok: false, error: '缺少 code 或 state' }));
    }
    try {
      const user = await this.svc.handleCallback(code, state);
      return res.type('text/html; charset=utf-8').send(
        html({
          ok: true,
          tbUserName: user.tbUserName || '(未取到 TB 昵称)',
        }),
      );
    } catch (e: any) {
      return res
        .type('text/html; charset=utf-8')
        .send(html({ ok: false, error: e?.message || String(e) }));
    }
  }
}

function html(payload: any) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Teambition 授权</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;padding:40px;text-align:center}h2{color:${payload.ok ? '#67c23a' : '#f56c6c'}}</style>
</head><body>
<h2>${payload.ok ? '✓ Teambition 授权成功' : '✗ Teambition 授权失败'}</h2>
${payload.ok ? `<p>已绑定 TB 账号：<b>${payload.tbUserName}</b></p><p>本窗口将自动关闭...</p>` : `<p style="color:#f56c6c">${payload.error || ''}</p><p>关闭本窗口后重试，或联系管理员。</p>`}
<script>
  try {
    if (window.opener) window.opener.postMessage({ type: 'tb-oauth', payload: ${json} }, '*');
  } catch (e) {}
  setTimeout(() => { try { window.close(); } catch (e) {} }, ${payload.ok ? 1500 : 6000});
</script>
</body></html>`;
}
