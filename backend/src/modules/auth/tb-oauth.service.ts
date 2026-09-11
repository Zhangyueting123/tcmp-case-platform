/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';

/**
 * Teambition OAuth2 (B 方案)
 * - /auth/tb/start  生成授权 URL，前端弹窗打开
 * - /auth/tb/callback?code=&state=  用 code 换 token，存到当前用户行
 * - /auth/tb/status 返回当前用户授权状态
 * - /auth/tb/revoke 清除当前用户的 TB token
 *
 * 注意：本路由依赖 .env 中的：
 *   TB_APP_ID / TB_APP_SECRET
 *   TB_OAUTH_REDIRECT_URI   —— TB 应用控制台里填写的回调地址，必须完整 URL
 *   TB_API_BASE             —— 默认 https://open.teambition.com
 *   TB_AUTHORIZE_URL        —— 可覆盖；默认拼成 ${TB_API_BASE}/oauth2/authorize
 *   TB_TOKEN_URL            —— 可覆盖；默认拼成 ${TB_API_BASE}/auth/v1/token
 *
 *   FRONTEND_URL            —— 用于回调完成后跳转的前端页面（默认 http://localhost:5173）
 */
@Injectable()
export class TbOauthService {
  private readonly logger = new Logger('TbOauthService');
  private readonly baseUrl = process.env.TB_API_BASE || 'https://open.teambition.com';

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  buildAuthorizeUrl(userId: number): string {
    const appId = process.env.TB_APP_ID;
    const redirect = process.env.TB_OAUTH_REDIRECT_URI;
    if (!appId) throw new BizException('E9101', '未配置 TB_APP_ID，无法启动 OAuth');
    if (!redirect) {
      throw new BizException(
        'E9102',
        '未配置 TB_OAUTH_REDIRECT_URI，例如 http://localhost:3000/api/v1/auth/tb/callback',
      );
    }
    // state 用 JWT 签名以防 CSRF，并把 userId 透传过去
    const state = this.jwt.sign(
      { sub: userId, kind: 'tb-oauth' },
      { expiresIn: '10m' },
    );
    const url = new URL(process.env.TB_AUTHORIZE_URL || `${this.baseUrl}/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('state', state);
    // 部分企业版需要 scope，按 Teambition 文档常用集合
    url.searchParams.set('scope', 'task:read task:write project:read projectMember:read');
    return url.toString();
  }

  /** 用 code 换 token，写入指定用户 */
  async handleCallback(code: string, state: string): Promise<User> {
    const appId = process.env.TB_APP_ID;
    const appSecret = process.env.TB_APP_SECRET;
    const redirect = process.env.TB_OAUTH_REDIRECT_URI;
    if (!appId || !appSecret || !redirect) {
      throw new BizException('E9103', '未配置 TB OAuth 凭据');
    }

    // 校验 state
    let payload: any;
    try {
      payload = this.jwt.verify(state);
    } catch {
      throw new BizException('E9104', 'state 校验失败或已过期');
    }
    if (payload?.kind !== 'tb-oauth' || !payload?.sub) {
      throw new BizException('E9105', 'state 内容非法');
    }
    const userId: number = payload.sub;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BizException('E9106', '用户不存在');

    const tokenUrl = process.env.TB_TOKEN_URL || `${this.baseUrl}/auth/v1/token`;
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: redirect,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new BizException(
        'E9107',
        `Teambition 鉴权失败 ${r.status}: ${text.slice(0, 300)}`,
      );
    }
    const data: any = await r.json();
    const accessToken: string = data.access_token || data.token;
    const refreshToken: string | null = data.refresh_token || null;
    const expiresInSec: number = data.expires_in || 3600;
    if (!accessToken) {
      throw new BizException('E9108', 'TB 返回未携带 access_token');
    }

    // 取一下 TB 个人信息（用于显示「已授权为 XXX」）
    let tbUserId = '';
    let tbUserName = '';
    try {
      const profileUrl = `${this.baseUrl}/v3/user/me`;
      const pr = await fetch(profileUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (pr.ok) {
        const pd: any = await pr.json();
        tbUserId = pd?._id || pd?.id || pd?.data?._id || '';
        tbUserName = pd?.name || pd?.displayName || pd?.data?.name || '';
      }
    } catch (e: any) {
      this.logger.warn(`fetch tb profile failed: ${e.message}`);
    }

    await this.userRepo.update(user.id, {
      tbAccessToken: accessToken,
      tbRefreshToken: refreshToken,
      tbTokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
      tbUserId,
      tbUserName,
    });
    return this.userRepo.findOne({ where: { id: user.id } });
  }

  async status(userId: number) {
    const u = await this.userRepo.findOne({ where: { id: userId } });
    if (!u?.tbAccessToken) return { authorized: false };
    const expiresAt = u.tbTokenExpiresAt ? new Date(u.tbTokenExpiresAt).getTime() : 0;
    return {
      authorized: expiresAt - 60_000 > Date.now() || !!u.tbRefreshToken,
      tbUserId: u.tbUserId,
      tbUserName: u.tbUserName,
      expiresAt: u.tbTokenExpiresAt,
    };
  }

  async revoke(userId: number) {
    await this.userRepo.update(userId, {
      tbAccessToken: null,
      tbRefreshToken: null,
      tbTokenExpiresAt: null,
      tbUserId: null,
      tbUserName: null,
    });
    return { ok: true };
  }
}
