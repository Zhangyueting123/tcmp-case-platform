/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CaseSetCase, CaseVersion } from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { CaseSetsService } from './case-sets.service';

export interface CaseInput {
  title: string;
  modulePath: string[]; // 4 levels
  priority?: any;
  type?: any;
  executionMode?: any;
  testStage?: any;
  precondition?: string;
  steps: string;
  testData?: string;
  expectedResult: string;
  tags?: string[];
  code?: string;
}

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(CaseSetCase) private readonly repo: Repository<CaseSetCase>,
    @InjectRepository(CaseVersion) private readonly verRepo: Repository<CaseVersion>,
    private readonly caseSets: CaseSetsService,
  ) {}

  async list(caseSetId: number, query: { moduleId?: number; q?: string; priority?: string }) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.caseSetId = :csid AND c.deleted = 0', { csid: caseSetId })
      // 按编号升序：编号可通过「保存时按当前顺序重排」体现用例顺序，重载后顺序稳定
      .orderBy('c.code', 'ASC');
    if (query.moduleId) qb.andWhere('c.moduleId = :mid', { mid: query.moduleId });
    if (query.q) qb.andWhere('(c.title LIKE :q OR c.code LIKE :q)', { q: `%${query.q}%` });
    if (query.priority) qb.andWhere('c.priority = :p', { p: query.priority });
    return qb.getMany();
  }

  async create(caseSetId: number, userId: number, input: CaseInput) {
    const cs = await this.caseSets.detail(caseSetId);
    const leaf = await this.caseSets.ensureModulePath(caseSetId, input.modulePath);
    const top = await this.caseSets.findTopModule(leaf.id);
    const explicitCode = !!input.code;
    const prefix = top?.code || 'M';

    // 自动编号在并发/批量场景下可能与已存在编号冲突（唯一约束 uniq_caseset_code）。
    // 重试时用“严格递增的本地下限”保证每次都尝试更大的编号，避免 nextCode 因
    // sql.js 读写滞后或软删除槽位反复返回同一编号而导致批量保存部分失败。
    const MAX_RETRY = 50;
    let floor = 0; // 已尝试过的最大编号；下一候选必须 > floor
    for (let attempt = 0; ; attempt++) {
      let code: string;
      if (explicitCode) {
        code = input.code!;
      } else {
        const auto = await this.nextNum(caseSetId, prefix);
        const num = Math.max(auto, floor + 1);
        floor = num;
        code = `${prefix}_${num.toString().padStart(4, '0')}`;
      }
      const conflict = await this.repo.findOne({ where: { caseSetId, code } });
      if (conflict) {
        if (!conflict.deleted) {
          if (explicitCode) throw new BizException('E3030', `用例编号 ${code} 已存在`);
          if (attempt < MAX_RETRY) continue; // 自动编号撞号 → 尝试更大的编号
          throw new BizException('E3030', '生成用例编号失败（多次冲突），请重试');
        }
        // 旧的软删除行仍占用 (caseSetId, code) 唯一索引槽位，重命名以释放
        conflict.code = `__DEL_${conflict.id}_${conflict.code}`;
        await this.repo.save(conflict);
      }
      const ent = this.repo.create({
        caseSetId,
        code,
        title: input.title,
        moduleId: leaf.id,
        priority: input.priority || 'P2',
        type: input.type || 'FUNCTION',
        executionMode: input.executionMode || 'MANUAL',
        testStage: input.testStage || 'SYSTEM',
        precondition: input.precondition,
        steps: input.steps ?? '',
        testData: input.testData,
        expectedResult: input.expectedResult ?? '',
        tags: input.tags || [],
        currentVersion: 1,
        createdBy: userId,
        updatedBy: userId,
      });
      try {
        const saved = await this.repo.save(ent);
        await this.snapshot(saved.id, 1, '创建', userId);
        return saved;
      } catch (e: any) {
        // 仅“唯一约束(编号撞号)”才重试；其它约束错误(如 NOT NULL)直接抛出真实信息
        const isUnique = /unique/i.test(String(e?.message || ''));
        if (isUnique && !explicitCode && attempt < MAX_RETRY) continue; // 竞态撞号 → 重试
        if (isUnique) throw new BizException('E3030', `用例编号 ${code} 已存在`);
        throw e;
      }
    }
  }

  /**
   * 批量创建用例。单次 HTTP 调用，逐条处理（自动编号已带冲突重试）。
   * 返回每行结果摘要，便于前端精确提示哪几行失败，避免大量并发请求互相撞号。
   */
  /**
   * 批量创建用例（面向上万条）。相比逐条 create() 的关键优化：
   *   1) 模块路径按 path 字符串缓存，相同路径只解析一次（去掉重复的模块查询/创建）。
   *   2) 用例编号在内存中分配：仅一次性扫描该用例集已有编号求各前缀最大后缀，
   *      之后在内存自增，彻底消除“每条都全表扫描”的 O(n²)。
   *   3) 所有用例 + 版本快照在单个事务内分块批量写入，sql.js 只在事务提交时落盘一次，
   *      避免逐条 autoSave 序列化整库。
   * 返回每行结果摘要，便于前端精确提示失败行。
   */
  async bulkCreate(caseSetId: number, userId: number, items: CaseInput[]) {
    await this.caseSets.detail(caseSetId); // 校验用例集存在
    const n = items?.length || 0;
    const results: { index: number; ok: boolean; id?: number; code?: string; message?: string }[] =
      new Array(n);

    // Pass 1：校验 + 解析模块（按路径缓存，捕获顶层模块 code 作为编号前缀）
    const moduleCache = new Map<string, { leafId: number; topCode: string }>();
    const valid: { index: number; input: CaseInput; leafId: number; prefix: string }[] = [];
    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (!it || !it.title?.trim() || !it.expectedResult?.trim()) {
        results[i] = { index: i, ok: false, message: '用例名称与预期结果均必填' };
        continue;
      }
      const pathKey = (it.modulePath || []).join('\u0001');
      let m = moduleCache.get(pathKey);
      if (!m) {
        try {
          const leaf = await this.caseSets.ensureModulePath(caseSetId, it.modulePath);
          const top = await this.caseSets.findTopModule(leaf.id);
          m = { leafId: leaf.id, topCode: top?.code || 'M' };
          moduleCache.set(pathKey, m);
        } catch (e: any) {
          results[i] = { index: i, ok: false, message: e?.message || '模块解析失败' };
          continue;
        }
      }
      valid.push({ index: i, input: it, leafId: m.leafId, prefix: it.code ? '' : m.topCode });
    }

    // Pass 2：一次性扫描已有编号，按前缀求最大后缀
    const existing = await this.repo
      .createQueryBuilder('c')
      .select('c.code', 'code')
      .where('c.caseSetId = :csid', { csid: caseSetId })
      .getRawMany<{ code: string }>();
    const usedCodes = new Set<string>(existing.map((r) => r.code));
    const counters = new Map<string, number>();
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const prefix of new Set(valid.filter((v) => !v.input.code).map((v) => v.prefix))) {
      const re = new RegExp(`^${esc(prefix)}_(\\d+)$`);
      let max = 0;
      for (const r of existing) {
        const mm = re.exec(r.code || '');
        if (mm) {
          const num = parseInt(mm[1], 10);
          if (num > max) max = num;
        }
      }
      counters.set(prefix, max);
    }

    // Pass 3：内存分配编号（含批内去重）
    const toInsert: { index: number; input: CaseInput; leafId: number; code: string }[] = [];
    for (const v of valid) {
      let code: string;
      if (v.input.code) {
        code = v.input.code;
        if (usedCodes.has(code)) {
          results[v.index] = { index: v.index, ok: false, message: `用例编号 ${code} 已存在` };
          continue;
        }
      } else {
        let num = (counters.get(v.prefix) || 0) + 1;
        code = `${v.prefix}_${String(num).padStart(4, '0')}`;
        while (usedCodes.has(code)) {
          num++;
          code = `${v.prefix}_${String(num).padStart(4, '0')}`;
        }
        counters.set(v.prefix, num);
      }
      usedCodes.add(code);
      toInsert.push({ index: v.index, input: v.input, leafId: v.leafId, code });
    }

    // Pass 4：单事务分块批量写入用例 + 版本快照
    if (toInsert.length) {
      await this.repo.manager.transaction(async (mgr) => {
        const caseRepo = mgr.getRepository(CaseSetCase);
        const verRepo = mgr.getRepository(CaseVersion);
        const entities = toInsert.map((t) =>
          caseRepo.create({
            caseSetId,
            code: t.code,
            title: t.input.title,
            moduleId: t.leafId,
            priority: t.input.priority || 'P2',
            type: t.input.type || 'FUNCTION',
            executionMode: t.input.executionMode || 'MANUAL',
            testStage: t.input.testStage || 'SYSTEM',
            precondition: t.input.precondition,
            steps: t.input.steps ?? '',
            testData: t.input.testData,
            expectedResult: t.input.expectedResult ?? '',
            tags: t.input.tags || [],
            currentVersion: 1,
            createdBy: userId,
            updatedBy: userId,
          }),
        );
        const saved = await caseRepo.save(entities, { chunk: 500 });
        const versions = saved.map((s) =>
          verRepo.create({
            caseId: s.id,
            version: 1,
            snapshot: s,
            changeNote: '创建',
            changedBy: userId,
          }),
        );
        await verRepo.save(versions, { chunk: 500 });
        saved.forEach((s, idx) => {
          results[toInsert[idx].index] = { index: toInsert[idx].index, ok: true, id: s.id, code: s.code };
        });
      });
    }

    let ok = 0;
    for (let i = 0; i < n; i++) {
      if (!results[i]) results[i] = { index: i, ok: false, message: '保存失败' };
      if (results[i].ok) ok++;
    }
    return { ok, fail: n - ok, results };
  }


  async update(caseId: number, userId: number, input: Partial<CaseInput>) {
    const c = await this.repo.findOne({ where: { id: caseId } });
    if (!c || c.deleted) throw new BizException('E3031', '用例不存在', 404 as any);
    if (input.modulePath) {
      const leaf = await this.caseSets.ensureModulePath(c.caseSetId, input.modulePath);
      c.moduleId = leaf.id;
    }
    Object.assign(c, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.executionMode !== undefined && { executionMode: input.executionMode }),
      ...(input.testStage !== undefined && { testStage: input.testStage }),
      ...(input.precondition !== undefined && { precondition: input.precondition }),
      ...(input.steps !== undefined && { steps: input.steps ?? '' }),
      ...(input.testData !== undefined && { testData: input.testData }),
      ...(input.expectedResult !== undefined && { expectedResult: input.expectedResult ?? '' }),
      ...(input.tags !== undefined && { tags: input.tags }),
      currentVersion: c.currentVersion + 1,
      updatedBy: userId,
    });
    const saved = await this.repo.save(c);
    await this.snapshot(saved.id, saved.currentVersion, '修订', userId);
    return saved;
  }

  async remove(caseId: number, userId: number) {
    // 软删除：标记 deleted=true，不从数据库物理删除（可恢复）。
    const c = await this.repo.findOne({ where: { id: caseId } });
    if (!c) throw new BizException('E3031', '用例不存在', 404 as any);
    c.deleted = true;
    c.updatedBy = userId;
    await this.repo.save(c);
    // 删除后自底向上清理因此变空的模块节点（子模块/子功能/测试项…），使左侧模块树同步更新。
    await this.caseSets.pruneEmptyModules(c.caseSetId, c.moduleId);
    return { ok: true };
  }

  /**
   * 批量软删除：一次性把多条用例标记 deleted=true（单条 update 语句），
   * 再清理因此变空的模块节点。用于「全部删除（当前筛选/模块子树）」，避免逐条请求
   * 在 sql.js 下反复整库落盘导致又慢又不稳定。
   */
  async bulkRemove(caseSetId: number, userId: number, caseIds: number[]) {
    const ids = (caseIds || []).filter((x) => Number.isInteger(x));
    if (!ids.length) return { deleted: 0 };
    const cases = await this.repo.find({ where: { id: In(ids), caseSetId, deleted: false } });
    if (!cases.length) return { deleted: 0 };
    const validIds = cases.map((c) => c.id);
    const moduleIds = Array.from(new Set(cases.map((c) => c.moduleId)));
    await this.repo
      .createQueryBuilder()
      .update(CaseSetCase)
      .set({ deleted: true, updatedBy: userId })
      .where('id IN (:...ids)', { ids: validIds })
      .execute();
    // 逐个受影响的叶子模块自底向上清理空节点
    for (const mid of moduleIds) {
      await this.caseSets.pruneEmptyModules(caseSetId, mid);
    }
    return { deleted: validIds.length };
  }

  /**
   * 按提供的顺序重新生成编号：将 orderedIds 列表中的用例按前缀分组，组内从 0001 递增。
   * 前缀 = 用例现有编号去掉 _\d+ 后的部分（编号格式 前缀_四位数字）。
   * ⚠️ 安全约束：编号在整个用例集内按前缀唯一。只有当 orderedIds 覆盖了该前缀在本用例集下的
   * 【全部】用例时才重排该前缀（即管理顶层主节点）；若只是子节点的一部分，从 0001 重排会与
   * 同前缀的其它用例撞号（UNIQUE 约束），故这种情况下跳过该前缀、不重排。
   * 两阶段写入（先置临时码再置目标码）避免瞬时唯一冲突；只写入真正变化的行。
   */
  async renumberByOrder(caseSetId: number, userId: number, orderedIds: number[]) {
    const ids = (orderedIds || []).filter((x) => Number.isInteger(x));
    if (!ids.length) return { renumbered: 0 };
    const cases = await this.repo.find({ where: { id: In(ids), caseSetId, deleted: false } });
    const byId = new Map(cases.map((c) => [c.id, c]));
    const ordered = ids.filter((id) => byId.has(id));
    if (!ordered.length) return { renumbered: 0 };
    const stripPrefix = (code: string): string | null => {
      const m = /^(.*)_(\d+)$/.exec(code || '');
      return m ? m[1] : null;
    };
    // 统计本用例集下每个前缀的用例总数，用于判断 orderedIds 是否覆盖了整个前缀
    const allCases = await this.repo.find({
      where: { caseSetId, deleted: false },
      select: ['id', 'code'],
    });
    const totalByPrefix = new Map<string, number>();
    for (const c of allCases) {
      const p = stripPrefix(c.code);
      if (p) totalByPrefix.set(p, (totalByPrefix.get(p) || 0) + 1);
    }
    // 按前缀分组（跳过无法识别前缀的用例）
    const groups = new Map<string, number[]>();
    for (const id of ordered) {
      const p = stripPrefix(byId.get(id)!.code);
      if (!p) continue;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(id);
    }
    const target = new Map<number, string>();
    for (const [p, gids] of groups) {
      const total = totalByPrefix.get(p) || 0;
      // 只覆盖到该前缀的一部分（子节点管理）→ 跳过，避免与其它同前缀用例撞号
      if (gids.length < total) continue;
      let num = 1;
      for (const id of gids) target.set(id, `${p}_${String(num++).padStart(4, '0')}`);
    }
    const changing = ordered.filter((id) => target.has(id) && (byId.get(id)!.code || '') !== target.get(id));
    if (!changing.length) return { renumbered: 0 };
    await this.repo.manager.transaction(async (mgr) => {
      const r = mgr.getRepository(CaseSetCase);
      // 0) 释放被「软删除用例」占用的目标编号：唯一约束 (caseSetId, code) 对已软删的行同样生效，
      //    这些行对用户不可见，把撞到目标编号的软删用例改名到安全码，避免重排时唯一冲突。
      const targetCodes = new Set(target.values());
      const deletedHolders = await r.find({ where: { caseSetId, deleted: true } });
      for (const d of deletedHolders) {
        if (targetCodes.has(d.code || '')) {
          await r.update(d.id, { code: `__DEL_${d.id}_${d.code}` });
        }
      }
      // 1) 阶段1：需变更的行先置唯一临时码，释放目标码
      for (const id of changing) {
        await r.update(id, { code: `__RN_${id}` });
      }
      // 2) 阶段2：写入目标码
      for (const id of changing) {
        await r.update(id, { code: target.get(id)!, updatedBy: userId });
      }
    });
    return { renumbered: changing.length };
  }

  async detail(caseId: number) {
    const c = await this.repo.findOne({ where: { id: caseId } });
    if (!c) throw new BizException('E3031', '用例不存在', 404 as any);
    return c;
  }

  async versions(caseId: number) {
    return this.verRepo.find({ where: { caseId }, order: { version: 'DESC' } });
  }

  async findVersion(caseId: number, version: number) {
    return this.verRepo.findOne({ where: { caseId, version } });
  }

  private async snapshot(caseId: number, version: number, note: string, userId: number) {
    const c = await this.repo.findOne({ where: { id: caseId } });
    await this.verRepo.save(
      this.verRepo.create({ caseId, version, snapshot: c, changeNote: note, changedBy: userId }),
    );
  }

  private async nextNum(caseSetId: number, prefix: string) {
    // 基于该前缀已存在编号的最大数字后缀 +1，避免 count 在删除/并发后撞号
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.code', 'code')
      .where('c.caseSetId = :csid', { csid: caseSetId })
      .getRawMany<{ code: string }>();
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)$`);
    let max = 0;
    for (const r of rows) {
      const m = re.exec(r.code || '');
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return max + 1;
  }
}
