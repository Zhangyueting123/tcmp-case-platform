/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment, Round, RoundCaseInstance } from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { CasesService } from '../case-sets/cases.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ExecutionsService {
  constructor(
    @InjectRepository(RoundCaseInstance) private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(Round) private readonly roundRepo: Repository<Round>,
    @InjectRepository(Attachment) private readonly attRepo: Repository<Attachment>,
    private readonly casesSvc: CasesService,
  ) {}

  async setResult(
    instanceId: number,
    userId: number,
    body: {
      result: 'P' | 'F' | 'BLOCK' | 'NP' | 'NT';
      actualResult?: string;
      comment?: string;
      attachmentIds?: number[];
      durationSeconds?: number;
      version?: number;
    },
  ) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E7001', '执行实例不存在', 404 as any);
    if ((body.result === 'F' || body.result === 'BLOCK') && !body.actualResult) {
      throw new BizException('E7002', '失败或阻塞必须填写实际结果');
    }
    // 乐观锁期望版本：优先用前端打开表单时读到的 version（能拦截人工思考期间被他人覆盖的场景）；
    // 未传 version 时回退到当前读取值，保持向后兼容。
    const expectedVersion = typeof body.version === 'number' ? body.version : ins.version;
    const executedAt = new Date();
    // 基于期望 version 做条件更新并原子自增 version。
    // 多人同时提交同一用例结果时，后写者的 version 已过期，affected 为 0，据此拦截，避免后写覆盖前写。
    const res = await this.rciRepo
      .createQueryBuilder()
      .update(RoundCaseInstance)
      .set({
        result: body.result,
        actualResult: body.actualResult ?? null,
        comment: body.comment ?? null,
        attachmentIds: body.attachmentIds ?? null,
        executorUserId: userId,
        executedAt,
        durationSeconds: body.durationSeconds ?? null,
        version: () => 'version + 1',
      })
      .where('id = :id AND version = :version', { id: instanceId, version: expectedVersion })
      .execute();
    if (!res.affected) {
      throw new BizException('E7003', '该用例结果已被他人更新，请刷新后重试', 409 as any);
    }
    return this.rciRepo.findOne({ where: { id: instanceId } });
  }

  async detail(instanceId: number) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E7001', '执行实例不存在', 404 as any);
    let caseSnapshot: any = null;
    const version = await this.casesSvc.findVersion(ins.caseId, ins.caseVersion);
    if (version) caseSnapshot = version.snapshot;
    else caseSnapshot = await this.casesSvc.detail(ins.caseId).catch(() => null);
    // 上一轮执行结果：优先取 previousRoundId 指向的轮次；若无则回退到同项目其它轮次中该用例最近一次非 PENDING 的执行
    let previousResult: any = null;
    const round = await this.roundRepo.findOne({ where: { id: ins.roundId } });
    let prev: RoundCaseInstance | null = null;
    if (round?.previousRoundId) {
      prev = await this.rciRepo.findOne({
        where: { roundId: round.previousRoundId, caseId: ins.caseId },
      });
      if (prev && prev.result === 'PENDING') prev = null;
    }
    if (!prev && round?.projectId) {
      const roundsOfProj = await this.roundRepo.find({ where: { projectId: round.projectId } });
      const otherRoundIds = roundsOfProj.map((r) => r.id).filter((id) => id !== ins.roundId);
      if (otherRoundIds.length) {
        const candidates = await this.rciRepo
          .createQueryBuilder('rci')
          .where('rci.caseId = :cid', { cid: ins.caseId })
          .andWhere('rci.roundId IN (:...rids)', { rids: otherRoundIds })
          .andWhere("rci.result <> 'PENDING'")
          .orderBy('rci.executedAt', 'DESC')
          .addOrderBy('rci.id', 'DESC')
          .limit(1)
          .getOne();
        if (candidates) prev = candidates;
      }
    }
    if (prev) {
      const prevRound = await this.roundRepo.findOne({ where: { id: prev.roundId } });
      previousResult = {
        roundId: prev.roundId,
        roundName: prevRound?.name || `轮次#${prev.roundId}`,
        result: prev.result,
        actualResult: prev.actualResult,
        comment: prev.comment,
        executedAt: prev.executedAt,
      };
    }
    return { ...ins, case: caseSnapshot, previousResult };
  }

  /** Edit case during execution (FR-8): bump version on source case set */
  async reviseCase(instanceId: number, userId: number, input: any) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E7001', '执行实例不存在', 404 as any);
    const updated = await this.casesSvc.update(ins.caseId, userId, input);
    // 实例同步到最新版本，避免记录的是老版本快照
    if (updated?.currentVersion && updated.currentVersion !== ins.caseVersion) {
      ins.caseVersion = updated.currentVersion;
      await this.rciRepo.save(ins);
    }
    return updated;
  }

  /** 从该轮次删除当前执行实例（并加入轮次排除名单，下次预览不会重复插入） */
  async removeInstance(instanceId: number) {
    const ins = await this.rciRepo.findOne({ where: { id: instanceId } });
    if (!ins) throw new BizException('E7001', '执行实例不存在', 404 as any);
    const round = await this.roundRepo.findOne({ where: { id: ins.roundId } });
    if (round) {
      const cur = new Set<number>((round.excludedCaseIds || []).map((x: any) => Number(x)));
      cur.add(ins.caseId);
      await this.roundRepo.update(round.id, { excludedCaseIds: Array.from(cur) });
    }
    await this.rciRepo.delete(ins.id);
    return { ok: true, removedInstanceId: ins.id, caseId: ins.caseId };
  }

  // ===== Attachments =====
  async saveAttachment(userId: number, file: Express.Multer.File) {
    const dir = path.join(process.cwd(), 'uploads', this.dateDir());
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname);
    const filename = uuidv4() + ext;
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, file.buffer);
    const relPath = path.relative(path.join(process.cwd(), 'uploads'), fullPath).replace(/\\/g, '/');
    return this.attRepo.save(
      this.attRepo.create({
        originalName: file.originalname,
        path: relPath,
        mime: file.mimetype,
        size: file.size,
        uploadedBy: userId,
      }),
    );
  }

  private dateDir() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }
}
