/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CaseSetCase,
  DefectLink,
  Project,
  Round,
  RoundCaseInstance,
} from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { TeambitionAdapter } from '../../integrations/teambition.adapter';
import { TbNotAuthorizedError } from '../../integrations/teambition.errors';

@Injectable()
export class DefectsService {
  private readonly logger = new Logger('Defects');

  constructor(
    @InjectRepository(DefectLink) private readonly defRepo: Repository<DefectLink>,
    @InjectRepository(RoundCaseInstance) private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(Round) private readonly roundRepo: Repository<Round>,
    @InjectRepository(Project) private readonly pRepo: Repository<Project>,
    private readonly tb: TeambitionAdapter,
  ) {}

  async submit(
    instanceId: number,
    userId: number,
    dto: {
      title: string;
      description?: string;
      severity?: string;
      priority?: string;
      occurrenceProb?: any;
      executorId?: string;
      assigneeUserId?: number;
    },
  ) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E9010', '执行实例不存在', 404 as any);
    const round = await this.roundRepo.findOne({ where: { id: ins.roundId } });
    const project = await this.pRepo.findOne({ where: { id: round.projectId } });
    const tb = this.resolveTb(round, project);
    if (!tb.tbProjectId) throw new BizException('E9001', 'TB 项目未关联');
    const c = await this.caseRepo.findOne({ where: { id: ins.caseId } });

    const description = this.buildDescription(c, ins, round, dto.description);

    const bug = await this.tb
      .createBug({
        projectId: tb.tbProjectId,
        bugSectionId: tb.tbBugSectionId,
        title: dto.title,
        description,
        severity: dto.severity || '一般',
        priority: dto.priority || '普通',
        executorId: dto.executorId,
        softwareVersion: round.softwareVersion,
        caseCode: c?.code,
        roundName: round.name,
        submitterUserId: userId,
      })
      .catch((e) => {
        if (e instanceof TbNotAuthorizedError) {
          // 9009 = 业务码，前端识别后弹起扫码授权窗
          throw new BizException('E9009', e.message, 401 as any);
        }
        throw e;
      });

    return this.defRepo.save(
      this.defRepo.create({
        roundCaseInstanceId: instanceId,
        projectId: project.id,
        tbProjectId: tb.tbProjectId,
        tbBugSectionId: tb.tbBugSectionId,
        tbTaskId: bug.tbTaskId,
        tbUrl: bug.tbUrl,
        tbStatus: bug.status,
        title: dto.title,
        description,
        severity: dto.severity || '一般',
        priority: dto.priority || '普通',
        occurrenceProb: dto.occurrenceProb || 'LOW',
        tbExecutorId: dto.executorId,
        assigneeUserId: dto.assigneeUserId || null,
        lastSyncedAt: new Date(),
        createdBy: userId,
      }),
    );
  }

  /**
   * 解析该轮次实际使用的 TB 缺陷分组配置（"TB 路径"）：
   * 优先用轮次级配置，未配置时回退到项目级，保证既有项目不受影响。
   */
  private resolveTb(round: Round | null, project: Project | null) {
    return {
      tbProjectId: round?.tbProjectId || project?.tbProjectId || null,
      tbBugSectionId: round?.tbBugSectionId || project?.tbBugSectionId || null,
      tbBugSectionUrl: round?.tbBugSectionUrl || project?.tbBugSectionUrl || null,
    };
  }

  private buildDescription(c: CaseSetCase | null, ins: RoundCaseInstance, r: Round, extra?: string) {
    const lines: string[] = [];
    lines.push(`### 关联用例: ${c?.code || ''} - ${c?.title || ''}`);
    lines.push(`### 关联轮次: ${r.name}（版本 ${r.softwareVersion}）`);
    if (c?.precondition) lines.push(`\n**前置条件**\n${c.precondition}`);
    if (c?.steps) lines.push(`\n**复现步骤**\n${c.steps}`);
    if (c?.expectedResult) lines.push(`\n**预期结果**\n${c.expectedResult}`);
    if (ins.actualResult) lines.push(`\n**实际结果**\n${ins.actualResult}`);
    if (extra) lines.push(`\n**补充说明**\n${extra}`);
    return lines.join('\n');
  }

  async listByInstance(instanceId: number) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) return [];
    // 同项目下、所有轮次中、同一 caseId 的全部执行实例对应的缺陷
    const round = await this.roundRepo.findOne({ where: { id: ins.roundId } });
    if (!round) {
      return this.defRepo.find({
        where: { roundCaseInstanceId: instanceId },
        order: { id: 'DESC' },
      });
    }
    const sameProjectRounds = await this.roundRepo.find({ where: { projectId: round.projectId } });
    const roundIds = sameProjectRounds.map((r) => r.id);
    const peerInstances = await this.rciRepo.find({
      where: { caseId: ins.caseId, roundId: In(roundIds) },
    });
    const peerIds = peerInstances.map((p) => p.id);
    if (!peerIds.length) return [];
    const list = await this.defRepo.find({
      where: { roundCaseInstanceId: In(peerIds) },
      order: { id: 'DESC' },
    });
    // 附带来源轮次名，便于前端区分
    const instMap = new Map(peerInstances.map((p) => [p.id, p]));
    const roundMap = new Map(sameProjectRounds.map((r) => [r.id, r]));
    return list.map((d) => {
      const srcIns = instMap.get(d.roundCaseInstanceId);
      const srcRound = srcIns ? roundMap.get(srcIns.roundId) : undefined;
      return {
        ...d,
        sourceRoundId: srcRound?.id,
        sourceRoundName: srcRound?.name,
        isCurrentRound: srcIns?.roundId === ins.roundId,
      };
    });
  }

  /**
   * 手动模式：不调 TB API。仅在本系统落一份草稿缺陷，把标题/描述/跳转 URL
   * 返回给前端，由用户自己在 TB 网页上登录并新建任务，完成后用 attachTbTask
   * 把 TB 任务的 URL 关联回来。
   */
  async submitManual(
    instanceId: number,
    userId: number,
    dto: {
      title: string;
      description?: string;
      severity?: string;
      priority?: string;
      occurrenceProb?: any;
      assigneeUserId?: number;
    },
  ) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E9010', '执行实例不存在', 404 as any);
    const round = await this.roundRepo.findOne({ where: { id: ins.roundId } });
    const project = await this.pRepo.findOne({ where: { id: round.projectId } });
    const tb = this.resolveTb(round, project);
    if (!tb.tbProjectId) throw new BizException('E9001', 'TB 项目未关联');
    const c = await this.caseRepo.findOne({ where: { id: ins.caseId } });

    const description = this.buildDescription(c, ins, round, dto.description);

    // 落本地草稿
    const def = await this.defRepo.save(
      this.defRepo.create({
        roundCaseInstanceId: instanceId,
        projectId: project.id,
        tbProjectId: tb.tbProjectId,
        tbBugSectionId: tb.tbBugSectionId,
        tbTaskId: 'DRAFT',
        tbUrl: null,
        tbStatus: '待关联',
        title: dto.title,
        description,
        severity: dto.severity || '一般',
        priority: dto.priority || '普通',
        occurrenceProb: dto.occurrenceProb || 'LOW',
        assigneeUserId: dto.assigneeUserId || null,
        createdBy: userId,
      }),
    );

    // 拼好的 TB 跳转 URL（缺陷分组页 / 项目页）——优先用轮次配置的原始 URL
    const tbBugSectionUrl = tb.tbBugSectionUrl
      || (tb.tbBugSectionId
        ? `https://www.teambition.com/project/${tb.tbProjectId}/bug/section/${tb.tbBugSectionId}`
        : `https://www.teambition.com/project/${tb.tbProjectId}`);

    return {
      defect: def,
      prefill: {
        title: dto.title,
        description,
        tbBugSectionUrl,
      },
    };
  }

  /** 用户在 TB 上提完任务后关联。传 taskId 或 tbUrl 都行。 */
  async attachTbTask(defectId: number, dto: { tbUrl?: string; taskId?: string; title?: string }) {
    const def = await this.defRepo.findOne({ where: { id: defectId } });
    if (!def) throw new BizException('E9011', '缺陷不存在', 404 as any);
    let taskId = (dto.taskId || '').trim();
    if (!taskId && dto.tbUrl) {
      const m = dto.tbUrl.match(/\/task\/([a-zA-Z0-9_-]{16,})/i);
      if (m) taskId = m[1];
    }
    if (!taskId) {
      throw new BizException('E9012', '不是合法的 Teambition 任务 URL（需含 /task/ 部分）');
    }
    // 用缺陷创建时落库的 TB 项目 ID（已按轮次/项目解析），回退到项目级
    const project = await this.pRepo.findOne({ where: { id: def.projectId } });
    const pid = def.tbProjectId || project?.tbProjectId;
    const tbUrl = pid
      ? `https://www.teambition.com/project/${pid}/bug/task/${taskId}`
      : (dto.tbUrl || `https://www.teambition.com/task/${taskId}`);
    // 关联时回显 TB 缺陷标题：优先用油猜脚本从 TB 页面 DOM 读到的标题，
    // 其次回退到服务端 getBug（两者都拿不到则不动原标题）。
    let tbTitle: string | undefined = (dto.title || '').trim() || undefined;
    let tbStatus = '待处理';
    try {
      const info = await this.tb.getBug(taskId);
      if (!tbTitle && info?.title) tbTitle = info.title;
      if (info?.status) tbStatus = info.status;
    } catch (e: any) {
      this.logger.warn(`attachTbTask getBug ${taskId} failed: ${e.message}`);
    }
    await this.defRepo.update(def.id, {
      tbTaskId: taskId,
      tbUrl,
      tbStatus,
      ...(tbTitle ? { title: tbTitle } : {}),
      lastSyncedAt: new Date(),
    });
    return this.defRepo.findOne({ where: { id: def.id } });
  }

  /** 用户手动同步 TB 状态（脉剣火柴：油猜脚本读取 TB 任务页 DOM 状态后回传） */
  async syncTbStatus(defectId: number, status: string, title?: string) {
    const def = await this.defRepo.findOne({ where: { id: defectId } });
    if (!def) throw new BizException('E9011', '缺陷不存在', 404 as any);
    // 回显 TB 缺陷标题：优先用油猜脚本从页面 DOM 读到的标题，其次回退 getBug
    let tbTitle: string | undefined = (title || '').trim() || undefined;
    if (!tbTitle && def.tbTaskId && def.tbTaskId !== 'DRAFT') {
      try {
        const info = await this.tb.getBug(def.tbTaskId);
        if (info?.title) tbTitle = info.title;
      } catch (e: any) {
        this.logger.warn(`syncTbStatus getBug ${def.tbTaskId} failed: ${e.message}`);
      }
    }
    await this.defRepo.update(def.id, {
      tbStatus: status || def.tbStatus,
      ...(tbTitle ? { title: tbTitle } : {}),
      lastSyncedAt: new Date(),
    });
    return this.defRepo.findOne({ where: { id: def.id } });
  }

  /** 删除一条缺陷（仅创建人或管理员；这里先放开供调试） */
  async remove(defectId: number) {
    await this.defRepo.delete(defectId);
    return { ok: true };
  }

  async listByProject(projectId: number, q: { status?: string; severity?: string; q?: string }) {
    const ids = await this.descendantProjectIds(projectId);
    const qb = this.defRepo
      .createQueryBuilder('d')
      .where('d.projectId IN (:...pids)', { pids: ids })
      .orderBy('d.id', 'DESC');
    if (q.status) qb.andWhere('d.tbStatus = :s', { s: q.status });
    if (q.severity) qb.andWhere('d.severity = :sv', { sv: q.severity });
    if (q.q) qb.andWhere('d.title LIKE :q', { q: `%${q.q}%` });
    return qb.getMany();
  }

  /** 收集某项目子树下所有项目 id（含自身）——缺陷看板按层级聚合后代 */
  private async descendantProjectIds(id: number): Promise<number[]> {
    const all = await this.pRepo.find();
    const childrenOf = new Map<number, number[]>();
    for (const p of all) {
      const pid = (p as any).parentId;
      if (pid != null) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid)!.push(p.id);
      }
    }
    const out: number[] = [];
    const stack = [id];
    const seen = new Set<number>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      for (const c of childrenOf.get(cur) || []) stack.push(c);
    }
    return out;
  }

  async dashboard(projectId: number) {
    const ids = await this.descendantProjectIds(projectId);
    const all = await this.defRepo.find({ where: { projectId: In(ids) } });
    const total = all.length;
    const closed = all.filter((d) => ['已完成', '已关闭'].includes(d.tbStatus)).length;
    const open = total - closed;
    const now = Date.now();
    const aWeekAgo = now - 7 * 24 * 3600 * 1000;
    const newThisWeek = all.filter((d) => +new Date(d.createdAt) >= aWeekAgo).length;

    const groupBy = (key: string) => {
      const m: Record<string, number> = {};
      for (const d of all) {
        const k = (d as any)[key] || '未知';
        m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    };

    // 30 天趋势
    const trend: { date: string; created: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const cnt = all.filter((d) => new Date(d.createdAt).toISOString().slice(0, 10) === day).length;
      trend.push({ date: day, created: cnt });
    }

    // 老化
    const aging: Record<string, number> = { '0-3': 0, '4-7': 0, '8-14': 0, '15+': 0 };
    for (const d of all) {
      if (['已完成', '已关闭'].includes(d.tbStatus)) continue;
      const days = Math.floor((now - +new Date(d.createdAt)) / 86400000);
      if (days <= 3) aging['0-3']++;
      else if (days <= 7) aging['4-7']++;
      else if (days <= 14) aging['8-14']++;
      else aging['15+']++;
    }

    return {
      total,
      open,
      closed,
      newThisWeek,
      bySeverity: groupBy('severity'),
      byStatus: groupBy('tbStatus'),
      trend,
      aging: Object.entries(aging).map(([range, value]) => ({ range, value })),
    };
  }

  /** Periodically sync status from Teambition (mock cycles through statuses) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncFromTb() {
    const open = await this.defRepo.find({
      where: { tbStatus: In(['未开始', '进行中']) },
    });
    for (const d of open) {
      try {
        const info = await this.tb.getBug(d.tbTaskId);
        let changed = false;
        if (info?.status && info.status !== d.tbStatus) {
          d.tbStatus = info.status;
          changed = true;
        }
        if (info?.title && info.title !== d.title) {
          d.title = info.title;
          changed = true;
        }
        if (changed) {
          d.lastSyncedAt = new Date();
          await this.defRepo.save(d);
        }
      } catch (e: any) {
        this.logger.warn(`Sync ${d.tbTaskId} failed: ${e.message}`);
      }
    }
  }

  async manualSync(projectId?: number) {
    await this.syncFromTb();
    return { ok: true };
  }
}
