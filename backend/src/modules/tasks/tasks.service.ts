/**
 * @author zhangyueting
 * @date 2026-07-29
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CaseReview,
  CaseSet,
  Project,
  Round,
  RoundCaseInstance,
} from '../../entities';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(RoundCaseInstance) private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(Round) private readonly roundRepo: Repository<Round>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(CaseReview) private readonly reviewRepo: Repository<CaseReview>,
    @InjectRepository(CaseSet) private readonly caseSetRepo: Repository<CaseSet>,
  ) {}

  private timeOf(v: Date | string | null | undefined): number {
    if (!v) return 0;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  /** 当前用户「需要执行的任务」：待执行用例（按轮次聚合）+ 待评审/待修订。 */
  async getMyTasks(userId: number) {
    // 1) 执行任务：分配给我且未执行(PENDING)的实例，按轮次聚合，跳过已关闭轮次
    const pending = await this.rciRepo.find({
      where: { assigneeUserId: userId, result: 'PENDING' },
    });
    const roundIds = [...new Set(pending.map((p) => p.roundId))];
    const rounds = roundIds.length
      ? await this.roundRepo.find({ where: { id: In(roundIds) } })
      : [];
    const roundMap = new Map(rounds.map((r) => [r.id, r]));
    const countByRound = new Map<number, number>();
    for (const p of pending) countByRound.set(p.roundId, (countByRound.get(p.roundId) || 0) + 1);
    const projIds = [...new Set(rounds.map((r) => r.projectId))];
    const projs = projIds.length
      ? await this.projectRepo.find({ where: { id: In(projIds) } })
      : [];
    const projMap = new Map(projs.map((p) => [p.id, p]));

    const executions: any[] = [];
    for (const [rid, cnt] of countByRound) {
      const r = roundMap.get(rid);
      if (!r || r.status === 'CLOSED') continue; // 已关闭轮次不再作为待办
      executions.push({
        roundId: rid,
        projectId: r.projectId,
        projectName: projMap.get(r.projectId)?.name || `项目#${r.projectId}`,
        roundName: r.name,
        softwareVersion: r.softwareVersion,
        status: r.status,
        pendingCount: cnt,
        createdAt: r.createdAt,
        plannedStart: r.plannedStart,
        plannedEnd: r.plannedEnd,
      });
    }
    // 最新创建的轮次排最前；时间相同时用 id 兜底，保证顺序稳定
    executions.sort(
      (a, b) => this.timeOf(b.createdAt) - this.timeOf(a.createdAt) || b.roundId - a.roundId,
    );

    // 2) 评审任务：我作为成员且评审中(待评审)，或我作为发起者且修订中(待修订)
    const reviewsAll = await this.reviewRepo.find({
      where: { status: In(['IN_REVIEW', 'REVISING']) },
      order: { createdAt: 'DESC' },
    });
    const reviews: any[] = [];
    for (const rv of reviewsAll) {
      let action: string | null = null;
      if (rv.status === 'IN_REVIEW' && (rv.reviewerUserIds || []).includes(userId)) {
        action = 'REVIEW';
      } else if (rv.status === 'REVISING' && rv.initiatorUserId === userId) {
        action = 'REVISE';
      }
      if (!action) continue;
      reviews.push({
        reviewId: rv.id,
        title: rv.title,
        caseSetId: rv.caseSetId,
        caseCount: (rv.caseIdsSnapshot || []).length,
        status: rv.status,
        action,
        actionLabel: action === 'REVIEW' ? '待评审' : '待修订',
        createdAt: rv.createdAt,
      });
    }
    const csIds = [...new Set(reviews.map((r) => r.caseSetId))];
    const css = csIds.length ? await this.caseSetRepo.find({ where: { id: In(csIds) } }) : [];
    const csMap = new Map(css.map((c) => [c.id, c.name]));
    for (const r of reviews) r.caseSetName = csMap.get(r.caseSetId) || `用例集#${r.caseSetId}`;

    const pendingTotal = executions.reduce((s, e) => s + e.pendingCount, 0);
    return {
      executions,
      reviews,
      summary: {
        pendingCaseCount: pendingTotal,
        roundCount: executions.length,
        reviewCount: reviews.length,
        total: pendingTotal + reviews.length,
      },
    };
  }
}
