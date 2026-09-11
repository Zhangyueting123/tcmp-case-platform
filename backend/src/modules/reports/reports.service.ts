/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  CaseSetCase,
  DefectLink,
  ModuleNode,
  Project,
  ProjectCaseRef,
  Round,
  RoundCaseInstance,
  User,
} from '../../entities';

const COLOR_GREEN = 'FF92D050';
const COLOR_YELLOW = 'FFFFFF00';
const COLOR_RED = 'FFFF0000';
const COLOR_HEADER = 'FFD9D9D9';

const SEVERITY_MAP = ['轻微', '一般', '严重', '致命'];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Round) private readonly rRepo: Repository<Round>,
    @InjectRepository(RoundCaseInstance) private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(ModuleNode) private readonly modRepo: Repository<ModuleNode>,
    @InjectRepository(ProjectCaseRef) private readonly refRepo: Repository<ProjectCaseRef>,
    @InjectRepository(DefectLink) private readonly defRepo: Repository<DefectLink>,
    @InjectRepository(Project) private readonly pRepo: Repository<Project>,
    @InjectRepository(User) private readonly uRepo: Repository<User>,
  ) {}

  async getReport(roundId: number) {
    const round = await this.rRepo.findOne({ where: { id: roundId } });
    if (!round) throw new Error('Round not found');
    const project = await this.pRepo.findOne({ where: { id: round.projectId } });

    const instances = await this.rciRepo.find({ where: { roundId } });
    const summary = this.summarize(instances);

    // 人员维度
    const byUser: Record<number, any> = {};
    for (const i of instances) {
      const k = i.assigneeUserId;
      byUser[k] = byUser[k] || { userId: k, total: 0, P: 0, F: 0, BLOCK: 0, NP: 0, NT: 0, PENDING: 0 };
      byUser[k].total++;
      byUser[k][i.result]++;
    }
    const userIds = Object.keys(byUser).map(Number);
    const users = userIds.length ? await this.uRepo.find({ where: { id: In(userIds) } }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const byUserList = Object.values(byUser).map((row: any) => ({
      ...row,
      userName: userMap.get(row.userId)?.name || `user#${row.userId}`,
      passRate: row.P + row.F + row.BLOCK > 0 ? row.P / (row.P + row.F + row.BLOCK) : 0,
    }));

    // 模块充分性
    const moduleCoverage = await this.computeModuleCoverage(round);

    // 缺陷汇总
    const defects = await this.defRepo.find({
      where: { roundCaseInstanceId: In(instances.map((i) => i.id)) },
      order: { id: 'ASC' },
    });

    return {
      round,
      project,
      summary,
      byUser: byUserList,
      moduleCoverage,
      defects,
      filterText: '（详见前端可视化）',
    };
  }

  private summarize(instances: RoundCaseInstance[]) {
    const cnt: Record<string, number> = { P: 0, F: 0, BLOCK: 0, NP: 0, NT: 0, PENDING: 0 };
    for (const i of instances) cnt[i.result] = (cnt[i.result] || 0) + 1;
    const total = instances.length;
    const denom = total - cnt.NT - cnt.NP;
    const executed = cnt.P + cnt.F + cnt.BLOCK;
    const executionRate = denom > 0 ? executed / denom : 0;
    const passRate = executed > 0 ? cnt.P / executed : 0;
    return { total, P: cnt.P, F: cnt.F, BLOCK: cnt.BLOCK, NP: cnt.NP, NT: cnt.NT, PENDING: cnt.PENDING, executionRate, passRate };
  }

  private async computeModuleCoverage(round: Round) {
    // For each top-level module of project pool, count executions
    const refs = await this.refRepo.find({ where: { projectId: round.projectId } });
    if (!refs.length) return [];
    const caseIds = refs.map((r) => r.caseId);
    const cases = await this.caseRepo.find({ where: { id: In(caseIds) } });
    // Map caseId -> top module
    const moduleIds = Array.from(new Set(cases.map((c) => c.moduleId)));
    const allModules = await this.modRepo.find({ where: { id: In(moduleIds) } });
    const modById = new Map(allModules.map((m) => [m.id, m]));
    // walk up to top-level
    const topOf = new Map<number, ModuleNode>();
    for (const m of allModules) {
      let cur = m;
      while (cur.parentId) {
        const p = await this.modRepo.findOne({ where: { id: cur.parentId } });
        if (!p) break;
        cur = p;
      }
      topOf.set(m.id, cur);
    }

    const groups: Record<number, { module: ModuleNode; total: number; thisRound: Set<number>; cumulative: Set<number> }> = {};
    for (const c of cases) {
      const top = topOf.get(c.moduleId);
      if (!top) continue;
      const g = (groups[top.id] = groups[top.id] || {
        module: top,
        total: 0,
        thisRound: new Set(),
        cumulative: new Set(),
      });
      g.total++;
    }

    // 本轮
    const thisRoundExec = await this.rciRepo
      .createQueryBuilder('i')
      .where('i.roundId = :rid AND i.result IN (:...rs)', {
        rid: round.id,
        rs: ['P', 'F', 'BLOCK'],
      })
      .getMany();
    for (const i of thisRoundExec) {
      const c = cases.find((c) => c.id === i.caseId);
      if (!c) continue;
      const top = topOf.get(c.moduleId);
      if (top && groups[top.id]) groups[top.id].thisRound.add(i.caseId);
    }

    // 截止本轮（含本轮）累计：所有 round <= 当前 round.id 且同 project
    const cumulativeExec = await this.rciRepo
      .createQueryBuilder('i')
      .innerJoin(Round, 'r', 'r.id = i.roundId')
      .where('r.projectId = :pid AND i.roundId <= :rid AND i.result IN (:...rs)', {
        pid: round.projectId,
        rid: round.id,
        rs: ['P', 'F', 'BLOCK'],
      })
      .getMany();
    for (const i of cumulativeExec) {
      const c = cases.find((c) => c.id === i.caseId);
      if (!c) continue;
      const top = topOf.get(c.moduleId);
      if (top && groups[top.id]) groups[top.id].cumulative.add(i.caseId);
    }

    return Object.values(groups).map((g) => ({
      moduleId: g.module.id,
      moduleName: g.module.name,
      total: g.total,
      thisRoundExecuted: g.thisRound.size,
      cumulativeExecuted: g.cumulative.size,
      thisRoundRate: g.total ? g.thisRound.size / g.total : 0,
      cumulativeRate: g.total ? g.cumulative.size / g.total : 0,
    }));
  }

  /** Build an Excel report aligned with PRD §FR-10 (轮次测试报告.xlsx 配色) */
  async exportExcel(roundId: number): Promise<Buffer> {
    const data = await this.getReport(roundId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TCMP';

    // ===== Sheet 1: 总体说明 =====
    const ws1 = wb.addWorksheet('总体说明');
    ws1.columns = [{ width: 24 }, { width: 50 }, { width: 32 }, { width: 24 }];

    const headerRow = (label: string) => {
      const r = ws1.addRow([label]);
      r.font = { bold: true };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
      ws1.mergeCells(`A${r.number}:D${r.number}`);
    };

    headerRow('1. 测试总体说明');
    ws1.addRow(['项目名称', data.project?.name]);
    ws1.addRow(['本轮测试策略', data.filterText]);
    ws1.addRow(['软件版本路径', data.round.softwarePath || '']);
    ws1.addRow(['测试版本', data.round.softwareVersion]);
    ws1.addRow([
      '测试时间',
      `${fmt(data.round.actualStart)} ~ ${fmt(data.round.actualEnd)}`,
    ]);
    ws1.addRow(['测试环境', data.round.testEnvironment || '']);
    const testers = data.byUser.map((u: any) => `${u.userName}（分配 ${u.total}）`).join('、');
    ws1.addRow(['测试人员 / 测试任务', testers]);

    ws1.addRow([]);
    headerRow('2. 测试结果总结');
    ws1.addRow([data.round.summary || '（待补充）']);

    ws1.addRow([]);
    headerRow('3. 测试充分性说明');
    const headRow = ws1.addRow(['功能模块', '本轮充分性', '截止本轮（含本轮）充分性', '模块总用例']);
    headRow.font = { bold: true };
    headRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    for (const mc of data.moduleCoverage) {
      const r = ws1.addRow([
        mc.moduleName,
        pct(mc.thisRoundRate),
        pct(mc.cumulativeRate),
        mc.total,
      ]);
      r.getCell(2).fill = fillByRate(mc.thisRoundRate);
      r.getCell(3).fill = fillByRate(mc.cumulativeRate);
    }

    ws1.addRow([]);
    headerRow('4. 执行汇总');
    const s = data.summary;
    const sumHead = ws1.addRow(['总数', 'Pass', 'Fail', 'Block', 'NP', 'NT', '执行率', '通过率']);
    sumHead.font = { bold: true };
    sumHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    ws1.addRow([s.total, s.P, s.F, s.BLOCK, s.NP, s.NT, pct(s.executionRate), pct(s.passRate)]);

    // ===== Sheet 2: 缺陷汇总 =====
    const ws2 = wb.addWorksheet('缺陷汇总');
    const cols = ['NO.#', '缺陷标题', '缺陷描述', '缺陷严重级', '缺陷状态', '出现概率', '提交人', '备注'];
    const hr = ws2.addRow(cols);
    hr.font = { bold: true };
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    ws2.columns = [
      { width: 6 }, { width: 32 }, { width: 60 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 30 },
    ];
    data.defects.forEach((d, i) => {
      ws2.addRow([
        i + 1,
        d.title,
        d.description || '',
        d.severity,
        d.tbStatus,
        ({ STABLE: '稳定出现', UNSTABLE: '偶现/不稳定' } as any)[d.occurrenceProb] || d.occurrenceProb,
        '-',
        '',
      ]);
    });

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}

function fillByRate(r: number): ExcelJS.Fill {
  let argb = COLOR_RED;
  if (r >= 0.9) argb = COLOR_GREEN;
  else if (r >= 0.3) argb = COLOR_YELLOW;
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}
function fmt(d: Date | string) {
  if (!d) return '';
  const x = new Date(d);
  return x.toISOString().slice(0, 19).replace('T', ' ');
}
