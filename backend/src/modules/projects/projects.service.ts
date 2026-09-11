/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CaseSet,
  CaseSetCase,
  DefectLink,
  ModuleNode,
  Project,
  ProjectCaseRef,
  Round,
  UserProjectRole,
} from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { TeambitionAdapter } from '../../integrations/teambition.adapter';

@Injectable()
export class ProjectsService implements OnModuleInit {
  constructor(
    @InjectRepository(Project) private readonly repo: Repository<Project>,
    @InjectRepository(ProjectCaseRef) private readonly refRepo: Repository<ProjectCaseRef>,
    @InjectRepository(UserProjectRole) private readonly memberRepo: Repository<UserProjectRole>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(CaseSet) private readonly caseSetRepo: Repository<CaseSet>,
    @InjectRepository(ModuleNode) private readonly moduleRepo: Repository<ModuleNode>,
    @InjectRepository(Round) private readonly roundRepo: Repository<Round>,
    @InjectRepository(DefectLink) private readonly defRepo: Repository<DefectLink>,
    @Inject(TeambitionAdapter) private readonly tb: TeambitionAdapter,
  ) {}

  /** 给旧数据补 level=1（synchronize 新增列后旧行可能为 NULL） */
  async onModuleInit() {
    try {
      await this.repo
        .createQueryBuilder()
        .update(Project)
        .set({ level: 1 })
        .where('level IS NULL')
        .execute();
    } catch {
      /* 首次建表前忽略 */
    }
    try {
      await this.migrateLegacyRoundsAndCases();
    } catch (e) {
      Logger.error(`旧数据迁移失败：${(e as Error)?.message}`, (e as Error)?.stack, 'ProjectsMigration');
    }
  }

  /**
   * 旧层级迁移：新层级里「用例池 / 测试轮次」只属于最底层的「模块功能测试项目」。
   * 对每个仍直接挂着轮次或用例的顶层项目(level=1)，自动补建：
   *   顶层项目 → 子项目(名=默认轮次名) → 模块功能测试项目(名=默认轮次名 + 模块)
   * 并把该项目下的轮次、用例池、缺陷全部下移到新的模块功能测试项目。
   * 幂等：迁移后顶层不再直接持有轮次/用例，再次启动会自动跳过。
   */
  private async migrateLegacyRoundsAndCases() {
    const tops = await this.repo.find({ where: { level: 1 } });
    for (const p of tops) {
      const rounds = await this.roundRepo.find({ where: { projectId: p.id }, order: { id: 'DESC' } });
      const refs = await this.refRepo.find({ where: { projectId: p.id } });
      if (rounds.length === 0 && refs.length === 0) continue;

      const defaultName = rounds[0]?.name?.trim() || `${p.name} 用例`;
      const sub = await this.repo.save(
        this.repo.create({
          projectKey: await this.generateProjectKey(),
          name: await this.uniqueName(defaultName),
          description: `由「${p.name}」旧数据自动迁移`,
          parentId: p.id,
          level: 2,
          tbProjectId: p.tbProjectId,
          tbBugSectionId: p.tbBugSectionId,
          tbBugSectionUrl: p.tbBugSectionUrl,
          createdBy: p.createdBy,
        }),
      );
      const mod = await this.repo.save(
        this.repo.create({
          projectKey: await this.generateProjectKey(),
          name: await this.uniqueName(`${defaultName} 模块`),
          description: `由「${p.name}」旧数据自动迁移`,
          parentId: sub.id,
          level: 3,
          tbProjectId: p.tbProjectId,
          tbBugSectionId: p.tbBugSectionId,
          tbBugSectionUrl: p.tbBugSectionUrl,
          createdBy: p.createdBy,
        }),
      );

      if (rounds.length) {
        await this.roundRepo
          .createQueryBuilder()
          .update(Round)
          .set({ projectId: mod.id })
          .where('projectId = :pid', { pid: p.id })
          .execute();
      }
      if (refs.length) {
        await this.refRepo
          .createQueryBuilder()
          .update(ProjectCaseRef)
          .set({ projectId: mod.id })
          .where('projectId = :pid', { pid: p.id })
          .execute();
      }
      await this.defRepo
        .createQueryBuilder()
        .update(DefectLink)
        .set({ projectId: mod.id })
        .where('projectId = :pid', { pid: p.id })
        .execute();

      Logger.log(
        `旧数据迁移：「${p.name}」→ 子项目「${sub.name}」/ 模块「${mod.name}」（轮次 ${rounds.length}、用例 ${refs.length}）`,
        'ProjectsMigration',
      );
    }
  }

  /** 生成全局唯一的项目名（name 有全局唯一索引），冲突时追加序号 */
  private async uniqueName(base: string): Promise<string> {
    let name = base;
    let i = 2;
    while (await this.repo.findOne({ where: { name } })) {
      name = `${base} (${i++})`;
    }
    return name;
  }

  // ====== 层级树辅助 ======

  /** 找到某项目的顶层根（level=1）——成员/权限在根上，下层继承 */
  async rootOf(id: number): Promise<Project> {
    let cur = await this.repo.findOne({ where: { id } });
    if (!cur) throw new BizException('E4005', '项目不存在', 404 as any);
    const guard = new Set<number>();
    while (cur && cur.parentId && !guard.has(cur.id)) {
      guard.add(cur.id);
      const parent = await this.repo.findOne({ where: { id: cur.parentId } });
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }

  /** 收集某项目子树下所有项目 id（含自身） */
  async descendantIds(id: number): Promise<number[]> {
    const all = await this.repo.find();
    const childrenOf = new Map<number, number[]>();
    for (const p of all) {
      if (p.parentId != null) {
        if (!childrenOf.has(p.parentId)) childrenOf.set(p.parentId, []);
        childrenOf.get(p.parentId)!.push(p.id);
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


  async list(userId: number, all = false) {
    if (all) return this.repo.find({ order: { id: 'DESC' } });
    const members = await this.memberRepo.find({ where: { userId } });
    const memberIds = members.map((m) => m.projectId);
    // 内置项目对所有登录用户可见（无需成员关系），并与用户能看到的项目合并去重
    const roots = memberIds.length
      ? await this.repo.find({ where: [{ id: In(memberIds) }, { isBuiltin: true }], order: { id: 'DESC' } })
      : await this.repo.find({ where: [{ createdBy: userId }, { isBuiltin: true }], order: { id: 'DESC' } });
    // 可见项目 + 其所有后代（成员仅在顶层，子项目继承可见性）
    const visibleIds = new Set<number>();
    for (const r of roots) {
      for (const d of await this.descendantIds(r.id)) visibleIds.add(d);
    }
    const list = visibleIds.size
      ? await this.repo.find({ where: { id: In([...visibleIds]) }, order: { id: 'DESC' } })
      : [];
    return list;
  }

  /** 返回可见项目的层级树（嵌套 children） */
  async tree(userId: number, all = false) {
    const flat = await this.list(userId, all);
    const byId = new Map<number, any>();
    for (const p of flat) byId.set(p.id, { ...p, children: [] });
    const roots: any[] = [];
    for (const node of byId.values()) {
      if (node.parentId != null && byId.has(node.parentId)) {
        byId.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (arr: any[]) => {
      arr.sort((a, b) => a.id - b.id);
      for (const n of arr) sortRec(n.children);
    };
    sortRec(roots);
    return roots;
  }

  /** 缺陷看板：聚合该项目子树下所有项目的缺陷 */
  async defectBoard(id: number) {
    const ids = await this.descendantIds(id);
    const all = ids.length ? await this.defRepo.find({ where: { projectId: In(ids) } }) : [];
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
    // 按子项目/节点分组统计（便于看板下钻）
    const projMap = new Map((await this.repo.find({ where: { id: In(ids) } })).map((p) => [p.id, p]));
    const byProject: Record<string, number> = {};
    for (const d of all) {
      const nm = projMap.get(d.projectId)?.name || `#${d.projectId}`;
      byProject[nm] = (byProject[nm] || 0) + 1;
    }
    return {
      total,
      open,
      closed,
      newThisWeek,
      bySeverity: groupBy('severity'),
      byStatus: groupBy('tbStatus'),
      byProject: Object.entries(byProject).map(([name, value]) => ({ name, value })),
      subtreeProjectIds: ids,
    };
  }

  async create(
    userId: number,
    dto: {
      projectKey?: string;
      name: string;
      description?: string;
      tbBugSectionUrl?: string;
      versionIteration?: string;
      parentId?: number;
    },
  ) {
    // 层级：有 parentId 则 level=父+1（最多 3 层），否则顶层 level=1
    let level = 1;
    let parentId: number = null;
    if (dto.parentId != null) {
      const parent = await this.repo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new BizException('E4007', '上级项目不存在');
      if ((parent.level || 1) >= 3) throw new BizException('E4008', '已到最深层级（模块功能测试项目），不能再建子级');
      parentId = parent.id;
      level = (parent.level || 1) + 1;
    }
    // projectKey 自动生成：前端不再手填。若调用方仍传入则校验并沿用，否则自动分配一个唯一 Key。
    let projectKey = (dto.projectKey || '').trim().toUpperCase();
    if (projectKey) {
      if (!/^[A-Z0-9]{3,10}$/.test(projectKey)) {
        throw new BizException('E4001', 'projectKey 需 3-10 位大写字母/数字');
      }
      if (await this.repo.findOne({ where: { projectKey } })) {
        throw new BizException('E4002', 'projectKey 已存在');
      }
    } else {
      projectKey = await this.generateProjectKey();
    }
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new BizException('E4003', '项目名已存在');
    }
    let tbProjectId: string = null;
    let tbBugSectionId: string = null;
    if (dto.tbBugSectionUrl) {
      const parsed = this.tb.parseUrl(dto.tbBugSectionUrl);
      if (!parsed) throw new BizException('E4004', 'Teambition URL 无法解析');
      tbProjectId = parsed.tbProjectId;
      tbBugSectionId = parsed.tbBugSectionId;
    }
    const project = await this.repo.save(
      this.repo.create({
        projectKey,
        name: dto.name,
        description: dto.description,
        parentId,
        level,
        tbProjectId,
        tbBugSectionId,
        tbBugSectionUrl: dto.tbBugSectionUrl,
        versionIteration: dto.versionIteration,
        createdBy: userId,
      }),
    );
    // 成员只在顶层维护；顶层项目创建者成为 PM，子项目继承顶层成员
    if (level === 1) {
      await this.memberRepo.save(
        this.memberRepo.create({ userId, projectId: project.id, roleCode: 'PM' }),
      );
    }
    return project;
  }

  /** 自动生成唯一的项目 Key：形如 P + 5 位大写字母数字（共 6 位，符合 3-10 位约束）。 */
  private async generateProjectKey(): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 50; attempt++) {
      let suffix = '';
      for (let i = 0; i < 5; i++) {
        suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const key = 'P' + suffix;
      if (!(await this.repo.findOne({ where: { projectKey: key } }))) {
        return key;
      }
    }
    // 极小概率多次冲突，退回时间戳兜底
    return 'P' + Date.now().toString(36).toUpperCase().slice(-5);
  }

  async detail(id: number) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new BizException('E4005', '项目不存在', 404 as any);
    return p;
  }

  /** 删除项目（内置不可删；有子级或轮次时需先清理） */
  async remove(id: number) {
    const p = await this.detail(id);
    if (p.isBuiltin) throw new BizException('E4009', '内置项目不可删除');
    const childCount = await this.repo.count({ where: { parentId: id } });
    if (childCount) throw new BizException('E4010', '请先删除其下的子级项目');
    const roundCount = await this.roundRepo.count({ where: { projectId: id } });
    if (roundCount) throw new BizException('E4011', '项目下存在测试轮次，删除前请先清理');
    await this.memberRepo.delete({ projectId: id });
    await this.refRepo.delete({ projectId: id });
    await this.repo.delete(id);
    return { ok: true };
  }

  async update(id: number, dto: any) {
    if (dto.tbBugSectionUrl !== undefined) {
      if (dto.tbBugSectionUrl) {
        const parsed = this.tb.parseUrl(dto.tbBugSectionUrl);
        if (!parsed) throw new BizException('E4004', 'Teambition URL 无法解析');
        dto.tbProjectId = parsed.tbProjectId;
        dto.tbBugSectionId = parsed.tbBugSectionId;
      } else {
        dto.tbProjectId = null;
        dto.tbBugSectionId = null;
      }
    }
    await this.repo.update(id, dto);
    return this.detail(id);
  }

  /** 测试 TB 连通：拉一次项目成员列表 */
  async testTb(id: number) {
    const p = await this.detail(id);
    if (!p.tbProjectId) {
      throw new BizException('E4006', '项目尚未关联 Teambition URL');
    }
    const mode = (process.env.TB_MODE || '').toUpperCase() === 'REAL' ? 'REAL' : 'MOCK';
    try {
      const members = await this.tb.listMembers(p.tbProjectId);
      return {
        ok: true,
        mode,
        tbProjectId: p.tbProjectId,
        memberCount: members.length,
        sampleMembers: members.slice(0, 5),
      };
    } catch (e: any) {
      return { ok: false, mode, tbProjectId: p.tbProjectId, error: e.message };
    }
  }

  // ====== Members ======
  // 成员只在顶层项目维护；对任意层级项目查询/新增成员都解析到其顶层根。

  async listMembers(projectId: number) {
    const root = await this.rootOf(projectId);
    return this.memberRepo.find({ where: { projectId: root.id } });
  }

  async addMember(projectId: number, userId: number, roleCode: string) {
    const root = await this.rootOf(projectId);
    const exists = await this.memberRepo.findOne({
      where: { projectId: root.id, userId, roleCode },
    });
    if (exists) return exists;
    return this.memberRepo.save(
      this.memberRepo.create({ projectId: root.id, userId, roleCode }),
    );
  }

  async removeMember(memberId: number) {
    await this.memberRepo.delete(memberId);
    return { ok: true };
  }

  // ====== Case Pool ======

  async listCases(projectId: number) {
    const refs = await this.refRepo.find({ where: { projectId } });
    if (!refs.length) return [];
    const cases = await this.caseRepo.find({ where: { id: In(refs.map((r) => r.caseId)) } });
    const map = new Map(cases.map((c) => [c.id, c]));
    return refs.map((r) => ({
      ...r,
      case: map.get(r.caseId),
    }));
  }

  /**
   * 项目用例池涉及到的「用例集 + 顶级模块（sheet）」清单。
   * 用于轮次筛选时按 sheet 分组配置条件。
   */
  async listCaseSources(projectId: number) {
    const refs = await this.refRepo.find({ where: { projectId } });
    if (!refs.length) return [];
    const cases = await this.caseRepo.find({
      where: { id: In(refs.map((r) => r.caseId)), deleted: false },
    });
    const caseSetIds = Array.from(new Set(cases.map((c) => c.caseSetId)));
    const moduleIds = Array.from(new Set(cases.map((c) => c.moduleId).filter(Boolean)));
    const caseSets = caseSetIds.length
      ? await this.caseSetRepo.find({ where: { id: In(caseSetIds) } })
      : [];
    const csMap = new Map(caseSets.map((cs) => [cs.id, cs]));

    // 加载所有模块（含父链），找出每个用例对应的顶级模块
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
    const topOf = (moduleId: number): ModuleNode | null => {
      let cur: ModuleNode | undefined = allModules.get(moduleId);
      while (cur && cur.parentId) cur = allModules.get(cur.parentId);
      return cur || null;
    };

    // 分组：caseSetId -> topModuleId -> count
    const groups = new Map<number, Map<number, number>>();
    for (const c of cases) {
      const top = topOf(c.moduleId);
      if (!top) continue;
      if (!groups.has(c.caseSetId)) groups.set(c.caseSetId, new Map());
      const m = groups.get(c.caseSetId)!;
      m.set(top.id, (m.get(top.id) || 0) + 1);
    }
    const out: any[] = [];
    for (const [csId, topMap] of groups) {
      const cs = csMap.get(csId);
      out.push({
        caseSetId: csId,
        caseSetName: cs?.name || `用例集#${csId}`,
        caseSetCode: cs?.code || '',
        topModules: Array.from(topMap.entries())
          .map(([tid, count]) => ({
            id: tid,
            name: allModules.get(tid)?.name || `模块#${tid}`,
            count,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    out.sort((a, b) => a.caseSetName.localeCompare(b.caseSetName));
    return out;
  }

  async addCases(projectId: number, userId: number, caseIds: number[]) {
    const cases = await this.caseRepo.find({ where: { id: In(caseIds) } });
    // 已在该用例池中的引用 + 其对应用例，用于「按 caseId」和「按内容」双重去重
    const existingRefs = await this.refRepo.find({ where: { projectId } });
    const existingIdSet = new Set<number>(existingRefs.map((r) => r.caseId));
    const existingCases = existingIdSet.size
      ? await this.caseRepo.find({ where: { id: In([...existingIdSet]) } })
      : [];
    // 用例所属模块的路径（含 子模块/子功能/测试项），用于并入内容签名做去重。
    const moduleIds = [
      ...new Set([...cases, ...existingCases].map((c) => c.moduleId).filter((x) => x != null)),
    ];
    const modules = moduleIds.length
      ? await this.moduleRepo.find({ where: { id: In(moduleIds) } })
      : [];
    const modulePathMap = new Map<number, string>(modules.map((m) => [m.id, m.path || '']));
    // 内容签名：模块路径(子模块/子功能/测试项) + 标题 + 等级 + 前置 + 步骤 + 数据 + 预期
    // 全部完全一致时才视为「同一条用例」
    const sig = (c: any) =>
      [
        modulePathMap.get(c.moduleId) ?? '',
        c.title,
        c.priority,
        c.precondition,
        c.steps,
        c.testData,
        c.expectedResult,
      ]
        .map((x) => (x ?? '').toString().trim())
        .join('\u0001');
    const existingSigs = new Set<string>(existingCases.map(sig));
    let added = 0;
    let skipped = 0;
    for (const c of cases) {
      // 已在池中（同一 caseId）→ 跳过
      if (existingIdSet.has(c.id)) {
        skipped++;
        continue;
      }
      // 内容与池中已有用例完全相同（含本批次内重复）→ 跳过
      const s = sig(c);
      if (existingSigs.has(s)) {
        skipped++;
        continue;
      }
      await this.refRepo.save(
        this.refRepo.create({
          projectId,
          caseId: c.id,
          pinnedVersion: c.currentVersion,
          addedBy: userId,
        }),
      );
      existingIdSet.add(c.id);
      existingSigs.add(s);
      added++;
    }
    return { added, skipped };
  }

  async removeCase(projectId: number, caseId: number) {
    await this.refRepo.delete({ projectId, caseId });
    return { ok: true };
  }

  async refreshVersions(projectId: number) {
    const refs = await this.refRepo.find({ where: { projectId } });
    let updated = 0;
    for (const r of refs) {
      const c = await this.caseRepo.findOne({ where: { id: r.caseId } });
      if (c && c.currentVersion !== r.pinnedVersion) {
        r.pinnedVersion = c.currentVersion;
        await this.refRepo.save(r);
        updated++;
      }
    }
    return { updated };
  }
}
