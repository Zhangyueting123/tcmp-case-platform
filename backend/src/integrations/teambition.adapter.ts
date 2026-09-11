/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface CreateBugInput {
  projectId: string;
  bugSectionId?: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  executorId?: string;
  softwareVersion?: string;
  caseCode?: string;
  roundName?: string;
  /** 提交者在本系统的用户 id，用于按用户取 Teambition OAuth token（B 方案） */
  submitterUserId?: number;
}

export interface BugInfo {
  tbTaskId: string;
  tbUrl: string;
  status: string;
  /** TB 缺陷标题（内容），关联时回显用 */
  title?: string;
}

export abstract class TeambitionAdapter {
  abstract createBug(input: CreateBugInput): Promise<BugInfo>;
  abstract getBug(tbTaskId: string): Promise<Partial<BugInfo>>;
  abstract listMembers(projectId: string): Promise<{ id: string; name: string; email?: string }[]>;
  abstract parseUrl(
    url: string,
  ): { tbProjectId: string; tbBugSectionId?: string } | null;
}

const STATUS_CYCLE = ['未开始', '进行中', '已完成', '已关闭'];

@Injectable()
export class MockTeambitionAdapter extends TeambitionAdapter {
  private readonly logger = new Logger('MockTeambition');
  private readonly store = new Map<string, BugInfo & { _ts: number }>();

  async createBug(input: CreateBugInput): Promise<BugInfo> {
    const id = uuidv4().replace(/-/g, '').slice(0, 24);
    const url = `https://www.teambition.com/project/${input.projectId}/task/${id}`;
    const info: BugInfo = { tbTaskId: id, tbUrl: url, status: '未开始', title: input.title };
    this.store.set(id, { ...info, _ts: Date.now() });
    this.logger.log(`[MOCK TB CREATE] ${id} "${input.title}" -> ${url}`);
    return info;
  }
  async getBug(tbTaskId: string): Promise<Partial<BugInfo>> {
    const stored = this.store.get(tbTaskId);
    if (!stored) return { tbTaskId, status: '已关闭' };
    // Cycle status every 10 minutes for demo
    const minutesPassed = Math.floor((Date.now() - stored._ts) / 60000);
    const idx = Math.min(Math.floor(minutesPassed / 10), STATUS_CYCLE.length - 1);
    return { ...stored, status: STATUS_CYCLE[idx], title: stored.title };
  }
  async listMembers(projectId: string) {
    return [
      { id: 'tb_u_admin', name: '管理员', email: 'admin@company.com' },
      { id: 'tb_u_tester', name: '测试员甲', email: 'tester1@company.com' },
    ];
  }
  parseUrl(url: string) {
    const m = url.match(
      /teambition\.com\/project\/([a-f0-9]{24})(?:\/bug\/section\/([a-f0-9]{24}))?/i,
    );
    if (!m) return null;
    return { tbProjectId: m[1], tbBugSectionId: m[2] };
  }
}
