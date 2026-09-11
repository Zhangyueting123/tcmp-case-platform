/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CaseSet,
  CaseSetCase,
  ModuleNode,
  Round,
  RoundCaseInstance,
} from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { FilterCompiler } from './filter-compiler';
import { DingtalkAdapter } from '../../integrations/dingtalk.adapter';
import { TeambitionAdapter } from '../../integrations/teambition.adapter';

@Injectable()
export class RoundsService {
  constructor(
    @InjectRepository(Round) private readonly repo: Repository<Round>,
    @InjectRepository(RoundCaseInstance)
    private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(CaseSet) private readonly caseSetRepo: Repository<CaseSet>,
    @InjectRepository(ModuleNode) private readonly moduleRepo: Repository<ModuleNode>,
    private readonly compiler: FilterCompiler,
    private readonly ding: DingtalkAdapter,
    private readonly tb: TeambitionAdapter,
  ) {}

  /**
   * 解析轮次的 TB 缺陷分组 URL（"TB 路径"），写回 tbProjectId / tbBugSectionId。
   * 传空字符串表示清除该轮次配置（回退到项目级）。
   */
  private applyTbUrl(patch: any, tbBugSectionUrl: string | undefined) {
    if (tbBugSectionUrl === undefined) return;
    if (tbBugSectionUrl) {
      const parsed = this.tb.parseUrl(tbBugSectionUrl);
      if (!parsed) throw new BizException('E5005', 'Teambition URL 无法解析');
      patch.tbBugSectionUrl = tbBugSectionUrl;
      patch.tbProjectId = parsed.tbProjectId;
      patch.tbBugSectionId = parsed.tbBugSectionId;
    } else {
      patch.tbBugSectionUrl = null;
      patch.tbProjectId = null;
      patch.tbBugSectionId = null;
    }
  }

  async list(projectId: number) {
    return this.repo.find({ where: { projectId }, order: { id: 'DESC' } });
  }

  async create(projectId: number, userId: number, dto: any) {
    if (!dto.name || !dto.softwareVersion) {
      throw new BizException('E5003', '轮次名称与被测版本必填');
    }
    const base: any = {
      projectId,
      name: dto.name,
      softwareVersion: dto.softwareVersion,
      previousRoundId: dto.previousRoundId,
      filterExpr: dto.filterExpr,
      plannedStart: dto.plannedStart,
      plannedEnd: dto.plannedEnd,
      testEnvironment: dto.testEnvironment,
      softwarePath: dto.softwarePath,
      createdBy: userId,
    };
    this.applyTbUrl(base, dto.tbBugSectionUrl);
    const round = await this.repo.save(this.repo.create(base));
    return round;
  }

  async detail(id: number) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new BizException('E5004', '轮次不存在', 404 as any);
    return r;
  }

  async update(id: number, dto: any) {
    await this.detail(id);
    // 保存新的筛选条件时，自动清空手动排除清单（让重新筛选生效）
    const patch: any = { ...dto };
    if (Object.prototype.hasOwnProperty.call(dto, 'name')) {
      const name = (dto.name || '').trim();
      if (!name) throw new BizException('E5012', '轮次名不能为空');
      if (name.length > 64) throw new BizException('E5013', '轮次名不能超过 64 字');
      patch.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'filterExpr')) {
      patch.excludedCaseIds = [];
    }
    // TB 路径：解析 URL 写回 tbProjectId / tbBugSectionId
    if (Object.prototype.hasOwnProperty.call(dto, 'tbBugSectionUrl')) {
      this.applyTbUrl(patch, dto.tbBugSectionUrl);
    }
    await this.repo.update(id, patch);
    return this.detail(id);
  }

  async preview(id: number) {
    const r = await this.detail(id);
    let ids = await this.compiler.matchCaseIds(r.projectId, r.filterExpr);
    const excluded = new Set<number>((r.excludedCaseIds || []).map((x: any) => Number(x)));
    if (excluded.size) ids = ids.filter((cid) => !excluded.has(cid));
    if (!ids.length) return { count: 0, cases: [] };
    const cases = await this.caseRepo.find({ where: { id: In(ids) } });
    const enriched = await this.enrichCases(cases);
    return { count: enriched.length, cases: enriched };
  }

  async excludeCases(id: number, caseIds: number[]) {
    const r = await this.detail(id);
    const cur = new Set<number>((r.excludedCaseIds || []).map((x: any) => Number(x)));
    for (const cid of caseIds || []) cur.add(Number(cid));
    await this.repo.update(id, { excludedCaseIds: Array.from(cur) });
    return { excludedCaseIds: Array.from(cur) };
  }

  async restoreCases(id: number, caseIds?: number[]) {
    const r = await this.detail(id);
    if (!caseIds || !caseIds.length) {
      await this.repo.update(id, { excludedCaseIds: [] });
      return { excludedCaseIds: [] };
    }
    const cur = new Set<number>((r.excludedCaseIds || []).map((x: any) => Number(x)));
    for (const cid of caseIds) cur.delete(Number(cid));
    await this.repo.update(id, { excludedCaseIds: Array.from(cur) });
    return { excludedCaseIds: Array.from(cur) };
  }

  private async enrichCases(cases: CaseSetCase[]) {
    if (!cases.length) return [] as any[];
    const caseSetIds = Array.from(new Set(cases.map((c) => c.caseSetId)));
    const moduleIds = Array.from(new Set(cases.map((c) => c.moduleId).filter(Boolean)));
    const caseSets = caseSetIds.length
      ? await this.caseSetRepo.find({ where: { id: In(caseSetIds) } })
      : [];
    const csMap = new Map(caseSets.map((cs) => [cs.id, cs]));

    const allModules = new Map<number, ModuleNode>();
    let queue = moduleIds;
    while (queue.length) {
      const found = await this.moduleRepo.find({ where: { id: In(queue) } });
      const next: number[] = [];
      for (const n of found) {
        if (!allModules.has(n.id)) allModules.set(n.id, n);
        if (n.parentId && !allModules.has(n.parentId)) next.push(n.parentId);
      }
      queue = Array.from(new Set(next));
    }
    const chainOf = (moduleId: number): { id: number; name: string; orderNo: number }[] => {
      const out: { id: number; name: string; orderNo: number }[] = [];
      let cur: ModuleNode | undefined = allModules.get(moduleId);
      while (cur) {
        out.unshift({ id: cur.id, name: cur.name, orderNo: cur.orderNo ?? 0 });
        cur = cur.parentId ? allModules.get(cur.parentId) : undefined;
      }
      return out;
    };

    return cases.map((c) => ({
      ...c,
      caseSetName: csMap.get(c.caseSetId)?.name || `用例集#${c.caseSetId}`,
      modulePath: chainOf(c.moduleId),
    }));
  }

  async publish(id: number) {
    const r = await this.detail(id);
    if (r.status !== 'DRAFT' && r.status !== 'PAUSED') {
      throw new BizException('E5005', `当前状态 ${r.status} 不允许发布`);
    }
    await this.repo.update(id, {
      status: 'IN_PROGRESS',
      actualStart: r.actualStart || new Date(),
    });
    return this.detail(id);
  }

  async close(id: number) {
    await this.repo.update(id, { status: 'CLOSED', actualEnd: new Date() });
    return this.detail(id);
  }

  async pause(id: number) {
    await this.repo.update(id, { status: 'PAUSED' });
    return this.detail(id);
  }

  /**
   * Assign matched cases to users
   * dto: { assignments: [{caseId, assigneeUserId}] }  OR
   *      { caseIds:[...], strategy: 'EVENLY_BY_COUNT'|'BY_MODULE', userIds:[...] }
   */
  async assign(id: number, dto: any) {
    const r = await this.detail(id);
    const ids: number[] =
      dto.caseIds || (await this.compiler.matchCaseIds(r.projectId, r.filterExpr));
    let assignments: { caseId: number; assigneeUserId: number }[] = dto.assignments || [];
    if (!assignments.length && dto.userIds?.length) {
      assignments = ids.map((cid, i) => ({
        caseId: cid,
        assigneeUserId: dto.userIds[i % dto.userIds.length],
      }));
    }
    if (!assignments.length) throw new BizException('E5006', '无可分配的用例或分配人');

    const caseMap = new Map(
      (await this.caseRepo.find({ where: { id: In(assignments.map((a) => a.caseId)) } })).map((c) => [
        c.id,
        c,
      ]),
    );

    const newInstances: RoundCaseInstance[] = [];
    for (const a of assignments) {
      const c = caseMap.get(a.caseId);
      if (!c) continue;
      // Skip duplicate (same case+assignee already exists)
      const dup = await this.rciRepo.findOne({
        where: { roundId: id, caseId: a.caseId, assigneeUserId: a.assigneeUserId },
      });
      if (dup) continue;
      newInstances.push(
        this.rciRepo.create({
          roundId: id,
          caseId: a.caseId,
          caseVersion: c.currentVersion,
          assigneeUserId: a.assigneeUserId,
        }),
      );
    }
    if (newInstances.length) await this.rciRepo.save(newInstances);

    // Group by assignee for dingtalk push
    const byUser = new Map<number, number>();
    for (const a of assignments) byUser.set(a.assigneeUserId, (byUser.get(a.assigneeUserId) || 0) + 1);
    for (const [uid, cnt] of byUser) {
      await this.ding.push({
        toUserIds: [uid],
        title: `[TCMP] ${r.name} 新分配 ${cnt} 个用例`,
        text: `项目轮次 "${r.name}" (版本 ${r.softwareVersion}) 给你分配了 ${cnt} 个用例，请前往执行。`,
        url: `/projects/${r.projectId}/rounds/${id}/execute`,
        roundId: id,
      });
    }
    return { created: newInstances.length };
  }

  /**
   * 取消分配（已关闭轮次禁止；只可撤回未执行 PENDING 的实例）
   * dto: { caseIds?: number[]; instanceIds?: number[] }
   */
  async unassign(id: number, dto: { caseIds?: number[]; instanceIds?: number[] }) {
    const r = await this.detail(id);
    if (r.status === 'CLOSED') {
      throw new BizException('E5008', '已关闭的轮次不能撤回分配');
    }
    let toDelete: RoundCaseInstance[] = [];
    if (dto.instanceIds && dto.instanceIds.length) {
      toDelete = await this.rciRepo.find({
        where: { roundId: id, id: In(dto.instanceIds) },
      });
    } else if (dto.caseIds && dto.caseIds.length) {
      toDelete = await this.rciRepo.find({
        where: { roundId: id, caseId: In(dto.caseIds) },
      });
    } else {
      throw new BizException('E5009', '需要指定 caseIds 或 instanceIds');
    }
    const removable = toDelete.filter((t) => t.result === 'PENDING');
    const blocked = toDelete.length - removable.length;
    if (removable.length) await this.rciRepo.remove(removable);
    return { removed: removable.length, blocked };
  }

  /** 已分配概览：返回 roundId 下实例的 caseId / assigneeUserId / result */
  async assignedOverview(id: number) {
    const list = await this.rciRepo.find({ where: { roundId: id } });
    return list.map((i) => ({
      id: i.id,
      caseId: i.caseId,
      assigneeUserId: i.assigneeUserId,
      result: i.result,
    }));
  }

  async listInstances(id: number, q: { assigneeUserId?: number; result?: string }) {
    const qb = this.rciRepo
      .createQueryBuilder('i')
      .where('i.roundId = :id', { id })
      .orderBy('i.id', 'ASC');
    if (q.assigneeUserId) qb.andWhere('i.assigneeUserId = :u', { u: q.assigneeUserId });
    if (q.result) qb.andWhere('i.result = :r', { r: q.result });
    const instances = await qb.getMany();
    if (!instances.length) return [];
    const cases = await this.caseRepo.find({
      where: { id: In(instances.map((i) => i.caseId)) },
    });
    const enriched = await this.enrichCases(cases);
    const map = new Map(enriched.map((c) => [c.id, c]));
    return instances.map((i) => ({ ...i, case: map.get(i.caseId) }));
  }
}
