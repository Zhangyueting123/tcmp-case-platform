/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CaseSetCase,
  ModuleNode,
  ProjectCaseRef,
  RoundCaseInstance,
} from '../../entities';

/**
 * Boolean tree:
 *  { op: 'AND'|'OR', children: [...] }
 *  | { field, operator, value, refRoundId? }
 *
 * Supported leaf fields:
 *  Enum/multi-select (operator IN, value: string[]):
 *    priority, type, executionMode, testStage, previousResult, caseSet, module
 *  Position-based tags (operator IN, value: string[]):
 *    tag1..tag5
 *  Module path levels (operator CONTAINS/EQ/NEQ/NOT_CONTAINS, value: string):
 *    sub1 (子模块), sub2 (子功能), sub3 (测试项)
 *  Free text (operator CONTAINS/EQ/NEQ/NOT_CONTAINS, value: string):
 *    code (用例编号), title (用例名称), precondition (前置条件),
 *    steps (测试步骤), testData (测试数据), expectedResult (预期结果)
 */
@Injectable()
export class FilterCompiler {
  private moduleCache = new Map<number, ModuleNode[]>();

  constructor(
    @InjectRepository(ProjectCaseRef) private readonly refRepo: Repository<ProjectCaseRef>,
    @InjectRepository(CaseSetCase) private readonly caseRepo: Repository<CaseSetCase>,
    @InjectRepository(RoundCaseInstance)
    private readonly rciRepo: Repository<RoundCaseInstance>,
    @InjectRepository(ModuleNode) private readonly moduleRepo: Repository<ModuleNode>,
  ) {}

  async matchCaseIds(projectId: number, expr: any): Promise<number[]> {
    const refs = await this.refRepo.find({ where: { projectId } });
    const poolIds = refs.map((r) => r.caseId);
    if (!poolIds.length) return [];

    if (!expr) return poolIds;
    // 全量执行：忽略筛选条件，返回项目用例池全部用例
    if (expr.fullScan) return poolIds;

    const cases = await this.caseRepo.find({
      where: { id: In(poolIds), deleted: false },
    });
    await this.prefetchModules(cases.map((c) => c.moduleId));

    // 新结构：{ groups: [{ caseSetId, topModuleId?, expr }] }
    if (Array.isArray(expr.groups)) {
      const matched = new Set<number>();
      for (const g of expr.groups) {
        const groupIsFullScan = g.expr && g.expr.fullScan === true;
        for (const c of cases) {
          if (matched.has(c.id)) continue;
          if (!this.inScope(c, g)) continue;
          if (groupIsFullScan) {
            matched.add(c.id);
            continue;
          }
          if (await this.evaluate(g.expr, c)) matched.add(c.id);
        }
      }
      return Array.from(matched);
    }

    // 旧结构：单个布尔树，匹配全部池
    const result: number[] = [];
    for (const c of cases) {
      if (await this.evaluate(expr, c)) result.push(c.id);
    }
    return result;
  }

  /** 判断用例是否落在某分组 scope 内 */
  private inScope(
    c: CaseSetCase,
    g: { caseSetId?: number; topModuleId?: number },
  ): boolean {
    if (g.caseSetId && c.caseSetId !== Number(g.caseSetId)) return false;
    if (g.topModuleId) {
      const chain = this.moduleCache.get(c.moduleId) || [];
      const top = chain[0];
      if (!top || top.id !== Number(g.topModuleId)) return false;
    }
    return true;
  }

  /** preload module chain (top-down) for each leaf moduleId */
  private async prefetchModules(moduleIds: number[]) {
    this.moduleCache.clear();
    const uniqIds = Array.from(new Set(moduleIds.filter(Boolean)));
    if (!uniqIds.length) return;
    const all = new Map<number, ModuleNode>();
    let queue = uniqIds;
    while (queue.length) {
      const found = await this.moduleRepo.find({ where: { id: In(queue) } });
      const nextQueue: number[] = [];
      for (const n of found) {
        if (!all.has(n.id)) all.set(n.id, n);
        if (n.parentId && !all.has(n.parentId)) nextQueue.push(n.parentId);
      }
      queue = Array.from(new Set(nextQueue));
    }
    for (const leafId of uniqIds) {
      const chain: ModuleNode[] = [];
      let cur: ModuleNode | undefined = all.get(leafId);
      while (cur) {
        chain.unshift(cur);
        cur = cur.parentId ? all.get(cur.parentId) : undefined;
      }
      this.moduleCache.set(leafId, chain);
    }
  }

  private async evaluate(node: any, c: CaseSetCase): Promise<boolean> {
    if (!node) return true;
    if (node.op === 'AND') {
      for (const child of node.children || []) if (!(await this.evaluate(child, c))) return false;
      return true;
    }
    if (node.op === 'OR') {
      for (const child of node.children || []) if (await this.evaluate(child, c)) return true;
      return false;
    }
    return this.evalLeaf(node, c);
  }

  private async evalLeaf(leaf: any, c: CaseSetCase): Promise<boolean> {
    const { field, operator, value } = leaf;
    const op = operator || 'IN';

    // 自由文本字段
    const textFields: Record<string, string | null> = {
      code: c.code,
      title: c.title,
      precondition: c.precondition,
      steps: c.steps,
      testData: c.testData,
      expectedResult: c.expectedResult,
    };
    if (Object.prototype.hasOwnProperty.call(textFields, field)) {
      return this.matchText(textFields[field] || '', op, value);
    }

    // 模块路径层级 sub1/sub2/sub3 (相对于顶级模块的下级)
    if (field === 'sub1' || field === 'sub2' || field === 'sub3') {
      const chain = this.moduleCache.get(c.moduleId) || [];
      const idx = Number(field.slice(3)); // chain[0]=L1, chain[1]=L2(子模块), chain[2]=L3(子功能), chain[3]=L4(测试项)
      const name = chain[idx]?.name || '';
      return this.matchText(name, op, value);
    }

    switch (field) {
      case 'priority':
        return this.matchEnum(c.priority, value);
      case 'type':
        return this.matchEnum(c.type, value);
      case 'executionMode':
        return this.matchEnum(c.executionMode, value);
      case 'testStage':
        return this.matchEnum(c.testStage, value);
      case 'caseSet':
        return Array.isArray(value)
          ? value.map(Number).includes(c.caseSetId)
          : Number(value) === c.caseSetId;
      case 'module':
        return Array.isArray(value)
          ? value.map(Number).includes(c.moduleId)
          : Number(value) === c.moduleId;
      case 'tags': {
        const tags = c.tags || [];
        if (op === 'CONTAINS') return tags.includes(value);
        if (op === 'CONTAINS_ANY')
          return (value as string[]).some((v) => tags.includes(v));
        if (op === 'CONTAINS_ALL')
          return (value as string[]).every((v) => tags.includes(v));
        return false;
      }
      case 'tag1':
      case 'tag2':
      case 'tag3':
      case 'tag4':
      case 'tag5': {
        const idx = Number(field.slice(3)) - 1;
        const t = (c.tags || [])[idx] || '';
        return this.matchEnum(t, value);
      }
      case 'previousResult': {
        if (!leaf.refRoundId) return false;
        const rci = await this.rciRepo.findOne({
          where: { roundId: leaf.refRoundId, caseId: c.id },
        });
        if (!rci) return false;
        return this.matchEnum(rci.result, value);
      }
      default:
        return false;
    }
  }

  private matchEnum(actual: any, value: any): boolean {
    if (Array.isArray(value)) {
      if (!value.length) return true;
      return value.includes(actual);
    }
    return actual === value;
  }

  private matchText(actual: string, op: string, value: any): boolean {
    const v = String(value ?? '').trim();
    if (!v) return true;
    const a = String(actual ?? '');
    switch (op) {
      case 'EQ':
        return a === v;
      case 'NEQ':
        return a !== v;
      case 'NOT_CONTAINS':
        return !a.toLowerCase().includes(v.toLowerCase());
      case 'CONTAINS':
      default:
        return a.toLowerCase().includes(v.toLowerCase());
    }
  }

  /** Convert filter to human-readable text (for report) */
  toText(node: any, depth = 0): string {
    if (!node) return '（全部用例）';
    if (node.fullScan) return '（全量执行：全部用例）';
    if (Array.isArray(node.groups)) {
      if (!node.groups.length) return '（全部用例）';
      return node.groups
        .map((g: any, i: number) => {
          const scope: string[] = [];
          if (g.caseSetId) scope.push(`用例集#${g.caseSetId}`);
          if (g.topModuleId) scope.push(`Sheet#${g.topModuleId}`);
          const sc = scope.length ? `[${scope.join(' / ')}] ` : '';
          return `分组${i + 1} ${sc}: ${this.toText(g.expr, 0)}`;
        })
        .join('  ;  ');
    }
    if (node.op) {
      const inner = (node.children || []).map((c: any) => this.toText(c, depth + 1)).join(
        node.op === 'AND' ? ' 且 ' : ' 或 ',
      );
      return depth === 0 ? inner : `(${inner})`;
    }
    const labels: Record<string, string> = {
      code: '用例编号',
      title: '用例名称',
      sub1: '子模块',
      sub2: '子功能',
      sub3: '测试项',
      priority: '用例等级',
      type: '用例类型',
      executionMode: '执行方式',
      testStage: '测试阶段',
      precondition: '前置条件',
      steps: '测试步骤',
      testData: '测试数据',
      expectedResult: '预期结果',
      tag1: '标签1',
      tag2: '标签2',
      tag3: '标签3',
      tag4: '标签4',
      tag5: '标签5',
      tags: '标签',
      module: '模块',
      caseSet: '用例集',
      previousResult: '上一轮结果',
    };
    const op = node.operator || 'IN';
    const opTxt =
      op === 'CONTAINS' ? '包含'
      : op === 'NOT_CONTAINS' ? '不包含'
      : op === 'EQ' ? '='
      : op === 'NEQ' ? '≠'
      : '∈';
    return `${labels[node.field] || node.field} ${opTxt} ${JSON.stringify(node.value)}`;
  }
}
