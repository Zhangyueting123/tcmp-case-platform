/**
 * @author zhangyueting
 * @date 2026-06-10
 */
/**
 * TB Filler 服务
 *
 * 灵感来自 TBBugFiller (Python + Playwright)：复用本地 Chrome/Edge 的远程调试端口，
 * 通过 CDP 连接已登录的浏览器并自动填写 Teambition 缺陷表单。
 *
 * 与原版区别：
 *  - 用 Node + playwright-core（不下载浏览器二进制）
 *  - 直接嵌入 NestJS 后端，前端 fetch 一个接口即可触发
 *  - 失败/未配置时优雅返回错误码，前端回退到手动复制流程
 */
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright-core';
import * as net from 'net';

import { DefectLink } from '../../entities/defect-link.entity';
import { Project } from '../../entities/project.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizException } from '../../common/exceptions/biz.exception';

const BUG_TITLE_PLACEHOLDER = '输入标题以新建缺陷';
const PLACEHOLDER_TEXTS = ['待添加', '请选择', '未设置', '待认领', '待选择', '未认领'];

interface AutoFillResult {
  ok: boolean;
  warnings: string[];
  /** 当前 TB 标签页 URL（可能是缺陷创建页或刚保存的任务详情页） */
  pageUrl?: string;
}

export type { AutoFillResult };

@Injectable()
export class TbFillerService {
  private readonly logger = new Logger(TbFillerService.name);
  private readonly DEBUG_PORT = Number(process.env.TB_CHROME_DEBUG_PORT || 9222);
  private readonly PROFILE_DIR = process.env.TB_CHROME_PROFILE_DIR
    || join(process.cwd(), 'tb-browser-profile');

  constructor(
    @InjectRepository(DefectLink) private defectRepo: Repository<DefectLink>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
  ) {}

  /** GET /tb-filler/status —— 检查本地 Chrome 是否已以调试模式运行 */
  async status(): Promise<{ port: number; running: boolean; profileDir: string }> {
    return {
      port: this.DEBUG_PORT,
      running: await this.isPortOpen(this.DEBUG_PORT),
      profileDir: this.PROFILE_DIR,
    };
  }

  /** POST /tb-filler/launch —— 启动带调试端口的浏览器（用户首次登录时调用） */
  async launchBrowser(openUrl?: string): Promise<{ launched: boolean }> {
    if (await this.isPortOpen(this.DEBUG_PORT)) {
      return { launched: false }; // 已在跑
    }
    const exe = this.findBrowserExe();
    if (!exe) {
      throw new BizException('E9010', '未找到本机 Chrome 或 Edge，请先安装其中之一', 400);
    }
    if (!existsSync(this.PROFILE_DIR)) {
      mkdirSync(this.PROFILE_DIR, { recursive: true });
    }
    const args = [
      `--remote-debugging-port=${this.DEBUG_PORT}`,
      `--user-data-dir=${this.PROFILE_DIR}`,
    ];
    if (openUrl) args.push(openUrl);
    spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
    // 等端口起来（最多 12s）
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await this.isPortOpen(this.DEBUG_PORT)) return { launched: true };
    }
    throw new BizException('E9011', '浏览器已启动但调试端口未开放', 500);
  }

  /**
   * POST /defects/:id/auto-fill —— 把指定缺陷的内容通过 CDP 自动填到 TB
   * 步骤：
   *   1. 探测 9222 端口；未开则尝试自动启动
   *   2. CDP 连接 → 找/开 TB 缺陷分组页 → 打开创建面板
   *   3. 填标题、描述、问题发现人（CURRENT_USER）、缺陷分类、发生频率
   *   4. 不点保存，让用户审核后自行点击
   */
  async autoFillDefect(defectId: number): Promise<AutoFillResult> {
    const defect = await this.defectRepo.findOne({ where: { id: defectId } });
    if (!defect) throw new BizException('E9012', '缺陷不存在', 404);
    // TB 缺陷分组 URL（"TB 路径"）——用缺陷创建时落库的 TB 项目/分组（已按轮次配置解析），
    // 回退到项目级配置，保证既有数据不受影响。
    let tbBugSectionUrl: string | null = defect.tbProjectId
      ? (defect.tbBugSectionId
        ? `https://www.teambition.com/project/${defect.tbProjectId}/bug/section/${defect.tbBugSectionId}`
        : `https://www.teambition.com/project/${defect.tbProjectId}`)
      : null;
    if (!tbBugSectionUrl) {
      const project = await this.projectRepo.findOne({ where: { id: defect.projectId } });
      tbBugSectionUrl = project?.tbBugSectionUrl || null;
    }
    if (!tbBugSectionUrl) {
      throw new BizException('E9013', '未配置 Teambition 缺陷分组 URL（请在轮次中配置 TB 路径）', 400);
    }

    // 直接用 DefectsService.submitManual 已经拼好的字段
    const title = defect.title || '缺陷';
    const description = defect.description || '操作步骤：\n实际结果：\n预期结果：';

    // 确保浏览器在跑
    if (!(await this.isPortOpen(this.DEBUG_PORT))) {
      try {
        await this.launchBrowser(tbBugSectionUrl);
      } catch (e: any) {
        throw new BizException(
          'E9014',
          `本地 Chrome 未启动调试端口（${this.DEBUG_PORT}），请运行 backend/scripts/start-tb-chrome.bat 后重试`,
          400,
        );
      }
    }

    let browser: Browser | undefined;
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.DEBUG_PORT}`);
      const context = browser.contexts()[0];
      if (!context) throw new BizException('E9015', '浏览器没有可用上下文', 500);

      const page = await this.getOrCreateTbPage(context, tbBugSectionUrl);
      await page.goto(tbBugSectionUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await this.ensureLoggedIn(page);
      await page.bringToFront();

      const layout = await this.ensureBugForm(page);
      const warnings = await this.fillBugForm(page, layout, {
        title,
        description,
        category: process.env.TB_DEFAULT_CATEGORY || '软算缺陷',
        frequency: defect.occurrenceProb === 'STABLE' ? '必现' : '偶现',
        discoverer: '__CURRENT_USER__', // 自动选当前 TB 登录人
      });

      return { ok: true, warnings, pageUrl: page.url() };
    } finally {
      // 不关浏览器，CDP 上下文退出会自动断开
      try {
        await browser?.close();
      } catch {}
    }
  }

  // ---------------- 内部工具 ----------------

  private isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(800);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('timeout', () => { s.destroy(); resolve(false); });
      s.once('error', () => resolve(false));
      s.connect(port, '127.0.0.1');
    });
  }

  private findBrowserExe(): string | null {
    const dirs = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean) as string[];
    for (const base of dirs) {
      const p = join(base, 'Google', 'Chrome', 'Application', 'chrome.exe');
      if (existsSync(p)) return p;
    }
    for (const base of dirs) {
      const p = join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
      if (existsSync(p)) return p;
    }
    return null;
  }

  private async getOrCreateTbPage(context: BrowserContext, url: string): Promise<Page> {
    for (const page of context.pages()) {
      const u = (page.url() || '').toLowerCase();
      if (u.includes('teambition.com')) return page;
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    return page;
  }

  private async ensureLoggedIn(page: Page) {
    const url = (page.url() || '').toLowerCase();
    if (url.includes('login') || url.includes('signin')) {
      throw new BizException('E9009', '浏览器未登录 Teambition，请先在弹出窗口扫码登录后重试', 401);
    }
  }

  /** 打开"创建缺陷"面板；返回面板 Locator */
  private async ensureBugForm(page: Page): Promise<Locator> {
    // 已经打开的话直接复用
    const existing = await this.findOpenBugForm(page);
    if (existing) return existing;

    // 最多重试 5 次：若不小心点出的是「任务」面板，关掉再点一次加号
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await this.clickBoardHeaderAdd(page))) break;
      let layout = await this.waitForBugLayout(page, 1000);
      if (layout) return layout;
      // 出来的不是缺陷面板，可能是任务面板 → 按 ESC 关掉再试
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
      layout = await this.waitForBugLayout(page, 600);
      if (layout) return layout;
    }
    throw new BizException(
      'E9016',
      '未能通过「未完成缺陷」右侧加号打开创建缺陷面板。请确认当前 TB 标签页位于项目缺陷分组页（URL 含 /bug/section/...）',
      500,
    );
  }

  /**
   * 在页面里等待「未完成缺陷」分组渲染完成 + 找加号按钮并点击。
   * 核心选择器 `[data-role='board-table-header-add-task']` 来自 TB 的看板表头组件。
   */
  private async clickBoardHeaderAdd(page: Page): Promise<boolean> {
    const findAndMark = `() => {
      const grids = Array.from(document.querySelectorAll("[class*='swim-grid-header'], [class*='swim-grid-container']"));
      const unfinished = grids.filter(g => /未完成/.test(g.innerText || ''));
      const targets = unfinished.length ? unfinished : grids;
      if (!targets.length) return { ready: false, reason: 'no-grid' };
      const hasRow = targets.some(g => g.querySelectorAll("[class*='row'], [class*='item'], [data-role='task-row']").length > 0);
      if (!hasRow) return { ready: false, reason: 'no-row' };
      let btn = null;
      for (const g of targets) {
        btn = g.querySelector("[data-role='board-table-header-add-task']");
        if (btn) break;
      }
      if (!btn) return { ready: false, reason: 'no-btn' };
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { ready: false, reason: 'btn-invisible' };
      btn.setAttribute('data-tbtool-add', '1');
      return { ready: true };
    }`;

    const deadline = Date.now() + 30_000;
    let marked = false;
    while (Date.now() < deadline) {
      try {
        const res = (await page.evaluate(findAndMark)) as { ready: boolean; reason?: string };
        if (res?.ready) { marked = true; break; }
      } catch {}
      await page.waitForTimeout(200);
    }
    if (!marked) return false;
    await page.waitForTimeout(200);
    const btn = page.locator("[data-tbtool-add='1']").first();
    try {
      await btn.click({ timeout: 2000 });
    } catch {
      try { await btn.click({ force: true, timeout: 2000 }); } catch { return false; }
    }
    await page.evaluate(`() => document.querySelectorAll('[data-tbtool-add]').forEach(e => e.removeAttribute('data-tbtool-add'))`).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }

  private async waitForBugLayout(page: Page, timeoutMs: number): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const layout = await this.findOpenBugForm(page);
      if (layout) return layout;
      await page.waitForTimeout(150);
    }
    return null;
  }

  private async findOpenBugForm(page: Page): Promise<Locator | null> {
    const layouts = page.locator('#create-layout');
    const count = await layouts.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const layout = layouts.nth(i);
      const titleInput = layout.locator(`textarea[placeholder='${BUG_TITLE_PLACEHOLDER}']`);
      if (await titleInput.count() && await titleInput.first().isVisible().catch(() => false)) {
        return layout;
      }
    }
    return null;
  }

  /** 实际填表；返回未填成功的字段名列表 */
  private async fillBugForm(
    page: Page,
    layout: Locator,
    data: { title: string; description: string; category: string; frequency: string; discoverer: string },
  ): Promise<string[]> {
    const warnings: string[] = [];

    // 标题
    const titleInput = layout.locator(`textarea[placeholder='${BUG_TITLE_PLACEHOLDER}']`).first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(150);
    const cur = await titleInput.inputValue().catch(() => '');
    if (!cur.trim()) {
      await titleInput.click();
      await page.waitForTimeout(80);
      await titleInput.fill(data.title);
    }

    // 缺陷分类
    if (data.category && !(await this.fillSelectField(page, layout, ['缺陷分类'], data.category))) {
      warnings.push('缺陷分类');
    }
    // 问题发现人 = 当前登录人
    if (!(await this.fillDiscoverer(page, layout, ['问题发现人']))) {
      warnings.push('问题发现人');
    }
    // 问题描述（富文本）
    if (data.description && !(await this.fillRichField(page, layout, ['问题描述', '备注正文'], data.description))) {
      warnings.push('问题描述');
    }
    // 发生频率
    if (data.frequency && !(await this.fillPlainField(page, layout, ['发生频率'], data.frequency))) {
      warnings.push('发生频率');
    }

    return warnings;
  }

  private async fieldRow(layout: Locator, labels: string[]): Promise<Locator | null> {
    for (const label of labels) {
      const row = layout.locator(`xpath=.//*[contains(@class,'label') or self::label][normalize-space(text())='${label}']/ancestor::*[contains(@class,'field') or contains(@class,'row')][1]`).first();
      if (await row.count().catch(() => 0)) return row;
      // 备用：找包含 label 文本的最近行
      const alt = layout.locator(`xpath=.//*[normalize-space(text())='${label}']/ancestor::*[contains(@class,'field')][1]`).first();
      if (await alt.count().catch(() => 0)) return alt;
    }
    return null;
  }

  private async openSelect(row: Locator) {
    const trigger = row.locator(`xpath=.//*[contains(@class,'text-value') or contains(@class,'add-button') or contains(@data-role,'object-field-right')]`).first();
    if (await trigger.count()) {
      await trigger.click().catch(() => {});
    }
  }

  private async pickOptionByKeyword(page: Page, keyword: string): Promise<boolean> {
    // 等弹层
    const opt = page.locator(`xpath=//*[contains(@class,'option') or @role='option'][.//*[contains(text(),'${keyword}')] or contains(text(),'${keyword}')]`).first();
    try {
      await opt.waitFor({ state: 'visible', timeout: 3000 });
      await opt.click();
      return true;
    } catch {
      return false;
    }
  }

  private async fillSelectField(page: Page, layout: Locator, labels: string[], value: string): Promise<boolean> {
    const row = await this.fieldRow(layout, labels);
    if (!row) return false;
    if (await this.rowHasNonPlaceholderValue(row)) return true; // 已有值不动
    await this.openSelect(row);
    return this.pickOptionByKeyword(page, value);
  }

  private async fillDiscoverer(page: Page, layout: Locator, labels: string[]): Promise<boolean> {
    const row = await this.fieldRow(layout, labels);
    if (!row) return false;
    if (await this.rowHasNonPlaceholderValue(row)) return true;
    await this.openSelect(row);
    // 第一条选项通常就是"当前用户"
    const firstOpt = page.locator(`xpath=//*[@role='option' or contains(@class,'option')]`).first();
    try {
      await firstOpt.waitFor({ state: 'visible', timeout: 3000 });
      await firstOpt.click();
      return true;
    } catch {
      return false;
    }
  }

  private async fillRichField(page: Page, layout: Locator, labels: string[], value: string): Promise<boolean> {
    const row = await this.fieldRow(layout, labels);
    if (!row) return false;
    let editor = row.locator(`[role='textbox'], [contenteditable='true'], .ProseMirror`).last();
    if (!(await editor.count())) {
      const trigger = row.locator('.text-value, [data-role="add-button-text"]').first();
      if (await trigger.count()) await trigger.click().catch(() => {});
      editor = row.locator(`[role='textbox'], [contenteditable='true'], .ProseMirror`).last();
    }
    try {
      await editor.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return false;
    }
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    const lines = value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i]);
      if (i < lines.length - 1) await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Tab');
    return true;
  }

  private async fillPlainField(page: Page, layout: Locator, labels: string[], value: string): Promise<boolean> {
    const row = await this.fieldRow(layout, labels);
    if (!row) return false;
    if (await this.rowHasNonPlaceholderValue(row)) return true;
    let editor = row.locator('textarea.field-textarea, textarea, input').first();
    if (!(await editor.count())) {
      const trigger = row.locator('.text-value, [data-role="add-button-text"], [data-role="object-field-right"]').first();
      if (await trigger.count()) await trigger.click().catch(() => {});
      editor = row.locator('textarea.field-textarea, textarea, input').first();
    }
    try {
      await editor.waitFor({ state: 'visible', timeout: 3000 });
    } catch {
      return false;
    }
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(value);
    return true;
  }

  private async rowHasNonPlaceholderValue(row: Locator): Promise<boolean> {
    try {
      const txt = ((await row.innerText({ timeout: 500 })) || '').trim();
      if (!txt) return false;
      return !PLACEHOLDER_TEXTS.some((p) => txt.includes(p));
    } catch {
      return false;
    }
  }
}
