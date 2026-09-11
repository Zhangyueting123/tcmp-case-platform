/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CasesService, CaseInput } from './cases.service';
import { CaseSetsService } from './case-sets.service';
import { InjectRepository } from '@nestjs/typeorm';
import { CaseSetCase } from '../../entities';
import { Repository } from 'typeorm';

// Column map matches PRD §FR-3 (用例模版.xlsx 字段约定)
const HEADER_MAP: Record<string, string> = {
  用例编号: 'code',
  子模块: 'sub1',
  子功能: 'sub2',
  测试项: 'sub3',
  用例名称: 'title',
  用例等级: 'priority',
  前置条件: 'precondition',
  测试步骤: 'steps',
  测试数据: 'testData',
  预期结果: 'expectedResult',
  执行方式: 'executionMode',
  用例类型: 'type',
  '标签1': 'tag1',
  '标签2': 'tag2',
  '标签3': 'tag3',
  '标签4': 'tag4',
  '标签5': 'tag5',
  测试阶段: 'testStage',
};

const PRIORITY_MAP: Record<string, string> = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' };
const MODE_MAP: Record<string, string> = {
  手工: 'MANUAL',
  自动化: 'AUTO',
  半自动: 'SEMI_AUTO',
};
const TYPE_MAP: Record<string, string> = {
  业务: 'BUSINESS',
  功能: 'FUNCTION',
  接口: 'API',
  兼容性: 'COMPAT',
  性能: 'PERF',
  安全: 'SECURITY',
  易用性: 'UX',
  其他: 'OTHER',
};
const STAGE_MAP: Record<string, string> = {
  冒烟: 'SMOKE',
  系统: 'SYSTEM',
  回归: 'REGRESSION',
  验收: 'ACCEPTANCE',
  上线前: 'PRE_RELEASE',
};

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger('ImportExport');
  constructor(
    private readonly cases: CasesService,
    private readonly caseSets: CaseSetsService,
    @InjectRepository(CaseSetCase) private readonly repo: Repository<CaseSetCase>,
  ) {}

  async importExcel(caseSetId: number, userId: number, buffer: Buffer) {
    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error('E3001 文件过大（>20MB）');
    }
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 预取已有编号（用于显式编号去重），一次查询
    const existingCodes = new Set(
      (
        await this.repo.find({ where: { caseSetId, deleted: false }, select: ['code'] })
      ).map((c) => c.code),
    );

    // 收集所有 sheet 的行，最后一次性批量创建（面向上万条）
    const inputs: CaseInput[] = [];
    const meta: { sheet: string; row: number }[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) continue;

      // Find header row: first row with "用例名称"
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (rows[i].some((c) => String(c).trim() === '用例名称')) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx < 0) {
        errors.push(`Sheet [${sheetName}] 找不到表头行(需含"用例名称")`);
        continue;
      }
      const headers = rows[headerRowIdx].map((c) => String(c).trim());
      const colIndex: Record<string, number> = {};
      headers.forEach((h, i) => {
        if (HEADER_MAP[h]) colIndex[HEADER_MAP[h]] = i;
      });
      if (colIndex.title === undefined) {
        errors.push(`Sheet [${sheetName}] 缺少"用例名称"列`);
        continue;
      }

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const title = String(row[colIndex.title] || '').trim();
        if (!title) continue;
        const sub1 = String(row[colIndex.sub1] ?? '').trim();
        const sub2 = String(row[colIndex.sub2] ?? '').trim();
        const sub3 = String(row[colIndex.sub3] ?? '').trim();
        const modulePath = [sheetName, sub1 || '默认子模块', sub2 || '默认子功能', sub3 || '默认测试项'];

        const codeRaw = String(row[colIndex.code] ?? '').trim();
        if (codeRaw && existingCodes.has(codeRaw)) {
          skipped++;
          continue;
        }

        const input: CaseInput = {
          title,
          modulePath,
          code: codeRaw || undefined,
          priority: PRIORITY_MAP[String(row[colIndex.priority] ?? '').trim()] || 'P2',
          type: TYPE_MAP[String(row[colIndex.type] ?? '').trim()] || 'FUNCTION',
          executionMode:
            MODE_MAP[String(row[colIndex.executionMode] ?? '').trim()] || 'MANUAL',
          testStage:
            STAGE_MAP[String(row[colIndex.testStage] ?? '').trim()] || 'SYSTEM',
          precondition: String(row[colIndex.precondition] ?? ''),
          steps: String(row[colIndex.steps] ?? ''),
          testData: String(row[colIndex.testData] ?? ''),
          expectedResult: String(row[colIndex.expectedResult] ?? ''),
          tags: [
            String(row[colIndex.tag1] ?? ''),
            String(row[colIndex.tag2] ?? ''),
            String(row[colIndex.tag3] ?? ''),
            String(row[colIndex.tag4] ?? ''),
            String(row[colIndex.tag5] ?? ''),
          ].filter(Boolean),
        };
        if (codeRaw) existingCodes.add(codeRaw); // 批内显式编号也去重
        inputs.push(input);
        meta.push({ sheet: sheetName, row: r + 1 });
      }
    }

    // 一次性批量创建（单事务、内存分配编号）
    if (inputs.length) {
      const res = await this.cases.bulkCreate(caseSetId, userId, inputs);
      imported = res.ok;
      for (const r of res.results) {
        if (!r.ok) errors.push(`Sheet [${meta[r.index].sheet}] 第 ${meta[r.index].row} 行: ${r.message}`);
      }
    }
    return { imported, skipped, errors };
  }

  async exportExcel(caseSetId: number): Promise<Buffer> {
    const cases = await this.repo.find({
      where: { caseSetId, deleted: false },
      order: { id: 'ASC' },
    });
    // Build sheet grouped by top module
    const byTop: Record<string, any[]> = {};
    for (const c of cases) {
      const top = await this.caseSets.findTopModule(c.moduleId);
      const leaf = await this.caseSets.findModule(c.moduleId);
      const path = (leaf?.path || '').split('/').filter(Boolean);
      const topName = top?.name || '默认模块';
      byTop[topName] = byTop[topName] || [];
      byTop[topName].push({
        用例编号: c.code,
        子模块: path[1] || '',
        子功能: path[2] || '',
        测试项: path[3] || '',
        用例名称: c.title,
        用例等级: c.priority,
        前置条件: c.precondition || '',
        测试步骤: c.steps,
        测试数据: c.testData || '',
        预期结果: c.expectedResult,
        执行方式: invertMap(MODE_MAP, c.executionMode),
        用例类型: invertMap(TYPE_MAP, c.type),
        '标签1': c.tags?.[0] || '',
        '标签2': c.tags?.[1] || '',
        '标签3': c.tags?.[2] || '',
        '标签4': c.tags?.[3] || '',
        '标签5': c.tags?.[4] || '',
        测试阶段: invertMap(STAGE_MAP, c.testStage),
      });
    }
    const wb = XLSX.utils.book_new();
    // Excel sheet 名不能包含 : \ / ? * [ ]，且 ≤31 字符、不可为空、不可重复。
    // 顶层模块名可能含这些字符（如「AI分类（正反/有无）」含 /），需净化 + 去重，否则导出直接报错。
    const usedSheetNames = new Set<string>();
    const safeSheetName = (name: string): string => {
      let s = (name || '默认模块').replace(/[:\\/?*[\]]/g, '_').trim().slice(0, 31);
      if (!s) s = '默认模块';
      let candidate = s;
      let i = 1;
      while (usedSheetNames.has(candidate)) {
        const suffix = `_${i++}`;
        candidate = s.slice(0, 31 - suffix.length) + suffix;
      }
      usedSheetNames.add(candidate);
      return candidate;
    };
    for (const [name, rows] of Object.entries(byTop)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name));
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /** Generate a blank import template */
  buildTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const headers = Object.keys(HEADER_MAP);
    const ws = XLSX.utils.aoa_to_sheet([
      ['模块描述：示例模块'],
      ['测试环境：Win10 + Chrome'],
      ['测试日期：2026-06-01'],
      ['测试人员：张三'],
      headers,
      [
        'XJGL_0001',
        '子模块A',
        '子功能A1',
        '测试项A1.1',
        '示例用例标题',
        'P1',
        '已登录',
        '1. 步骤一\n2. 步骤二',
        '用户名/密码',
        '1. 成功\n2. 跳转',
        '手工',
        '功能',
        'smoke',
        '',
        '',
        '',
        '',
        '冒烟',
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '示例模块');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

function invertMap(m: Record<string, string>, v: string) {
  for (const [k, val] of Object.entries(m)) if (val === v) return k;
  return v;
}
