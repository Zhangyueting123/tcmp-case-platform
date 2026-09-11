/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { HttpStatus, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CaseReview, CaseReviewComment, CaseSet, CaseSetCase, CaseSetGroup, CaseVersion, ModuleNode, ProjectCaseRef, RoundCaseInstance } from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';

@Injectable()
export class CaseSetsService implements OnModuleInit {
  constructor(
    @InjectRepository(CaseSet) private readonly repo: Repository<CaseSet>,
    @InjectRepository(CaseSetGroup) private readonly groupRepo: Repository<CaseSetGroup>,
    @InjectRepository(ModuleNode) private readonly moduleRepo: Repository<ModuleNode>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(CaseVersion) private readonly verRepo: Repository<CaseVersion>,
    @InjectRepository(ProjectCaseRef) private readonly refRepo: Repository<ProjectCaseRef>,
    @InjectRepository(RoundCaseInstance) private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(CaseReview) private readonly reviewRepo: Repository<CaseReview>,
    @InjectRepository(CaseReviewComment) private readonly reviewCommentRepo: Repository<CaseReviewComment>,
  ) {}

  /** 旧数据迁移：所有未归组的用例集统一归到「旧版用例集」分组 */
  async onModuleInit() {
    try {
      // 默认内置用例集项目
      const defaults = ['MSR', 'Vision', 'Viz', 'DLK', '2D智能相机'];
      for (const name of defaults) {
        const exists = await this.groupRepo.findOne({ where: { name } });
        if (!exists) {
          await this.groupRepo.save(this.groupRepo.create({ name, description: '系统内置用例集项目' }));
        }
      }
    } catch (e) {
      Logger.error(`默认用例集项目初始化失败：${(e as Error)?.message}`, (e as Error)?.stack, 'CaseSetsMigration');
    }
    try {
      const orphanCount = await this.repo
        .createQueryBuilder('c')
        .where('c.groupId IS NULL')
        .getCount();
      if (orphanCount === 0) return;
      let legacy = await this.groupRepo.findOne({ where: { name: '旧版用例集' } });
      if (!legacy) {
        legacy = await this.groupRepo.save(
          this.groupRepo.create({ name: '旧版用例集', description: '系统自动创建：容纳分组化之前已存在的用例集' }),
        );
      }
      await this.repo
        .createQueryBuilder()
        .update(CaseSet)
        .set({ groupId: legacy.id })
        .where('groupId IS NULL')
        .execute();
      Logger.log(`用例集迁移：${orphanCount} 个未归组用例集已归入「旧版用例集」(#${legacy.id})`, 'CaseSetsMigration');
    } catch (e) {
      Logger.error(`用例集分组迁移失败：${(e as Error)?.message}`, (e as Error)?.stack, 'CaseSetsMigration');
    }
  }

  // ====== 用例集分组（"用例集项目"）======

  listGroups() {
    return this.groupRepo.find({ order: { id: 'DESC' } });
  }

  async createGroup(userId: number, dto: { name: string; description?: string }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BizException('E3020', '分组名称不能为空');
    if (await this.groupRepo.findOne({ where: { name } })) {
      throw new BizException('E3021', `分组「${name}」已存在`);
    }
    return this.groupRepo.save(this.groupRepo.create({ name, description: dto.description, createdBy: userId }));
  }

  async updateGroup(id: number, dto: { name?: string; description?: string }) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new BizException('E3022', '分组不存在', 404 as any);
    if (dto.name && dto.name.trim() && dto.name.trim() !== g.name) {
      const dup = await this.groupRepo.findOne({ where: { name: dto.name.trim() } });
      if (dup) throw new BizException('E3021', `分组「${dto.name.trim()}」已存在`);
      g.name = dto.name.trim();
    }
    if (dto.description !== undefined) g.description = dto.description;
    return this.groupRepo.save(g);
  }

  async removeGroup(id: number) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new BizException('E3022', '分组不存在', 404 as any);
    const count = await this.repo
      .createQueryBuilder('c')
      .where('c.groupId = :id AND c.status != :s', { id, s: 'ARCHIVED' })
      .getCount();
    if (count) throw new BizException('E3023', '该分组下仍有用例集，请先移除或删除用例集');
    await this.groupRepo.delete(id);
    return { ok: true };
  }

  async list(groupId?: number, keyword?: string) {
    const qb = this.repo.createQueryBuilder('c').where('c.status != :s', { s: 'ARCHIVED' });
    if (groupId != null) qb.andWhere('c.groupId = :g', { g: groupId });
    const kw = (keyword || '').trim();
    if (kw) qb.andWhere('LOWER(c.name) LIKE :kw', { kw: `%${kw.toLowerCase()}%` });
    const sets = await qb.getMany();
    if (!sets.length) return [];

    // 用例集自身的 updatedAt 只反映改名/改描述，内容变更要看用例表
    const rows = await this.caseRepo
      .createQueryBuilder('sc')
      .select('sc.caseSetId', 'caseSetId')
      .addSelect('MAX(sc.updatedAt)', 'lastCaseUpdatedAt')
      .where('sc.caseSetId IN (:...ids)', { ids: sets.map((s) => s.id) })
      .andWhere('sc.deleted = :d', { d: false })
      .groupBy('sc.caseSetId')
      .getRawMany<{ caseSetId: number; lastCaseUpdatedAt: string }>();
    const lastCaseMap = new Map(
      rows.map((r) => [Number(r.caseSetId), this.parseDbDate(r.lastCaseUpdatedAt)]),
    );

    return sets
      .map((s) => ({ ...s, lastUpdatedAt: lastCaseMap.get(s.id) || s.updatedAt }))
      .sort(
        (a, b) =>
          (b.lastUpdatedAt?.getTime() || 0) - (a.lastUpdatedAt?.getTime() || 0) || b.id - a.id,
      );
  }

  /** sqlite 的 datetime 以 UTC 字符串存储且不带时区后缀，聚合查询取到的原始值需显式按 UTC 解析。 */
  private parseDbDate(v: string | Date | null | undefined): Date | null {
    if (!v) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const s = v.includes('T') ? v : v.replace(' ', 'T');
    const d = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async create(userId: number, dto: { code?: string; name: string; description?: string; groupId?: number }) {
    if (dto.groupId == null) throw new BizException('E3024', '请先选择用例集分组');
    const group = await this.groupRepo.findOne({ where: { id: dto.groupId } });
    if (!group) throw new BizException('E3022', '分组不存在');
    // 检查重名/重码时排除已归档（软删）记录，允许复用同名/同编码
    const dupName = await this.repo
      .createQueryBuilder('c')
      .where('c.name = :name AND c.status != :s', { name: dto.name, s: 'ARCHIVED' })
      .getOne();
    if (dupName) {
      throw new BizException('E3011', `用例集名称 ${dto.name} 已存在`);
    }
    const code = (dto.code && dto.code.trim()) ? dto.code.trim().toUpperCase() : await this.generateCode();
    const dupCode = await this.repo
      .createQueryBuilder('c')
      .where('c.code = :code AND c.status != :s', { code, s: 'ARCHIVED' })
      .getOne();
    if (dupCode) {
      throw new BizException('E3010', `用例集编码 ${code} 已存在`);
    }
    return this.repo.save(
      this.repo.create({
        code,
        name: dto.name,
        description: dto.description,
        groupId: dto.groupId,
        ownerUserId: userId,
      }),
    );
  }

  private async generateCode(): Promise<string> {
    // CS0001, CS0002 … 在当前最大数字后推进
    const all = await this.repo.find({ select: ['code'] });
    let max = 0;
    for (const r of all) {
      const m = /^CS(\d+)$/.exec(r.code || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `CS${String(max + 1).padStart(4, '0')}`;
  }

  async detail(id: number) {
    const cs = await this.repo.findOne({ where: { id } });
    if (!cs) throw new BizException('E3012', '用例集不存在', 404 as any);
    return cs;
  }

  async update(id: number, dto: Partial<CaseSet>) {
    const cs = await this.detail(id);
    if (dto.groupId !== undefined && dto.groupId !== cs.groupId) {
      return this.moveToGroup(id, dto.groupId);
    }
    const patch: Partial<CaseSet> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    return this.detail(id);
  }

  /** 将用例集移动到另一个用例集项目（仅改 groupId，用例/模块/评审数据不变） */
  async moveToGroup(id: number, targetGroupId: number) {
    const cs = await this.detail(id);
    if (cs.status === 'ARCHIVED') throw new BizException('E3027', '已归档的用例集不可移动');
    if (cs.groupId === targetGroupId) throw new BizException('E3028', '用例集已在目标项目中');
    const group = await this.groupRepo.findOne({ where: { id: targetGroupId } });
    if (!group) throw new BizException('E3022', '目标用例集项目不存在', 404 as any);
    await this.repo.update(id, { groupId: targetGroupId });
    return this.detail(id);
  }

  async moveManyToGroup(caseSetIds: number[], targetGroupId: number) {
    if (!caseSetIds?.length) throw new BizException('E3029', '请选择要移动的用例集');
    const group = await this.groupRepo.findOne({ where: { id: targetGroupId } });
    if (!group) throw new BizException('E3022', '目标用例集项目不存在', 404 as any);
    const moved: number[] = [];
    const skipped: { id: number; reason: string }[] = [];
    for (const cid of caseSetIds) {
      try {
        await this.moveToGroup(cid, targetGroupId);
        moved.push(cid);
      } catch (e: any) {
        const resp = typeof e?.getResponse === 'function' ? e.getResponse() : e?.response;
        const msg =
          (resp && typeof resp === 'object' && 'message' in resp && resp.message) ||
          e?.message ||
          '移动失败';
        skipped.push({ id: cid, reason: String(msg) });
      }
    }
    return { moved: moved.length, skipped };
  }

  async archive(id: number) {
    await this.repo.update(id, { status: 'ARCHIVED' as any });
    return { ok: true };
  }

  /**
   * 删除用例集：
   *  - 若该用例集下有用例已被项目引用（加入项目用例池 / 被测试轮次实例引用），拒绝删除；
   *  - 否则硬删除该用例集及其全部关联数据（用例、版本快照、模块树、评审单与评审意见、用例集行）。
   */
  /** 删除用例集为不可恢复的硬删除，仅限用例集创建者（Owner）与系统管理员。 */
  private assertCanDeleteCaseSet(cs: CaseSet, user: { sub?: number; systemRoles?: string[] }) {
    if ((user?.systemRoles || []).includes('SysAdmin')) return;
    if (user?.sub != null && cs.ownerUserId === user.sub) return;
    throw new BizException(
      'E3052',
      '只有该用例集的创建者或系统管理员可以删除用例集',
      HttpStatus.FORBIDDEN,
    );
  }

  async remove(id: number, user: { sub?: number; systemRoles?: string[] }) {
    const cs = await this.detail(id); // 校验存在
    this.assertCanDeleteCaseSet(cs, user);
    const cases = await this.caseRepo.find({ where: { caseSetId: id }, select: ['id'] });
    const caseIds = cases.map((c) => c.id);

    if (caseIds.length) {
      const inPool = await this.refRepo.count({ where: { caseId: In(caseIds) } });
      const inRound = await this.rciRepo.count({ where: { caseId: In(caseIds) } });
      if (inPool > 0 || inRound > 0) {
        const parts: string[] = [];
        if (inPool > 0) parts.push(`${inPool} 个用例已加入项目用例池`);
        if (inRound > 0) parts.push(`${inRound} 个用例已被测试轮次引用`);
        throw new BizException(
          'E3051',
          `该用例集正在被项目引用（${parts.join('，')}），无法删除。请先在相关项目中移除这些用例（或删除/撤回相关轮次）后再试。`,
        );
      }
    }

    // 未被引用 → 单事务硬删除全部关联数据
    await this.repo.manager.transaction(async (mgr) => {
      const reviews = await mgr.getRepository(CaseReview).find({ where: { caseSetId: id }, select: ['id'] });
      const reviewIds = reviews.map((r) => r.id);
      if (reviewIds.length) {
        await mgr.getRepository(CaseReviewComment).delete({ reviewId: In(reviewIds) });
        await mgr.getRepository(CaseReview).delete({ caseSetId: id });
      }
      if (caseIds.length) {
        await mgr.getRepository(CaseVersion).delete({ caseId: In(caseIds) });
        await mgr.getRepository(CaseSetCase).delete({ caseSetId: id });
      }
      await mgr.getRepository(ModuleNode).delete({ caseSetId: id });
      await mgr.getRepository(CaseSet).delete({ id });
    });

    return { ok: true, deleted: true, deletedCases: caseIds.length };
  }

  /**
   * 清空用例集：硬删除所有用例、版本快照、项目池引用、模块树节点。
   * 不动 round_case_instances（避免破坏已执行轮次的历史）；如果该用例集下的用例
   * 有正在被轮次实例引用，直接拒绝并提示用户先删轮次或撤回实例。
   */
  async purgeAll(caseSetId: number) {
    await this.detail(caseSetId); // 校验存在
    const cases = await this.caseRepo.find({ where: { caseSetId }, select: ['id'] });
    const caseIds = cases.map((c) => c.id);

    if (caseIds.length) {
      const usedInRound = await this.rciRepo.count({ where: { caseId: In(caseIds) } });
      if (usedInRound > 0) {
        throw new BizException(
          'E3050',
          `本用例集下有 ${usedInRound} 个用例已被轮次实例引用，无法清空。请先删除或撤回相关轮次实例。`,
        );
      }
    }

    // 单事务里逐表清理
    await this.repo.manager.transaction(async (mgr) => {
      if (caseIds.length) {
        await mgr.getRepository(CaseVersion).delete({ caseId: In(caseIds) });
        await mgr.getRepository(ProjectCaseRef).delete({ caseId: In(caseIds) });
        await mgr.getRepository(CaseSetCase).delete({ caseSetId });
      }
      await mgr.getRepository(ModuleNode).delete({ caseSetId });
    });

    return { ok: true, deletedCases: caseIds.length };
  }

  async getModuleTree(caseSetId: number) {
    const nodes = await this.moduleRepo.find({
      where: { caseSetId },
      order: { level: 'ASC', orderNo: 'ASC', id: 'ASC' },
    });
    const map = new Map<number, any>();
    const roots: any[] = [];
    for (const n of nodes) {
      map.set(n.id, { ...n, children: [] });
    }
    for (const n of nodes) {
      const node = map.get(n.id);
      if (n.parentId && map.get(n.parentId)) {
        map.get(n.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /**
   * Find or create a module path: [模块, 子模块, 子功能, 测试项]
   * Returns leaf module id.
   */
  async ensureModulePath(caseSetId: number, names: string[], topCode?: string): Promise<ModuleNode> {
    let parentId: number | null = null;
    let path = '';
    let leaf: ModuleNode;
    for (let i = 0; i < names.length; i++) {
      const level = i + 1;
      const name = (names[i] || '').trim();
      if (!name) throw new BizException('E3020', `第 ${level} 级模块名称不能为空`);
      path += '/' + name;
      let node = await this.moduleRepo.findOne({
        where: {
          caseSetId,
          parentId: parentId ?? (null as any),
          name,
          level,
        },
      });
      if (!node) {
        node = await this.moduleRepo.save(
          this.moduleRepo.create({
            caseSetId,
            parentId: parentId ?? null,
            level,
            name,
            path,
            code: level === 1 ? topCode || this.codeFromName(name) : null,
          }),
        );
      }
      parentId = node.id;
      leaf = node;
    }
    return leaf!;
  }

  private codeFromName(name: string) {
    // pinyin-like fallback: A-Z digits + hash
    const hash = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0);
    return 'M' + (hash % 100000).toString().padStart(4, '0');
  }

  async findModule(id: number) {
    return this.moduleRepo.findOne({ where: { id } });
  }

  async findTopModule(moduleId: number): Promise<ModuleNode | null> {
    let cur = await this.moduleRepo.findOne({ where: { id: moduleId } });
    while (cur && cur.parentId) {
      cur = await this.moduleRepo.findOne({ where: { id: cur.parentId } });
    }
    return cur;
  }

  /** Update module: level-1 metadata, or rename level 2–4 nodes (cascades path to descendants) */
  async updateModule(id: number, dto: Partial<ModuleNode>) {
    const node = await this.moduleRepo.findOne({ where: { id } });
    if (!node) throw new BizException('E3021', '模块节点不存在');

    const metaPatch: Partial<ModuleNode> = {};
    if (node.level === 1) {
      if (dto.description !== undefined) metaPatch.description = dto.description;
      if (dto.testEnvironment !== undefined) metaPatch.testEnvironment = dto.testEnvironment;
      if (dto.baselineDate !== undefined) metaPatch.baselineDate = dto.baselineDate;
      if (dto.owners !== undefined) metaPatch.owners = dto.owners;
    }

    if (dto.name === undefined) {
      if (Object.keys(metaPatch).length) {
        await this.moduleRepo.update(id, metaPatch);
      }
      return this.moduleRepo.findOne({ where: { id } });
    }

    const name = (dto.name || '').trim();
    if (!name) throw new BizException('E3020', '模块名称不能为空');
    if (name.length > 64) throw new BizException('E3025', '模块名称不能超过 64 字');
    if (node.level < 2) throw new BizException('E3026', '顶层模块名称不可在此修改，请通过用例编辑调整');

    if (name === node.name) {
      if (Object.keys(metaPatch).length) await this.moduleRepo.update(id, metaPatch);
      return this.moduleRepo.findOne({ where: { id } });
    }

    const dup = await this.moduleRepo.findOne({
      where: {
        caseSetId: node.caseSetId,
        parentId: node.parentId == null ? IsNull() : node.parentId,
        level: node.level,
        name,
      },
    });
    if (dup && dup.id !== id) throw new BizException('E3024', '同级已有同名节点');

    const oldPath = node.path;
    const slash = oldPath.lastIndexOf('/');
    const parentPath = slash > 0 ? oldPath.slice(0, slash) : '';
    const newPath = `${parentPath}/${name}`;

    await this.moduleRepo.manager.transaction(async (mgr) => {
      const repo = mgr.getRepository(ModuleNode);
      await repo.update(id, { name, path: newPath, ...metaPatch });

      const descendants = await repo.find({ where: { caseSetId: node.caseSetId } });
      for (const d of descendants) {
        if (d.id === id) continue;
        if (d.path === oldPath || d.path.startsWith(`${oldPath}/`)) {
          await repo.update(d.id, { path: newPath + d.path.slice(oldPath.length) });
        }
      }
    });

    return this.moduleRepo.findOne({ where: { id } });
  }

  private async isDescendantModule(caseSetId: number, ancestorId: number, nodeId: number): Promise<boolean> {
    let cur = await this.moduleRepo.findOne({ where: { id: nodeId, caseSetId } });
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = await this.moduleRepo.findOne({ where: { id: cur.parentId, caseSetId } });
    }
    return false;
  }

  /** 拖动模块树：同级 before/after 排序，或 inner 挂到上一级节点下（level 2～4） */
  async repositionModule(
    caseSetId: number,
    dragId: number,
    dropId: number,
    position: 'before' | 'after' | 'inner',
  ) {
    const drag = await this.moduleRepo.findOne({ where: { id: dragId, caseSetId } });
    if (!drag) throw new BizException('E3030', '模块节点不存在', 404 as any);
    if (drag.level < 2 || drag.level > 4) throw new BizException('E3031', '该层级节点不可拖动');

    const drop = await this.moduleRepo.findOne({ where: { id: dropId, caseSetId } });
    if (!drop) throw new BizException('E3030', '目标节点不存在', 404 as any);
    if (drag.id === drop.id) return drag;

    if (await this.isDescendantModule(caseSetId, drag.id, drop.id)) {
      throw new BizException('E3033', '不能将节点拖入其自身子树');
    }

    let targetParentId: number | null;

    if (position === 'inner') {
      if (drop.level + 1 !== drag.level) {
        throw new BizException('E3032', '只能拖入上一级模块节点内部');
      }
      targetParentId = drop.id;
    } else {
      if (drop.level !== drag.level) {
        throw new BizException('E3034', '只能在同级节点之间调整顺序');
      }
      targetParentId = drop.parentId ?? null;
    }

    if (targetParentId !== drag.parentId) {
      const dup = await this.moduleRepo.findOne({
        where: {
          caseSetId,
          parentId: targetParentId == null ? IsNull() : targetParentId,
          level: drag.level,
          name: drag.name,
        },
      });
      if (dup && dup.id !== drag.id) throw new BizException('E3024', '目标位置已有同名模块');
    }

    await this.moduleRepo.manager.transaction(async (mgr) => {
      const repo = mgr.getRepository(ModuleNode);
      const dragRow = (await repo.findOne({ where: { id: dragId, caseSetId } }))!;
      if (targetParentId !== dragRow.parentId) {
        await this.applyReparentInTx(repo, dragRow, targetParentId);
      }

      const siblings = await repo.find({
        where: {
          caseSetId,
          parentId: targetParentId == null ? IsNull() : targetParentId,
          level: dragRow.level,
        },
        order: { orderNo: 'ASC', id: 'ASC' },
      });
      let ids = siblings.map((s) => s.id).filter((mid) => mid !== dragId);

      if (position === 'inner') {
        ids.push(dragId);
      } else {
        let idx = ids.indexOf(drop.id);
        if (idx < 0) idx = ids.length;
        if (position === 'before') ids.splice(idx, 0, dragId);
        else ids.splice(idx + 1, 0, dragId);
      }

      for (let i = 0; i < ids.length; i++) {
        await repo.update(ids[i], { orderNo: i });
      }
    });

    return this.moduleRepo.findOne({ where: { id: drag.id } });
  }

  private async applyReparentInTx(
    repo: Repository<ModuleNode>,
    node: ModuleNode,
    newParentId: number | null,
  ) {
    const parentPath = newParentId
      ? (await repo.findOne({ where: { id: newParentId } }))?.path || ''
      : '';
    const oldPath = node.path;
    const newPath = `${parentPath}/${node.name}`;
    await repo.update(node.id, { parentId: newParentId, path: newPath });
    const descendants = await repo.find({ where: { caseSetId: node.caseSetId } });
    for (const d of descendants) {
      if (d.id === node.id) continue;
      if (d.path === oldPath || d.path.startsWith(`${oldPath}/`)) {
        await repo.update(d.id, { path: newPath + d.path.slice(oldPath.length) });
      }
    }
  }

  /**
   * 自底向上清理空模块节点：从给定节点开始，若该节点下已无「有效（未软删）」用例、且无子节点，
   * 则删除它，再检查其父节点，如此上溯直至遇到非空节点或到达顶层。
   * 用于（软）删除用例后同步左侧模块树——空的子模块/子功能/测试项节点一并移除。
   */
  async pruneEmptyModules(caseSetId: number, startModuleId?: number | null) {
    let currentId: number | null = startModuleId ?? null;
    while (currentId != null) {
      const node = await this.moduleRepo.findOne({ where: { id: currentId, caseSetId } });
      if (!node) break;
      const hasCases = await this.caseRepo.count({ where: { moduleId: node.id, deleted: false } });
      const hasChildren = await this.moduleRepo.count({ where: { parentId: node.id } });
      if (hasCases === 0 && hasChildren === 0) {
        const parentId = node.parentId ?? null;
        await this.moduleRepo.delete(node.id);
        currentId = parentId;
      } else {
        break;
      }
    }
  }
}
