/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';
import {
  CreateBugInput,
  BugInfo,
  TeambitionAdapter,
} from './teambition.adapter';
import { TbNotAuthorizedError } from './teambition.errors';

/**
 * Real Teambition adapter.
 *
 * Token 取用优先级：
 *   1) per-user OAuth token：input.submitterUserId 指定的用户行里的 tbAccessToken
 *      → B 方案：每个用户首次提交时弹出 TB 授权页扫码登录
 *      → 自动 refresh（如果有 tbRefreshToken）
 *   2) 全局 PAT：TB_ACCESS_TOKEN
 *   3) OAuth client_credentials：TB_APP_ID + TB_APP_SECRET (+ TB_ORG_ID)
 *
 * 接口约定参考 https://open.teambition.com/docs/v3
 */
@Injectable()
export class RealTeambitionAdapter extends TeambitionAdapter {
  private readonly logger = new Logger('RealTeambition');
  private readonly baseUrl =
    process.env.TB_API_BASE || 'https://open.teambition.com';
  private cachedAppToken: { token: string; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super();
  }

  // ---------- public ----------

  async createBug(input: CreateBugInput): Promise<BugInfo> {
    const token = await this.resolveToken(input.submitterUserId);
    const body: any = {
      projectId: input.projectId,
      content: input.title,
      note: input.description,
      ...(input.bugSectionId ? { tasklistId: input.bugSectionId } : {}),
      ...(input.executorId ? { executorId: input.executorId } : {}),
      priority: this.mapPriority(input.priority),
    };

    const res = await this.request<any>(token, 'POST', '/v3/task/create', body);
    const id: string = res?._id || res?.id || res?.data?._id;
    if (!id) {
      throw new Error(
        `Teambition 返回缺失 task id: ${JSON.stringify(res).slice(0, 200)}`,
      );
    }
    const url = `https://www.teambition.com/project/${input.projectId}/task/${id}`;
    return { tbTaskId: id, tbUrl: url, status: '未开始' };
  }

  async getBug(tbTaskId: string): Promise<Partial<BugInfo>> {
    // 状态轮询用全局 token（PAT 或 client_credentials），不需要 per-user
    const token = await this.resolveToken();
    try {
      const res = await this.request<any>(
        token,
        'GET',
        `/v3/task/get?taskId=${encodeURIComponent(tbTaskId)}`,
      );
      const task = res?.data || res;
      if (!task) return { tbTaskId, status: '未知' };
      const status = task?.taskFlowStatus?.name || task?.stage?.name;
      return {
        tbTaskId,
        title: task?.content || undefined,
        status:
          status ||
          (task?.isDone ? '已完成' : task?.isArchived ? '已关闭' : '进行中'),
      };
    } catch (e: any) {
      this.logger.warn(`getBug ${tbTaskId} failed: ${e.message}`);
      return { tbTaskId, status: '未知' };
    }
  }

  async listMembers(projectId: string) {
    const token = await this.resolveToken();
    try {
      const res = await this.request<any>(
        token,
        'GET',
        `/v3/projectMember/list?projectId=${encodeURIComponent(projectId)}`,
      );
      const list: any[] = res?.data || res?.result || res || [];
      return list.map((m: any) => ({
        id: m.userId || m._id || m.id,
        name: m.name || m.realName || m.displayName,
        email: m.email,
      }));
    } catch (e: any) {
      this.logger.warn(`listMembers ${projectId} failed: ${e.message}`);
      return [];
    }
  }

  parseUrl(url: string) {
    const m = url.match(
      /teambition\.com\/project\/([a-f0-9]{24})(?:\/(?:bug\/section|tasks\/group)\/([a-f0-9]{24}))?/i,
    );
    if (!m) return null;
    return { tbProjectId: m[1], tbBugSectionId: m[2] };
  }

  // ---------- token resolution ----------

  /**
   * 取 token 顺序：
   * - 若给了 userId 且该用户有 tbAccessToken：优先用，必要时 refresh
   * - 否则用全局 PAT
   * - 否则用 OAuth client_credentials
   */
  async resolveToken(userId?: number): Promise<string> {
    if (userId) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user?.tbAccessToken) {
        const expiresAt = user.tbTokenExpiresAt
          ? new Date(user.tbTokenExpiresAt).getTime()
          : 0;
        if (expiresAt - 60_000 > Date.now()) {
          return user.tbAccessToken;
        }
        // 尝试 refresh
        if (user.tbRefreshToken) {
          try {
            const t = await this.refreshUserToken(user);
            return t;
          } catch (e: any) {
            this.logger.warn(`refresh user(${userId}) token failed: ${e.message}`);
            // refresh 失败，清空让前端重新授权
            await this.userRepo.update(user.id, {
              tbAccessToken: null,
              tbRefreshToken: null,
              tbTokenExpiresAt: null,
            });
            throw new TbNotAuthorizedError(
              'Teambition 授权已过期，请重新扫码登录',
            );
          }
        }
        throw new TbNotAuthorizedError();
      }
      // 用户没有 per-user token —— B 方案下这里要直接报错让前端弹授权
      // 但为了兼容（比如管理员手动维护项目时仍能用全局 token），保留 fallback
      if (!process.env.TB_ACCESS_TOKEN && !process.env.TB_APP_ID) {
        throw new TbNotAuthorizedError();
      }
    }

    if (process.env.TB_ACCESS_TOKEN) return process.env.TB_ACCESS_TOKEN;
    return this.getAppToken();
  }

  /** 用 refresh_token 换新 access_token */
  private async refreshUserToken(user: User): Promise<string> {
    const appId = process.env.TB_APP_ID;
    const appSecret = process.env.TB_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('未配置 TB_APP_ID/TB_APP_SECRET，无法 refresh');
    }
    const r = await fetch(`${this.baseUrl}/auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: appSecret,
        refresh_token: user.tbRefreshToken,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`refresh ${r.status}: ${text.slice(0, 200)}`);
    }
    const data: any = await r.json();
    const token: string = data.access_token || data.token;
    const expiresInSec: number = data.expires_in || 3600;
    if (!token) throw new Error('refresh 返回未携带 access_token');
    await this.userRepo.update(user.id, {
      tbAccessToken: token,
      tbRefreshToken: data.refresh_token || user.tbRefreshToken,
      tbTokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
    });
    return token;
  }

  /** OAuth client_credentials 全局 token，带缓存 */
  private async getAppToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAppToken && this.cachedAppToken.expiresAt - 60_000 > now) {
      return this.cachedAppToken.token;
    }
    const appId = process.env.TB_APP_ID;
    const appSecret = process.env.TB_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        '未配置 Teambition 凭据：请在 .env 中设置 TB_ACCESS_TOKEN 或 (TB_APP_ID + TB_APP_SECRET)',
      );
    }
    const r = await fetch(`${this.baseUrl}/auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
        ...(process.env.TB_ORG_ID ? { orgId: process.env.TB_ORG_ID } : {}),
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Teambition 鉴权失败 ${r.status}: ${text.slice(0, 200)}`);
    }
    const data: any = await r.json();
    const token: string = data.access_token || data.token;
    const expiresInSec: number = data.expires_in || 3600;
    if (!token) throw new Error('Teambition 鉴权返回未携带 access_token');
    this.cachedAppToken = { token, expiresAt: now + expiresInSec * 1000 };
    return token;
  }

  private async request<T>(
    token: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!r.ok) {
      throw new Error(
        `[TB ${method} ${path}] ${r.status}: ${text.slice(0, 300)}`,
      );
    }
    return json as T;
  }

  /** 把本系统的"极高/高/普通/低/极低"映射成 TB 的 priority 数值 */
  private mapPriority(p?: string): number {
    switch (p) {
      case '极高':
        return 3;
      case '高':
        return 2;
      case '普通':
        return 1;
      case '低':
      case '极低':
        return 0;
      default:
        return 1;
    }
  }
}
