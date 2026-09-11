/**
 * @author zhangyueting
 * @date 2026-07-01
 *
 * XMind → 用例批量导入（约定驱动）
 *
 * 层级约定（从 root 到叶子）：
 *   sheet 页名称 (root topic)
 *     └─ 子模块 (level 1)
 *         └─ 子功能 (level 2)
 *             └─ 测试项 (level 3)
 *                 └─ tc-pX-xxx  ← 用例节点（P0/P1/P2/P3 由 pX 得出）
 *                     ├─ pc: 前置条件
 *                     ├─ 策略: mt
 *                     ├─ 步骤1: 步骤描述
 *                     │   └─ 预期: 预期结果   ← 一条用例
 *                     ├─ 步骤2: 步骤描述
 *                     │   └─ 预期: 预期结果   ← 再一条用例
 *                     └─ ...
 *
 * 关键：一个「预期」节点 = 一条用例行。
 *   - title    = tc-pX- 节点标题（去掉 "tc-pX-" 前缀）
 *   - priority = pX  (p0→P0, p1→P1, ...)
 *   - precondition = 用例节点下所有以 "pc" 开头的子节点内容合并
 *   - testData     = 用例节点下所有以 "策略" 开头的子节点内容合并
 *   - steps        = 「该预期所属的步骤节点」的内容
 *   - expectedResult = 该「预期」节点的内容
 *   - modulePath[4] = [sheetRoot, 子模块, 子功能, 测试项]（不足补默认名，多余合并到第 4 层）
 *
 * 若整棵树都找不到 tc-pX- 用例节点，回退到 legacy「叶子 = 用例」的通用逻辑，
 * 以兼容其他约定的 XMind。
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { CasesService, CaseInput } from './cases.service';
import { CaseSetCase } from '../../entities';

interface XmindTopic {
  title: string;
  notes?: string;
  labels: string[];
  priorityMarker?: string;
  children: XmindTopic[];
}

interface XmindSheet {
  title: string;
  root: XmindTopic;
}

const PRIORITY_FROM_MARKER: Record<string, string> = {
  'priority-1': 'P0',
  'priority-2': 'P1',
  'priority-3': 'P2',
  'priority-4': 'P3',
  'priority-5': 'P3',
};

// 用例节点：title 形如 tc-p0-xxx / TC_P1-xxx / tc p2:xxx
const CASE_NODE_RE = /^\s*tc[-_ ]?p([0-3])\b[-_:：\s]*(.*)$/i;
// 步骤节点：步骤1: / 步骤 2 - / step 1: / 步骤：xxx
// 关键：「步骤|step」后必须跟【数字】或【分隔符】，避免把以 step 开头的普通文本
// （如预期结果 "step运行正常"）误判为步骤节点。
const STEP_RE = /^\s*(?:步骤|step)\s*(?:(\d+)\s*[:：\.、\-]?|[:：\.、\-])\s*(.*)$/i;
// 预期节点：预期: / 预期结果: / expected 1:
const EXPECTED_RE = /^\s*(?:预期(?:结果)?|expected)\s*\d*\s*[:：\.、\-]?\s*(.*)$/i;
// 前置：pc: / PC: / 前置条件: / precondition:
const PC_RE = /^\s*(?:pc|前置(?:条件)?|precondition)\s*[:：\.、\-]?\s*(.*)$/i;
// 策略：策略: / strategy:
const STRAT_RE = /^\s*(?:策略|strategy|strat)\s*[:：\.、\-]?\s*(.*)$/i;

@Injectable()
export class XmindImportService {
  private readonly logger = new Logger('XmindImport');
  constructor(
    private readonly cases: CasesService,
    @InjectRepository(CaseSetCase) private readonly repo: Repository<CaseSetCase>,
  ) {}

  async importXmind(caseSetId: number, userId: number, buffer: Buffer) {
    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error('E3001 文件过大（>20MB）');
    }

    let sheets: XmindSheet[];
    try {
      sheets = await this.parseXmind(buffer);
    } catch (e: any) {
      return { imported: 0, skipped: 0, errors: [`解析 XMind 失败：${e?.message || e}`] };
    }
    if (!sheets.length) return { imported: 0, skipped: 0, errors: ['XMind 中未找到任何画布'] };

    const inputs: CaseInput[] = [];
    const meta: { sheet: string; path: string; title: string }[] = [];

    let caseNodesFound = 0;
    for (const sheet of sheets) {
      const rootTitle = (sheet.root.title || sheet.title || '默认模块').trim() || '默认模块';
      // 初始 ancestor 传 []，让 walkForCaseNodes 自己把 root.title 记录进去，避免重复。
      this.walkForCaseNodes(sheet.root, [], (caseNode, ancestorTitles) => {
        caseNodesFound++;
        this.emitFromCaseNode(caseNode, ancestorTitles, rootTitle, inputs, meta);
      });
    }

    // 若整棵 XMind 里没有识别到 tc-pX- 用例节点，回退到「叶子=用例」的通用逻辑
    if (caseNodesFound === 0) {
      for (const sheet of sheets) {
        const rootTitle = (sheet.root.title || sheet.title || '默认模块').trim() || '默认模块';
        const leaves: { topic: XmindTopic; ancestors: string[] }[] = [];
        this.collectLeaves(sheet.root, [], leaves);
        for (const leaf of leaves) {
          const title = (leaf.topic.title || '').trim();
          if (!title) continue;
          const ancestors = leaf.ancestors.length ? leaf.ancestors : [rootTitle];
          const modulePath = this.pad4Levels(ancestors);
          const priority =
            PRIORITY_FROM_MARKER[(leaf.topic.priorityMarker || '').toLowerCase()] || 'P2';
          inputs.push({
            title,
            modulePath,
            priority: priority as any,
            steps: leaf.topic.notes || '（导入自 XMind，未填写步骤）',
            expectedResult: '（导入自 XMind，未填写预期）',
            tags: leaf.topic.labels || [],
          });
          meta.push({ sheet: rootTitle, path: modulePath.join(' / '), title });
        }
      }
    }

    if (!inputs.length) {
      return {
        imported: 0,
        skipped: 0,
        errors: [
          '未提取到任何用例。请检查 XMind 是否符合约定：用例节点标题以 "tc-p0-" / "tc-p1-" 等开头，且下面包含以 "步骤" 开头的子节点与以 "预期" 开头的孙节点。',
        ],
      };
    }

    // 内容去重：整棵 XMind 里若存在完全相同的用例（如源文件把子树复制了多份），只入库一条。
    // 签名 = 模块路径 + 标题 + 等级 + 前置 + 步骤 + 测试数据 + 预期，全部一致视为同一份。
    const seen = new Set<string>();
    const dedupInputs: CaseInput[] = [];
    const dedupMeta: { sheet: string; path: string; title: string }[] = [];
    let duplicateSkipped = 0;
    const sigOf = (it: CaseInput) =>
      [
        (it.modulePath || []).join('\u0001'),
        it.title || '',
        it.priority || '',
        it.precondition || '',
        it.steps || '',
        it.testData || '',
        it.expectedResult || '',
      ].join('\u0002');
    for (let i = 0; i < inputs.length; i++) {
      const s = sigOf(inputs[i]);
      if (seen.has(s)) {
        duplicateSkipped++;
        continue;
      }
      seen.add(s);
      dedupInputs.push(inputs[i]);
      dedupMeta.push(meta[i]);
    }

    const res = await this.cases.bulkCreate(caseSetId, userId, dedupInputs);
    const errors: string[] = [];
    for (const r of res.results) {
      if (!r.ok) {
        const m = dedupMeta[r.index];
        errors.push(`[${m.sheet}] ${m.path} / ${m.title}: ${r.message}`);
      }
    }
    return { imported: res.ok, skipped: duplicateSkipped, errors };
  }

  // ---------------- 用例节点识别 + 用例展开 ----------------

  /**
   * DFS 遍历；到达匹配 CASE_NODE_RE 的节点时回调，回调后**不再深入该节点**
   * （用例节点内部的 pc/策略/步骤/预期 由 emitFromCaseNode 单独处理）。
   */
  private walkForCaseNodes(
    node: XmindTopic,
    ancestorTitles: string[],
    onCase: (n: XmindTopic, ancestorTitles: string[]) => void,
  ) {
    if (CASE_NODE_RE.test(node.title || '')) {
      onCase(node, ancestorTitles);
      return;
    }
    const nextAncestors = [...ancestorTitles, node.title || ''];
    for (const c of node.children) this.walkForCaseNodes(c, nextAncestors, onCase);
  }

  private emitFromCaseNode(
    caseNode: XmindTopic,
    ancestorTitles: string[],
    sheetRootTitle: string,
    outInputs: CaseInput[],
    outMeta: { sheet: string; path: string; title: string }[],
  ) {
    const m = CASE_NODE_RE.exec(caseNode.title || '');
    const priority = m ? (`P${m[1]}` as string) : 'P2';
    const rawTitle = (m?.[2] || caseNode.title || '').trim() || '（无标题用例）';

    // 用例节点内部做一次 DFS：
    //   - pc / 策略：只取该节点自身 title 的正文（不吸收子孙），累加。可嵌套。
    //   - 步骤：**一个步骤 = 一条用例**。扫该步骤的直接子节点（非 pc/策略/嵌套步骤），
    //           全部作为该用例的「预期结果」合并到同一字段，用换行拼接。
    //   - 其他：继续 DFS 但不产生附加语义。
    // 这样能同时处理平铺（步骤/预期是 tc- 的直接子节点）和嵌套（pc 里包着 策略/步骤/预期）两种结构。
    const precondParts: string[] = [];
    const stratParts: string[] = [];
    const cases: { steps: string; expected: string }[] = [];

    const emitStepCase = (stepNode: XmindTopic, stepText: string) => {
      const expectedChildren = stepNode.children.filter((sub) => {
        const t = (sub.title || '').trim();
        if (!t) return false;
        // 嵌套的 pc/策略/步骤 不当预期，交给 walk 递归
        return !STEP_RE.test(t) && !PC_RE.test(t) && !STRAT_RE.test(t);
      });
      const expectedTexts = expectedChildren.map((expNode) => {
        const t = (expNode.title || '').trim();
        // 有 "预期" 前缀就剥掉，没有就整段作为预期
        const em = EXPECTED_RE.exec(t);
        return (em ? em[1] : t).trim() || t;
      });
      const merged = expectedTexts.join('\n').trim();
      cases.push({ steps: stepText, expected: merged || '（未填写）' });
    };

    const walk = (node: XmindTopic) => {
      for (const child of node.children) {
        const t = (child.title || '').trim();
        if (!t) {
          walk(child);
          continue;
        }
        const pcMatch = PC_RE.exec(t);
        const stratMatch = STRAT_RE.exec(t);
        const stepMatch = STEP_RE.exec(t);
        if (pcMatch) {
          const body = (pcMatch[1] || '').trim();
          if (body) precondParts.push(body);
          walk(child);
        } else if (stratMatch) {
          const body = (stratMatch[1] || '').trim();
          if (body) stratParts.push(body);
          walk(child);
        } else if (stepMatch) {
          const stepText = (stepMatch[2] || '').trim() || t;
          emitStepCase(child, stepText);
          walk(child); // 继续 DFS 找嵌套 pc/策略/step
        } else {
          walk(child);
        }
      }
    };
    walk(caseNode);

    const precondition = precondParts.filter(Boolean).join('\n').trim() || undefined;
    const testData = stratParts.filter(Boolean).join('\n').trim() || undefined;
    const tags = (caseNode.labels || []).filter(Boolean).slice(0, 5);
    const rootTitle = ancestorTitles[0] || sheetRootTitle || '默认模块';
    const modulePath = this.pad4Levels(ancestorTitles.length ? ancestorTitles : [sheetRootTitle]);

    if (!cases.length) {
      // 用例节点下没有可用 步骤+预期 对：兜底为 1 条
      outInputs.push({
        title: rawTitle,
        modulePath,
        priority: priority as any,
        precondition,
        steps: '（未填写）',
        expectedResult: '（未填写）',
        testData,
        tags,
      });
      outMeta.push({ sheet: rootTitle, path: modulePath.join(' / '), title: rawTitle });
      return;
    }

    for (const c of cases) {
      outInputs.push({
        title: rawTitle,
        modulePath,
        priority: priority as any,
        precondition,
        steps: c.steps || '（未填写）',
        expectedResult: c.expected || '（未填写）',
        testData,
        tags,
      });
      outMeta.push({ sheet: rootTitle, path: modulePath.join(' / '), title: rawTitle });
    }
  }

  /** 去掉 title 里 STEP/EXPECTED/PC/STRAT 之类的前缀，返回正文；正文空则用 title 原文 */
  private stripPrefix(title: string, re: RegExp): string {
    const t = (title || '').trim();
    const m = re.exec(t);
    if (!m) return t;
    const body = m[m.length - 1] ?? '';
    return body.trim() || t;
  }

  /**
   * 将 topic 及其子孙合并成一段文本（用于 pc/策略/无预期步骤等边缘情况）。
   * seed 是「已由 regex 抽出的正文」，若非空作为首行。
   */
  private collapseSubtreeText(t: XmindTopic, seed: string): string {
    const lines: string[] = [];
    if (seed && seed.trim()) lines.push(seed.trim());
    const walk = (n: XmindTopic) => {
      for (const c of n.children) {
        if (c.title && c.title.trim()) lines.push(c.title.trim());
        walk(c);
      }
    };
    walk(t);
    if (t.notes && t.notes.trim()) lines.push(t.notes.trim());
    return lines.join('\n').trim();
  }

  // ---------------- 遗留通用逻辑（回退用） ----------------

  private collectLeaves(
    node: XmindTopic,
    ancestors: string[],
    out: { topic: XmindTopic; ancestors: string[] }[],
  ) {
    if (!node.children.length) {
      out.push({ topic: node, ancestors });
      return;
    }
    const nextAncestors = [...ancestors, node.title || ''];
    for (const child of node.children) this.collectLeaves(child, nextAncestors, out);
  }

  private pad4Levels(ancestors: string[]): string[] {
    const defaults = ['默认模块', '默认子模块', '默认子功能', '默认测试项'];
    const cleaned = ancestors.map((a) => (a || '').trim()).filter(Boolean);
    // 测试项由多个子节点合并时用 "-" 连接（不用 "/"，避免与层级分隔混淆）
    if (cleaned.length >= 4) return [cleaned[0], cleaned[1], cleaned[2], cleaned.slice(3).join('-')];
    // 特例：测试项缺失（用例节点直接挂在子功能下）→ 用子功能名回填测试项
    if (cleaned.length === 3) return [cleaned[0], cleaned[1], cleaned[2], cleaned[2]];
    // 特例：子功能也缺失（用例节点直接挂在子模块下）→ 用子模块名回填子功能与测试项
    if (cleaned.length === 2) return [cleaned[0], cleaned[1], cleaned[1], cleaned[1]];
    const out = [...cleaned];
    for (let i = cleaned.length; i < 4; i++) out.push(defaults[i]);
    return out;
  }

  // ---------------- 解压 & 结构解析（json / xml 两种 xmind） ----------------

  private async parseXmind(buffer: Buffer): Promise<XmindSheet[]> {
    const zip = await JSZip.loadAsync(buffer);
    const jsonEntry = zip.file('content.json');
    if (jsonEntry) return this.parseContentJson(await jsonEntry.async('string'));
    const xmlEntry = zip.file('content.xml');
    if (xmlEntry) return this.parseContentXml(await xmlEntry.async('string'));
    throw new Error('未找到 content.json 或 content.xml（可能不是有效的 .xmind 文件）');
  }

  private parseContentJson(text: string): XmindSheet[] {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('content.json 顶层不是数组');
    const sheets: XmindSheet[] = [];
    for (const s of arr) {
      const root = this.jsonTopicToNode(s.rootTopic);
      if (!root) continue;
      sheets.push({ title: s.title || root.title || '', root });
    }
    return sheets;
  }

  private jsonTopicToNode(t: any): XmindTopic | null {
    if (!t) return null;
    const markers: any[] = t.markers || [];
    const priorityMarker = markers
      .map((mk) => String(mk?.markerId || '').toLowerCase())
      .find((id) => id.startsWith('priority-'));
    const labels: string[] = Array.isArray(t.labels) ? t.labels.filter((x: any) => !!x) : [];
    const attached: any[] = t.children?.attached || [];
    let notes = '';
    if (t.notes) {
      if (typeof t.notes === 'string') notes = t.notes;
      else if (t.notes.plain?.content) notes = t.notes.plain.content;
      else if (t.notes.ops) {
        notes = t.notes.ops.map((o: any) => (typeof o.insert === 'string' ? o.insert : '')).join('');
      }
    }
    return {
      title: String(t.title || '').trim(),
      notes,
      labels,
      priorityMarker,
      children: attached.map((c) => this.jsonTopicToNode(c)).filter(Boolean) as XmindTopic[],
    };
  }

  private parseContentXml(text: string): XmindSheet[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      allowBooleanAttributes: true,
      parseAttributeValue: false,
      trimValues: false,
      removeNSPrefix: true, // 兼容 xmap-content:sheet 等命名空间前缀
    });
    const doc: any = parser.parse(text);
    const xmap = doc['xmap-content'] || doc.xmap || doc;
    const sheetsRaw = this.asArray(xmap?.sheet);
    const sheets: XmindSheet[] = [];
    for (const s of sheetsRaw) {
      const root = this.xmlTopicToNode(s.topic);
      if (!root) continue;
      const sheetTitle = this.xmlText(s.title) || root.title || '';
      sheets.push({ title: sheetTitle, root });
    }
    return sheets;
  }

  private xmlTopicToNode(t: any): XmindTopic | null {
    if (!t) return null;
    const title = this.xmlText(t.title) || '';
    const markerRefs = this.asArray(t['marker-refs']?.['marker-ref']);
    const priorityMarker = markerRefs
      .map((mk) => String(mk?.['@_marker-id'] || '').toLowerCase())
      .find((id) => id.startsWith('priority-'));
    const labels = this.asArray(t.labels?.label)
      .map((l: any) => this.xmlText(l))
      .filter(Boolean);
    const notes = this.xmlText(t.notes?.plain) || '';
    const topicsGroups = this.asArray(t.children?.topics);
    const attached: any[] = [];
    for (const g of topicsGroups) {
      if ((g?.['@_type'] || 'attached') !== 'attached') continue;
      attached.push(...this.asArray(g.topic));
    }
    return {
      title: title.trim(),
      notes,
      labels,
      priorityMarker,
      children: attached.map((c) => this.xmlTopicToNode(c)).filter(Boolean) as XmindTopic[],
    };
  }

  private xmlText(node: any): string {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') return String(node);
    if (typeof node === 'object') {
      if ('#text' in node) return String(node['#text'] ?? '');
    }
    return '';
  }

  private asArray<T>(v: T | T[] | undefined | null): T[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
}
