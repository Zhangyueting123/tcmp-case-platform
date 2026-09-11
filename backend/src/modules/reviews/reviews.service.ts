/**
 * @author zhangyueting
 * @date 2026-07-28
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  CaseReview,
  CaseReviewComment,
  CaseSet,
  CaseSetCase,
  ModuleNode,
  User,
} from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { DingtalkAdapter } from '../../integrations/dingtalk.adapter';

@Injectable()
export class ReviewsService {
  /** 单次评审最多纳入的用例集数量 */
  private static readonly MAX_CASE_SETS = 20;
  /** 单次评审最多纳入的用例数量（快照 JSON 体积上限） */
  private static readonly MAX_CASES = 10000;
  /** 单次批量添加用例上限 */
  private static readonly MAX_ADD_BATCH = 2000;
  /** 单条评论最大字符数 */
  private static readonly MAX_COMMENT_LEN = 10000;

  constructor(
    @InjectRepository(CaseReview) private readonly reviewRepo: Repository<CaseReview>,
    @InjectRepository(CaseReviewComment)
    private readonly commentRepo: Repository<CaseReviewComment>,
    @InjectRepository(CaseSet) private readonly caseSetRepo: Repository<CaseSet>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(ModuleNode) private readonly moduleRepo: Repository<ModuleNode>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly ding: DingtalkAdapter,
  ) {}

  /** 求评审范围内的活跃用例（moduleId 为空=整集，否则该模块子树）。 */
  private async scopeCaseIds(caseSetId: number, moduleId?: number | null): Promise<number[]> {
    if (!moduleId) {
      const rows = await this.caseRepo.find({
        where: { caseSetId, deleted: false },
        select: ['id'],
      });
      return rows.map((r) => r.id);
    }
    const root = await this.moduleRepo.findOne({ where: { id: moduleId, caseSetId } });
    if (!root) throw new BizException('E7601', '评审范围模块不存在');
    // 子树：path 等于根路径 或 以「根路径/」为前缀
    const all = await this.moduleRepo.find({ where: { caseSetId } });
    const prefix = (root.path || '') + '/';
    const subIds = all
      .filter((m) => m.id === root.id || (m.path || '').startsWith(prefix))
      .map((m) => m.id);
    if (!subIds.length) return [];
    const rows = await this.caseRepo.find({
      where: { caseSetId, deleted: false, moduleId: In(subIds) },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  private async assertOwner(caseSetId: number, userId: number): Promise<CaseSet> {
    const cs = await this.caseSetRepo.findOne({ where: { id: caseSetId } });
    if (!cs) throw new BizException('E3012', '用例集不存在', 404 as any);
    if (cs.ownerUserId !== userId) {
      throw new BizException('E7602', '只有用例集 Owner 才能执行该操作', 403 as any);
    }
    return cs;
  }

  /** 评审覆盖的全部用例集 id（兼容旧数据：无 caseSetIds 时回退到单个 caseSetId）。 */
  private setIdsOf(r: CaseReview): number[] {
    const ids = (r.caseSetIds || []).filter((x) => Number.isInteger(x));
    return ids.length ? [...new Set(ids)] : [r.caseSetId];
  }

  /** 多个用例集内的全部活跃用例 id（按用例集顺序、集内 id 顺序）。 */
  private async activeCaseIdsForSets(setIds: number[]): Promise<number[]> {
    if (!setIds.length) return [];
    const rows = await this.caseRepo.find({
      where: { caseSetId: In(setIds), deleted: false },
      select: ['id', 'caseSetId'],
      order: { caseSetId: 'ASC', id: 'ASC' },
    });
    const order = new Map(setIds.map((sid, i) => [sid, i]));
    rows.sort(
      (a, b) =>
        (order.get(a.caseSetId) ?? 0) - (order.get(b.caseSetId) ?? 0) || a.id - b.id,
    );
    return rows.map((r) => r.id);
  }

  /** 校验用户是否为该评审的发起者或评审成员。 */
  private assertParticipant(r: CaseReview, userId: number) {
    const allowed =
      r.initiatorUserId === userId || (r.reviewerUserIds || []).includes(userId);
    if (!allowed) throw new BizException('E7608', '你不是该评审的成员', 403 as any);
  }

  /** 校验用户是否为该评审的发起者。 */
  private assertInitiator(r: CaseReview, userId: number) {
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能执行该操作', 403 as any);
    }
  }

  private assertCaseCount(count: number) {
    if (count > ReviewsService.MAX_CASES) {
      throw new BizException(
        'E7622',
        `评审用例数不能超过 ${ReviewsService.MAX_CASES} 条，请缩小范围`,
      );
    }
  }

  private async loadReview(id: number): Promise<CaseReview> {
    const r = await this.reviewRepo.findOne({ where: { id } });
    if (!r) throw new BizException('E7603', '评审单不存在', 404 as any);
    return r;
  }

  private async userNameMap(ids: number[]): Promise<Map<number, string>> {
    const uniq = [...new Set(ids.filter((x) => x != null))];
    if (!uniq.length) return new Map();
    const users = await this.userRepo.find({ where: { id: In(uniq) } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** 创建评审单（仅用例集 Owner）。 */
  async create(
    caseSetId: number,
    userId: number,
    dto: { title?: string; moduleId?: number | null; reviewerUserIds?: number[] },
  ) {
    await this.assertOwner(caseSetId, userId);
    const title = (dto.title || '').trim();
    if (!title) throw new BizException('E7604', '评审标题不能为空');
    if (title.length > 200) throw new BizException('E7626', '评审标题不能超过 200 字');
    const reviewerUserIds = [...new Set((dto.reviewerUserIds || []).filter((x) => Number.isInteger(x)))];
    if (!reviewerUserIds.length) throw new BizException('E7605', '请至少指定一名评审成员');
    const caseIds = await this.scopeCaseIds(caseSetId, dto.moduleId ?? null);
    if (!caseIds.length) throw new BizException('E7606', '评审范围内没有可评审的用例');
    this.assertCaseCount(caseIds.length);
    const saved = await this.reviewRepo.save(
      this.reviewRepo.create({
        caseSetId,
        caseSetIds: [caseSetId],
        moduleId: dto.moduleId ?? null,
        title,
        status: 'IN_REVIEW',
        initiatorUserId: userId,
        reviewerUserIds,
        caseIdsSnapshot: caseIds,
      }),
    );
    // 钉钉通知评审成员（best-effort，推送失败不影响发起）
    try {
      const cs = await this.caseSetRepo.findOne({ where: { id: caseSetId } });
      const initiator = await this.userRepo.findOne({ where: { id: userId } });
      await this.ding.push({
        toUserIds: reviewerUserIds,
        title: `[TCMP] 新的用例评审：${title}`,
        text:
          `${initiator?.name || '有人'} 邀请你参与用例评审「${title}」\n` +
          `用例集：${cs?.name || caseSetId}，共 ${caseIds.length} 条用例，请前往评审。`,
        url: `/reviews/${saved.id}`,
      });
    } catch (e) {
      // 忽略推送异常
    }
    return saved;
  }

  /**
   * 跨多个用例集发起评审（用例集列表页勾选多个用例集）。
   * 快照 = 所选用例集内全部活跃用例；发起者需为所有所选用例集的 Owner。
   */
  async createMulti(
    userId: number,
    dto: { title?: string; caseSetIds?: number[]; reviewerUserIds?: number[] },
  ) {
    const title = (dto.title || '').trim();
    if (!title) throw new BizException('E7604', '评审标题不能为空');
    if (title.length > 200) throw new BizException('E7626', '评审标题不能超过 200 字');
    const setIds = [...new Set((dto.caseSetIds || []).filter((x) => Number.isInteger(x)))];
    if (!setIds.length) throw new BizException('E7617', '请至少选择一个用例集');
    if (setIds.length > ReviewsService.MAX_CASE_SETS) {
      throw new BizException(
        'E7623',
        `一次评审最多选择 ${ReviewsService.MAX_CASE_SETS} 个用例集`,
      );
    }
    const reviewerUserIds = [
      ...new Set((dto.reviewerUserIds || []).filter((x) => Number.isInteger(x))),
    ];
    if (!reviewerUserIds.length) throw new BizException('E7605', '请至少指定一名评审成员');
    // 校验每个用例集存在且发起者为 Owner
    const sets: CaseSet[] = [];
    for (const sid of setIds) {
      sets.push(await this.assertOwner(sid, userId));
    }
    const caseIds = await this.activeCaseIdsForSets(setIds);
    if (!caseIds.length) throw new BizException('E7606', '所选用例集内没有可评审的用例');
    this.assertCaseCount(caseIds.length);
    const saved = await this.reviewRepo.save(
      this.reviewRepo.create({
        caseSetId: setIds[0],
        caseSetIds: setIds,
        moduleId: null,
        title,
        status: 'IN_REVIEW',
        initiatorUserId: userId,
        reviewerUserIds,
        caseIdsSnapshot: caseIds,
      }),
    );
    try {
      const initiator = await this.userRepo.findOne({ where: { id: userId } });
      const setNames = sets.map((s) => s.name).join('、');
      await this.ding.push({
        toUserIds: reviewerUserIds,
        title: `[TCMP] 新的用例评审：${title}`,
        text:
          `${initiator?.name || '有人'} 邀请你参与用例评审「${title}」\n` +
          `用例集：${setNames}，共 ${caseIds.length} 条用例，请前往评审。`,
        url: `/reviews/${saved.id}`,
      });
    } catch (e) {
      // 忽略推送异常
    }
    return saved;
  }

  /** 某用例集的评审记录列表（含成员数/评论数）。含该集作为附属用例集的多集评审。 */
  async listByCaseSet(caseSetId: number) {
    const all = await this.reviewRepo.find({ order: { createdAt: 'DESC' } });
    const reviews = all.filter((r) => this.setIdsOf(r).includes(caseSetId));
    return this.decorateList(reviews);
  }

  /** 我发起的 + 我参与的评审。 */
  async listMine(userId: number) {
    const all = await this.reviewRepo.find({ order: { createdAt: 'DESC' } });
    const mine = all.filter(
      (r) =>
        r.initiatorUserId === userId ||
        (r.reviewerUserIds || []).includes(userId),
    );
    return this.decorateList(mine);
  }

  private async decorateList(reviews: CaseReview[]) {
    if (!reviews.length) return [];
    const ids = reviews.map((r) => r.id);
    const comments = await this.commentRepo.find({ where: { reviewId: In(ids) } });
    const commentCount = new Map<number, number>();
    for (const c of comments) commentCount.set(c.reviewId, (commentCount.get(c.reviewId) || 0) + 1);
    const nameMap = await this.userNameMap(reviews.map((r) => r.initiatorUserId));
    const csIds = [...new Set(reviews.flatMap((r) => this.setIdsOf(r)))];
    const sets = csIds.length ? await this.caseSetRepo.find({ where: { id: In(csIds) } }) : [];
    const setMap = new Map(sets.map((s) => [s.id, s]));
    return reviews.map((r) => {
      const setIds = this.setIdsOf(r);
      const names = setIds.map((sid) => setMap.get(sid)?.name || `用例集#${sid}`);
      return {
        ...r,
        initiatorName: nameMap.get(r.initiatorUserId) || `用户#${r.initiatorUserId}`,
        caseSetName: names.join('、'),
        caseSetCount: setIds.length,
        reviewerCount: (r.reviewerUserIds || []).length,
        caseCount: (r.caseIdsSnapshot || []).length,
        commentCount: commentCount.get(r.id) || 0,
      };
    });
  }

  /** 评审详情：元数据 + 范围用例（跳过已删）+ 评论（含整体意见）。仅发起者/评审成员可访问。 */
  async detail(id: number, userId: number) {
    const r = await this.loadReview(id);
    this.assertParticipant(r, userId);
    const setIds = this.setIdsOf(r);
    const sets = await this.caseSetRepo.find({ where: { id: In(setIds) } });
    const setNameMap = new Map(sets.map((s) => [s.id, s.name]));
    const snapshotIds = r.caseIdsSnapshot || [];
    const cases = snapshotIds.length
      ? await this.caseRepo.find({ where: { id: In(snapshotIds), deleted: false } })
      : [];
    // 模块路径 map（跨所有涉及的用例集）
    const modules = await this.moduleRepo.find({ where: { caseSetId: In(setIds) } });
    const modPath = new Map<number, string>();
    for (const m of modules) modPath.set(m.id, (m.path || '').replace(/^\//, '').split('/').join(' / '));
    // 评论（caseId=0 视为「整体意见」）
    const allComments = await this.commentRepo.find({
      where: { reviewId: id },
      order: { createdAt: 'ASC' },
    });
    const overallRaw = allComments.filter((c) => !c.caseId);
    const comments = allComments.filter((c) => !!c.caseId);
    const commentCountByCase = new Map<number, number>();
    const unresolvedByCase = new Map<number, number>();
    for (const c of comments) {
      commentCountByCase.set(c.caseId, (commentCountByCase.get(c.caseId) || 0) + 1);
      if (!c.resolved) unresolvedByCase.set(c.caseId, (unresolvedByCase.get(c.caseId) || 0) + 1);
    }
    const authorNames = await this.userNameMap([
      ...allComments.map((c) => c.authorUserId),
      ...(r.reviewerUserIds || []),
      r.initiatorUserId,
    ]);
    // 按 snapshot 顺序排列，并带评论计数
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const multiSet = setIds.length > 1;
    const orderedCases = snapshotIds
      .filter((cid) => caseMap.has(cid))
      .map((cid) => {
        const c = caseMap.get(cid)!;
        return {
          id: c.id,
          code: c.code,
          title: c.title,
          priority: c.priority,
          moduleId: c.moduleId,
          modulePath: modPath.get(c.moduleId) || '',
          caseSetId: c.caseSetId,
          caseSetName: multiSet ? setNameMap.get(c.caseSetId) || `用例集#${c.caseSetId}` : '',
          precondition: c.precondition,
          steps: c.steps,
          testData: c.testData,
          expectedResult: c.expectedResult,
          currentVersion: c.currentVersion,
          commentCount: commentCountByCase.get(c.id) || 0,
          unresolvedCount: unresolvedByCase.get(c.id) || 0,
        };
      });
    const mapComment = (c: CaseReviewComment) => ({
      id: c.id,
      caseId: c.caseId,
      authorUserId: c.authorUserId,
      authorName: authorNames.get(c.authorUserId) || `用户#${c.authorUserId}`,
      content: c.content,
      resolved: c.resolved,
      createdAt: c.createdAt,
    });
    return {
      id: r.id,
      caseSetId: r.caseSetId,
      caseSetIds: setIds,
      caseSets: setIds.map((sid) => ({ id: sid, name: setNameMap.get(sid) || `用例集#${sid}` })),
      caseSetName: setIds.map((sid) => setNameMap.get(sid) || `用例集#${sid}`).join('、'),
      multiSet,
      moduleId: r.moduleId,
      title: r.title,
      status: r.status,
      initiatorUserId: r.initiatorUserId,
      initiatorName: authorNames.get(r.initiatorUserId) || `用户#${r.initiatorUserId}`,
      reviewers: (r.reviewerUserIds || []).map((uid) => ({
        id: uid,
        name: authorNames.get(uid) || `用户#${uid}`,
        completed: (r.completedReviewerIds || []).includes(uid),
      })),
      reviewerUserIds: r.reviewerUserIds || [],
      completedReviewerIds: r.completedReviewerIds || [],
      allReviewersCompleted:
        (r.reviewerUserIds || []).length > 0 &&
        (r.reviewerUserIds || []).every((uid) => (r.completedReviewerIds || []).includes(uid)),
      createdAt: r.createdAt,
      closedAt: r.closedAt,
      cases: orderedCases,
      comments: comments.map(mapComment),
      overallComments: overallRaw.map(mapComment),
    };
  }

  /** 新增评论（评审中，且为评审成员或发起者）。 */
  async addComment(
    id: number,
    userId: number,
    dto: { caseId?: number; content?: string },
  ) {
    const r = await this.loadReview(id);
    if (r.status !== 'IN_REVIEW') {
      throw new BizException('E7607', '评审已结束，无法再添加评论');
    }
    const allowed =
      r.initiatorUserId === userId || (r.reviewerUserIds || []).includes(userId);
    if (!allowed) throw new BizException('E7608', '你不是该评审的成员', 403 as any);
    // caseId=0（或缺省）表示「整体意见/建议」，不校验用例范围
    const caseId = Number(dto.caseId) || 0;
    if (caseId && !(r.caseIdsSnapshot || []).includes(caseId)) {
      throw new BizException('E7609', '评论的用例不在评审范围内');
    }
    const content = (dto.content || '').trim();
    if (!content) throw new BizException('E7610', '评论内容不能为空');
    if (content.length > ReviewsService.MAX_COMMENT_LEN) {
      throw new BizException('E7624', `评论内容不能超过 ${ReviewsService.MAX_COMMENT_LEN} 字`);
    }
    const saved = await this.commentRepo.save(
      this.commentRepo.create({ reviewId: id, caseId, authorUserId: userId, content, resolved: false }),
    );
    const nameMap = await this.userNameMap([userId]);
    return {
      id: saved.id,
      caseId: saved.caseId,
      authorUserId: saved.authorUserId,
      authorName: nameMap.get(userId) || `用户#${userId}`,
      content: saved.content,
      resolved: saved.resolved,
      createdAt: saved.createdAt,
    };
  }

  async listComments(id: number, userId: number, caseId?: number) {
    const r = await this.loadReview(id);
    this.assertParticipant(r, userId);
    const where: any = { reviewId: id };
    if (caseId) where.caseId = caseId;
    const comments = await this.commentRepo.find({ where, order: { createdAt: 'ASC' } });
    const nameMap = await this.userNameMap(comments.map((c) => c.authorUserId));
    return comments.map((c) => ({
      id: c.id,
      caseId: c.caseId,
      authorUserId: c.authorUserId,
      authorName: nameMap.get(c.authorUserId) || `用户#${c.authorUserId}`,
      content: c.content,
      resolved: c.resolved,
      createdAt: c.createdAt,
    }));
  }

  /** 标记评论已处理/未处理（仅发起者）。 */
  async resolveComment(id: number, commentId: number, userId: number, resolved: boolean) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能标记评论', 403 as any);
    }
    const c = await this.commentRepo.findOne({ where: { id: commentId, reviewId: id } });
    if (!c) throw new BizException('E7611', '评论不存在', 404 as any);
    c.resolved = !!resolved;
    await this.commentRepo.save(c);
    return { ok: true, resolved: c.resolved };
  }

  /** 评审成员标记「本人评审完成 / 取消完成」（仅评审中，且为评审成员）。 */
  async setMyCompletion(id: number, userId: number, completed: boolean) {
    const r = await this.loadReview(id);
    if (r.status !== 'IN_REVIEW') {
      throw new BizException('E7615', '评审已结束，无法变更完成状态');
    }
    if (!(r.reviewerUserIds || []).includes(userId)) {
      throw new BizException('E7616', '你不是该评审的成员', 403 as any);
    }
    const set = new Set<number>(r.completedReviewerIds || []);
    if (completed) set.add(userId);
    else set.delete(userId);
    r.completedReviewerIds = [...set];
    await this.reviewRepo.save(r);
    const allDone =
      (r.reviewerUserIds || []).length > 0 &&
      (r.reviewerUserIds || []).every((uid) => set.has(uid));
    return { ok: true, completed, allReviewersCompleted: allDone };
  }

  /** 结束评审 IN_REVIEW→REVISING（仅发起者）。 */
  async endReview(id: number, userId: number) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能结束评审', 403 as any);
    }
    if (r.status !== 'IN_REVIEW') throw new BizException('E7612', '当前状态无法结束评审');
    r.status = 'REVISING';
    await this.reviewRepo.save(r);
    return { ok: true, status: r.status };
  }

  /** 关闭评审 REVISING→CLOSED（仅发起者）。 */
  async close(id: number, userId: number) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能关闭评审', 403 as any);
    }
    if (r.status !== 'REVISING') throw new BizException('E7613', '需先结束评审再关闭');
    r.status = 'CLOSED';
    r.closedAt = new Date();
    await this.reviewRepo.save(r);
    return { ok: true, status: r.status };
  }

  /** 调整评审成员（仅发起者，评审中）。 */
  async setReviewers(id: number, userId: number, reviewerUserIds: number[]) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能调整成员', 403 as any);
    }
    if (r.status !== 'IN_REVIEW') throw new BizException('E7614', '评审已结束，无法调整成员');
    const ids = [...new Set((reviewerUserIds || []).filter((x) => Number.isInteger(x)))];
    if (!ids.length) throw new BizException('E7605', '请至少指定一名评审成员');
    r.reviewerUserIds = ids;
    // 移除已不在成员列表中的「已完成」标记，避免状态不一致
    r.completedReviewerIds = (r.completedReviewerIds || []).filter((uid) => ids.includes(uid));
    await this.reviewRepo.save(r);
    return { ok: true };
  }

  /** 向评审追加用例（仅发起者，评审中）。仅接受属于本评审用例集、且未删除的用例。 */
  async addCases(id: number, userId: number, caseIds: number[]) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能调整评审用例', 403 as any);
    }
    if (r.status !== 'IN_REVIEW') throw new BizException('E7618', '评审已结束，无法再添加用例');
    const wanted = [...new Set((caseIds || []).filter((x) => Number.isInteger(x)))];
    if (!wanted.length) throw new BizException('E7619', '请选择要加入评审的用例');
    if (wanted.length > ReviewsService.MAX_ADD_BATCH) {
      throw new BizException(
        'E7625',
        `单次最多添加 ${ReviewsService.MAX_ADD_BATCH} 条用例`,
      );
    }
    const setIds = this.setIdsOf(r);
    const rows = await this.caseRepo.find({
      where: { id: In(wanted), caseSetId: In(setIds), deleted: false },
      select: ['id'],
    });
    const validIds = rows.map((x) => x.id);
    if (!validIds.length) throw new BizException('E7620', '所选用例不属于本评审的用例集');
    const current = new Set<number>(r.caseIdsSnapshot || []);
    let added = 0;
    for (const cid of validIds) {
      if (!current.has(cid)) {
        current.add(cid);
        added++;
      }
    }
    r.caseIdsSnapshot = [...current];
    this.assertCaseCount(r.caseIdsSnapshot.length);
    await this.reviewRepo.save(r);
    return { ok: true, added, total: r.caseIdsSnapshot.length };
  }

  /** 从评审移除某用例（仅发起者，评审中）。同时删除其在本评审下的意见。 */
  async removeCase(id: number, userId: number, caseId: number) {
    const r = await this.loadReview(id);
    if (r.initiatorUserId !== userId) {
      throw new BizException('E7602', '只有发起者才能调整评审用例', 403 as any);
    }
    if (r.status !== 'IN_REVIEW') throw new BizException('E7621', '评审已结束，无法移除用例');
    const cid = Number(caseId);
    r.caseIdsSnapshot = (r.caseIdsSnapshot || []).filter((x) => x !== cid);
    await this.reviewRepo.save(r);
    await this.commentRepo.delete({ reviewId: id, caseId: cid });
    return { ok: true, total: r.caseIdsSnapshot.length };
  }

  /**
   * 列出「可加入本评审」的候选用例：属于本评审用例集、未删除、且尚未在快照中的活跃用例。
   * 供发起者在评审中补充用例时选择。
   */
  async candidateCases(id: number, userId: number, caseSetId?: number) {
    const r = await this.loadReview(id);
    this.assertInitiator(r, userId);
    if (r.status !== 'IN_REVIEW') throw new BizException('E7618', '评审已结束，无法再添加用例');
    const setIds = this.setIdsOf(r);
    const sid =
      caseSetId != null && Number.isInteger(caseSetId) && setIds.includes(caseSetId)
        ? caseSetId
        : undefined;
    const scope = sid ? [sid] : setIds;
    const inSnapshot = new Set<number>(r.caseIdsSnapshot || []);
    const cases = await this.caseRepo.find({
      where: { caseSetId: In(scope), deleted: false },
      order: { caseSetId: 'ASC', code: 'ASC' },
    });
    const modules = await this.moduleRepo.find({ where: { caseSetId: In(setIds) } });
    const modPath = new Map<number, string>();
    for (const m of modules) modPath.set(m.id, (m.path || '').replace(/^\//, '').split('/').join(' / '));
    const sets = await this.caseSetRepo.find({ where: { id: In(setIds) } });
    const setNameMap = new Map(sets.map((s) => [s.id, s.name]));
    return cases
      .filter((c) => !inSnapshot.has(c.id))
      .map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        priority: c.priority,
        caseSetId: c.caseSetId,
        caseSetName: setNameMap.get(c.caseSetId) || `用例集#${c.caseSetId}`,
        modulePath: modPath.get(c.moduleId) || '',
      }));
  }

  /** 导出评审意见 Excel：概要 + 用例与逐条意见 + 整体意见。仅发起者/评审成员可导出。 */
  async exportExcel(id: number, userId: number): Promise<{ buf: Buffer; filename: string }> {
    const data = await this.detail(id, userId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TCMP';
    const COLOR_HEADER = 'FFD9D9D9';

    const statusLabel: Record<string, string> = {
      IN_REVIEW: '评审中',
      REVISING: '修订中',
      CLOSED: '已关闭',
    };

    // ===== Sheet 1: 评审概要 =====
    const ws0 = wb.addWorksheet('评审概要');
    ws0.columns = [{ width: 18 }, { width: 60 }];
    const infoRows: [string, string][] = [
      ['评审标题', data.title],
      ['状态', statusLabel[data.status] || data.status],
      ['用例集', data.caseSetName],
      ['发起人', data.initiatorName],
      ['评审成员', (data.reviewers || []).map((r: any) => r.name).join('、')],
      ['用例数', String((data.cases || []).length)],
      ['意见条数', String((data.comments || []).length + (data.overallComments || []).length)],
      ['创建时间', fmtExportDate(data.createdAt)],
      ['关闭时间', data.closedAt ? fmtExportDate(data.closedAt) : ''],
      ['导出时间', fmtExportDate(new Date())],
    ];
    for (const [k, v] of infoRows) {
      const row = ws0.addRow([k, v]);
      row.getCell(1).font = { bold: true };
    }

    // ===== Sheet 2: 用例与意见（每条意见一行，附带完整用例信息） =====
    const ws = wb.addWorksheet('用例与意见');
    const multiSet = !!data.multiSet;
    const caseHeaders = [
      '用例编号',
      '用例名称',
      '等级',
      '模块路径',
      ...(multiSet ? ['用例集'] : []),
      '前置条件',
      '测试步骤',
      '测试数据',
      '预期结果',
      '当前版本',
      '意见作者',
      '意见时间',
      '意见内容',
      '处理状态',
    ];
    const head = ws.addRow(caseHeaders);
    head.font = { bold: true };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    ws.columns = [
      { width: 14 },
      { width: 28 },
      { width: 8 },
      { width: 32 },
      ...(multiSet ? [{ width: 20 }] : []),
      { width: 24 },
      { width: 36 },
      { width: 20 },
      { width: 28 },
      { width: 10 },
      { width: 12 },
      { width: 18 },
      { width: 48 },
      { width: 10 },
    ];

    const commentsByCase = new Map<number, any[]>();
    for (const c of data.comments || []) {
      if (!commentsByCase.has(c.caseId)) commentsByCase.set(c.caseId, []);
      commentsByCase.get(c.caseId)!.push(c);
    }

    for (const cs of data.cases || []) {
      const caseComments = commentsByCase.get(cs.id) || [];
      const casePart = [
        cs.code,
        cs.title,
        cs.priority,
        cs.modulePath,
        ...(multiSet ? [cs.caseSetName] : []),
        cs.precondition || '',
        cs.steps || '',
        cs.testData || '',
        cs.expectedResult || '',
        cs.currentVersion,
      ];
      if (!caseComments.length) {
        const row = ws.addRow([...casePart, '', '', '', '']);
        row.alignment = { vertical: 'top', wrapText: true };
      } else {
        for (const c of caseComments) {
          const row = ws.addRow([
            ...casePart,
            c.authorName,
            fmtExportDate(c.createdAt),
            c.content,
            c.resolved ? '已处理' : '未处理',
          ]);
          row.alignment = { vertical: 'top', wrapText: true };
        }
      }
    }

    // ===== Sheet 3: 整体意见 =====
    const ws2 = wb.addWorksheet('整体意见');
    ws2.columns = [{ width: 14 }, { width: 20 }, { width: 80 }];
    const oh = ws2.addRow(['作者', '时间', '意见内容']);
    oh.font = { bold: true };
    oh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    for (const c of data.overallComments || []) {
      const row = ws2.addRow([c.authorName, fmtExportDate(c.createdAt), c.content]);
      row.alignment = { vertical: 'top', wrapText: true };
    }
    if (!(data.overallComments || []).length) {
      ws2.addRow(['（暂无整体意见）', '', '']);
    }

    const safeTitle = (data.title || `review-${id}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    return { buf, filename: `review-${id}-${safeTitle}.xlsx` };
  }
}

function fmtExportDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 19).replace('T', ' ');
}
