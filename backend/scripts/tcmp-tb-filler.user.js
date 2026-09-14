// ==UserScript==
// @name         TCMP TB 一键打开 + 提交回传
// @namespace    https://tcmp.local
// @version      2.8.3
// @description  TCMP → Teambition：自动点 "+ 创建缺陷" + 自动回填标题/软件版本/备注；别持 fetch/XHR 回传 taskId+标题；另支持 #tcmp_sync 同步状态与标题。
// @author       TCMP
// @match        https://*.teambition.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 启动 banner：你能立刻看到这行才说明脚本装上了
  console.log('%c[TCMP] userscript loaded v2.8.3 @ ' + location.href,
    'color:#fff;background:#67c23a;padding:2px 6px;border-radius:3px;font-weight:bold');
  window.__tcmp_loaded = '2.8.3';

  const TITLE_PLACEHOLDER = '输入标题以新建缺陷';
  const TRIGGER_KEY = 'tcmp_open';
  const SYNC_KEY = 'tcmp_sync';
  const ORIGIN_KEY = 'tcmp_origin';
  const DID_KEY = 'tcmp_did';
  const FILL_KEY = 'tcmp_fill';
  const SS_KEY = 'tcmp_open_pending';
  const SS_DID = 'tcmp_did_pending';
  const SS_ORIGIN = 'tcmp_origin_pending';
  const SS_FILL = 'tcmp_fill_pending';
  const SS_WATCH = 'tcmp_watching';

  function log(...a) { console.log('[TCMP]', ...a); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const r = await Promise.resolve(fn());
        if (r) return r;
      } catch {}
      await wait(150);
    }
    return null;
  }

  // ============================================================
  // 网络劫持 —— 必须最早注入（run-at document-start）
  // 监听任意创建任务的响应；如果在 watching 窗口期且包含 _id，就触发回传
  // ============================================================
  let pendingCreatedTask = null;

  function looksLikeTaskCreate(method, url) {
    if (!url || (method || '').toUpperCase() !== 'POST') return false;
    // 只认准以 /tasks 结尾（可带 query）的路径，严格排除 /task-groups /task-flows /task-list /tasks/xxx 等衡生端点
    // 匹配：/api/v2/tasks 、/api/tasks 、/api/projects/xxx/tasks
    return /\/tasks(?:\?|$)/i.test(url);
  }

  function tryHandleCreated(json) {
    if (!json) return;
    // 单条 / 数组 都支持
    const items = Array.isArray(json) ? json : [json];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const id = it._id || it.taskId;
      // 验收：必须看起来像 task（有 title / content 等任务特征字段）
      const looksLikeTask = ('content' in it) || ('title' in it) || ('_projectId' in it) || ('_tasklistId' in it);
      if (id && typeof id === 'string' && id.length >= 16 && looksLikeTask) {
        pendingCreatedTask = { id, raw: it, ts: Date.now() };
        log('★ 截获到 TB 新建 task:', id);
        maybeSendBack();
        return;
      }
    }
  }

  // hook fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const req = args[0];
      const init = args[1] || {};
      let method = init.method || (req && req.method) || 'GET';
      let url = '';
      try { url = typeof req === 'string' ? req : (req && req.url) || ''; } catch {}
      const resp = await origFetch.apply(this, args);
      try {
        // 调试：所有 POST 都打 log（方便看 TB 到底发什么路径）
        if ((method || '').toUpperCase() === 'POST') {
          log('[fetch POST]', url);
        }
        if (looksLikeTaskCreate(method, url)) {
          const clone = resp.clone();
          clone.json().then((j) => { log('[fetch hit]', url, j); tryHandleCreated(j); }).catch(() => {});
        }
      } catch (e) { log('fetch hook err', e); }
      return resp;
    };
    log('✓ fetch 已劫持');
  } else {
    log('⚠ 未找到 window.fetch');
  }

  // hook XMLHttpRequest
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (method, url) {
      this.__tcmp_method = method;
      this.__tcmp_url = url;
      return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function () {
      try {
        const m = (this.__tcmp_method || '').toUpperCase();
        if (m === 'POST') log('[xhr POST]', this.__tcmp_url);
        if (looksLikeTaskCreate(this.__tcmp_method, this.__tcmp_url)) {
          const self = this;
          // 用 readystatechange + load + loadend 三重保险
          const tryParse = (where) => {
            try {
              const status = self.status;
              const rt = self.responseType; // '' | 'text' | 'json' | 'arraybuffer' | 'blob' | 'document'
              let j = null;
              if (rt === 'json') {
                // 已被浏览器解析过，直接拿 response
                j = self.response;
                log('[xhr ' + where + ']', self.__tcmp_url, 'status=' + status, 'rt=json');
              } else if (rt === '' || rt === 'text') {
                const txt = self.responseText;
                log('[xhr ' + where + ']', self.__tcmp_url, 'status=' + status, 'len=' + (txt ? txt.length : 0));
                if (!txt) return;
                try { j = JSON.parse(txt); }
                catch (e) { log('  JSON.parse 失败，responseText 前 200:', txt.slice(0, 200)); return; }
              } else {
                log('[xhr ' + where + ']', self.__tcmp_url, 'status=' + status, 'rt=' + rt + ' (不支持，跳过)');
                return;
              }
              if (!j) return;
              log('[xhr hit]', self.__tcmp_url, j);
              tryHandleCreated(j);
            } catch (e) { log('  tryParse err', e); }
          };
          self.addEventListener('readystatechange', function () {
            if (self.readyState === 4 && !self.__tcmp_parsed) {
              self.__tcmp_parsed = true;
              tryParse('rs4');
            }
          });
          self.addEventListener('load', function () {
            if (!self.__tcmp_parsed) { self.__tcmp_parsed = true; tryParse('load'); }
          });
          self.addEventListener('loadend', function () {
            if (!self.__tcmp_parsed) { self.__tcmp_parsed = true; tryParse('loadend'); }
          });
        }
      } catch {}
      return origSend.apply(this, arguments);
    };
    log('✓ XHR 已劫持');
  } else {
    log('⚠ 未找到 window.XMLHttpRequest');
  }

  // ============================================================
  // 触发参数 / UI 工具
  // ============================================================
  function parseParams() {
    const h = (location.hash || '').replace(/^#/, '');
    const s = (location.search || '').replace(/^\?/, '');
    const parts = (h + '&' + s).split('&').filter(Boolean);
    const out = {};
    for (const p of parts) {
      const [k, v] = p.split('=');
      if (k) out[k] = decodeURIComponent(v || '');
    }
    return out;
  }
  function consumeParams() {
    let h = location.hash || '';
    let s = location.search || '';
    [TRIGGER_KEY, SYNC_KEY, ORIGIN_KEY, DID_KEY, FILL_KEY].forEach(k => {
      h = h.replace(new RegExp(`(^#|&)${k}=[^&]*`, 'g'), '').replace(/^#&?/, '#').replace(/^#$/, '');
      s = s.replace(new RegExp(`(^\\?|&)${k}=[^&]*`, 'g'), '').replace(/^\?&?/, '?').replace(/^\?$/, '');
    });
    try { history.replaceState(null, '', location.pathname + s + h); } catch {}
  }

  function toast(msg, ok = true) {
    const div = document.createElement('div');
    div.textContent = '[TCMP] ' + msg;
    Object.assign(div.style, {
      position: 'fixed', top: '20px', right: '20px', zIndex: 99999,
      background: ok ? '#67c23a' : '#f56c6c', color: '#fff',
      padding: '10px 16px', borderRadius: '4px', fontSize: '14px',
      boxShadow: '0 2px 12px rgba(0,0,0,.25)',
      fontFamily: 'PingFang SC, system-ui, sans-serif', maxWidth: '360px',
    });
    if (document.body) document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  // ============================================================
  // React Fiber 直调
  // ============================================================
  function getReactProps(el) {
    const k = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    return k ? el[k] : null;
  }
  function makeFakeEvent(el) {
    const r = el.getBoundingClientRect();
    return {
      target: el, currentTarget: el, bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      button: 0, buttons: 0, type: 'click',
      nativeEvent: { type: 'click' },
      preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
      persist() {},
    };
  }
  function invokeReactClick(el) {
    let n = el, depth = 0;
    while (n && depth < 8) {
      const p = getReactProps(n);
      if (p) {
        const ev = makeFakeEvent(el);
        if (typeof p.onClick === 'function') {
          try { p.onClick(ev); return n; } catch (e) { log('onClick err', e); }
        }
        if (typeof p.onMouseDown === 'function') {
          try { p.onMouseDown(ev); return n; } catch (e) { log('onMouseDown err', e); }
        }
      }
      n = n.parentElement;
      depth++;
    }
    return null;
  }
  function realClick(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse', pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse', pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  function findModalTitle() {
    return Array.from(document.querySelectorAll(`textarea[placeholder='${TITLE_PLACEHOLDER}']`))
      .find(el => el.offsetParent !== null) || null;
  }
  function isModalOpen() { return !!findModalTitle(); }

  // ============================================================
  // 自动回填：标题 / 软件版本 / 备注（6 段模板）
  // ============================================================
  /** 给 React 受控的 input/textarea 赋值并触发 input/change */
  function setNativeValue(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
    } catch { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** 找到「标签文字」所在字段行里的输入控件（input/textarea/contenteditable） */
  function findFieldControlByLabel(labelText) {
    const labels = Array.from(document.querySelectorAll('div, span, label'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === labelText);
    for (const lab of labels) {
      // 向上找 3~5 层容器，再在容器里找控件
      let box = lab;
      for (let i = 0; i < 5 && box; i++) {
        const ctrl = box.querySelector('input, textarea, [contenteditable="true"]');
        if (ctrl && ctrl.offsetParent !== null) return ctrl;
        box = box.parentElement;
      }
    }
    return null;
  }

  /** 精确找到「标签文字」的叶子元素（textContent 恰好等于且后代最少） */
  function findLabelLeaf(labelText) {
    const cand = Array.from(document.querySelectorAll('div, span, label, p'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === labelText);
    cand.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    return cand[0] || null;
  }

  /** 找到标签所在的「字段行」容器（含值控件/值区的最近祖先） */
  function fieldRowOf(labelEl) {
    let box = labelEl;
    for (let i = 0; i < 6 && box.parentElement; i++) {
      box = box.parentElement;
      if (box.querySelector('input, textarea, [contenteditable="true"]')) return box;
      // 行里有多个直接子（label + 值区）也算命中
      if (box.children && box.children.length >= 2) return box;
    }
    return labelEl.parentElement || labelEl;
  }

  /** 定位备注富文本编辑器：含模板标记 [前置条件] 的可编辑区最可靠 */
  function findNoteEditor() {
    const EDITABLE_SEL = '[data-cangjie-editable="true"], [contenteditable="true"]';
    // 方式 A：走 object-field 结构，标签=备注 → 右侧里的可编辑区
    const fields = Array.from(document.querySelectorAll('[data-role="object-field"]'))
      .filter(f => f.offsetParent !== null);
    for (const f of fields) {
      const left = f.querySelector('[data-role="object-field-left"]') || f;
      if ((left.textContent || '').replace(/\s/g, '').includes('备注')) {
        const right = f.querySelector('[data-role="object-field-right"]') || f;
        const ed = right.querySelector(EDITABLE_SEL);
        if (ed && ed.offsetParent !== null) return ed;
        return right;
      }
    }
    // 方式 B：含模板标记的可编辑区
    const eds = Array.from(document.querySelectorAll(EDITABLE_SEL))
      .filter(el => el.offsetParent !== null);
    const byMarker = eds.find(el => /\[前置条件\]|\[操作步骤描述\]|\[预期结果\]/.test(el.textContent || ''));
    if (byMarker) return byMarker;
    const marked = Array.from(document.querySelectorAll('div, p, span'))
      .find(el => el.offsetParent !== null && /\[前置条件\]|\[操作步骤描述\]/.test(el.textContent || ''));
    if (marked) {
      const anc = marked.closest && marked.closest(EDITABLE_SEL);
      if (anc) return anc;
      const desc = marked.querySelector(EDITABLE_SEL);
      if (desc) return desc;
    }
    eds.sort((a, b) => (b.textContent || '').length - (a.textContent || '').length);
    return eds[0] || null;
  }

  /**
   * 往富文本写入多行。TB 备注用 Cangjie(沧颉/Slate) 编辑器，只能靠模拟粘贴写入
   * （execCommand/直接改 DOM 会被 Slate 数据模型覆盖）。
   */
  function fillContentEditable(el, text) {
    // 取真正可编辑根
    const editable = (el.matches && el.matches('[data-cangjie-editable="true"], [contenteditable="true"]'))
      ? el
      : (el.querySelector && el.querySelector('[data-cangjie-editable="true"], [contenteditable="true"]')) || el;
    // 策略 1：模拟粘贴（Slate/Cangjie/ProseMirror/Quill 都监听 paste）
    try {
      editable.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editable);
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const before = editable.textContent || '';
      editable.dispatchEvent(ev);
      if ((editable.textContent || '') !== before && /前置条件/.test(editable.textContent || '')) return true;
    } catch (e) { log('paste 注入失败', e); }
    // 策略 2：execCommand（普通 contenteditable 兜底）
    try {
      editable.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) document.execCommand('insertParagraph', false);
        if (lines[i]) document.execCommand('insertText', false, lines[i]);
      }
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (e) { log('fillContentEditable err', e); return false; }
  }

  /** 往 contenteditable 富文本写入多行（execCommand，兼容 ProseMirror/Quill 等） */
  function fillContentEditable(el, text) {
    // 先选中全部旧内容
    try {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    // 策略 1：模拟粘贴（ProseMirror/Quill/Slate 多监听 paste）
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const before = (el.textContent || '');
      el.dispatchEvent(ev);
      // 粘贴若被处理，内容会变化
      if ((el.textContent || '') !== before && /前置条件/.test(el.textContent || '')) return true;
    } catch (e) { log('paste 注入失败', e); }
    // 策略 2：execCommand 逐行插入
    try {
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) document.execCommand('insertParagraph', false);
        if (lines[i]) document.execCommand('insertText', false, lines[i]);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (e) { log('fillContentEditable err', e); return false; }
  }

  /**
   * 填自定义文本字段（如软件版本）。TB 结构：
   *   div[data-role="object-field"]
   *     ├ div[data-role="object-field-left"]  ← 标签（软件版本）
   *     └ div[data-role="object-field-right"] ← 输入框
   * 用 data-role 定位（稳定，不依赖带哈希的 class）。
   */
  /** 取容器内最深的可见元素（用于点击激活占位输入框） */
  function deepestVisibleChild(root) {
    let node = root;
    // 优先带占位文字的叶子
    const withText = Array.from(root.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null && el.children.length === 0 && (el.textContent || '').trim());
    if (withText.length) return withText[withText.length - 1];
    // 否则最深的可见叶子
    const leaves = Array.from(root.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null && el.children.length === 0);
    return leaves.length ? leaves[leaves.length - 1] : node;
  }

  async function fillCustomTextField(labelText, value) {
    // 重试等待字段渲染（自定义字段可能晚于标题渲染）
    const target = await waitFor(() => {
      const fields = Array.from(document.querySelectorAll('[data-role="object-field"]'))
        .filter(f => f.offsetParent !== null);
      for (const f of fields) {
        const left = f.querySelector('[data-role="object-field-left"]') || f;
        if ((left.textContent || '').replace(/\s/g, '').includes(labelText)) return f;
      }
      // 备用：直接找标签叶子，往上爬到含 object-field-right 的容器
      const leaf = Array.from(document.querySelectorAll('span, div, label'))
        .find(el => el.offsetParent !== null && (el.textContent || '').trim() === labelText);
      if (leaf) {
        let box = leaf;
        for (let i = 0; i < 8 && box; i++) {
          if (box.querySelector && box.querySelector('[data-role="object-field-right"], input, textarea, [contenteditable="true"]')) return box;
          box = box.parentElement;
        }
      }
      return null;
    }, 6000);
    if (!target) {
      const cnt = document.querySelectorAll('[data-role="object-field"]').length;
      toast(`⚠ 未定位到「${labelText}」（页面自定义字段数=${cnt}）`, false);
      return false;
    }
    const right = target.querySelector('[data-role="object-field-right"]') || target;
    let ctrl = right.querySelector('input, textarea, [contenteditable="true"]');
    if (!ctrl || ctrl.offsetParent === null) {
      // 该类字段是"点一下才从占位变输入框"。用真实鼠标事件点值区里最深的可见元素（React 需要）。
      const clickTargets = [];
      const deepest = deepestVisibleChild(right);
      if (deepest) clickTargets.push(deepest);
      clickTargets.push(right);
      for (const t of clickTargets) {
        try { realClick(t); } catch {}
        try { invokeReactClick(t); } catch {}
      }
      // 等输入框出现（含 activeElement 兜底）
      ctrl = await waitFor(() => {
        const c = right.querySelector('input, textarea, [contenteditable="true"]');
        if (c && c.offsetParent !== null) return c;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.getAttribute('contenteditable') === 'true')) return ae;
        return null;
      }, 2500);
    }
    if (ctrl && ctrl.offsetParent !== null) {
      ctrl.focus();
      if (ctrl.getAttribute('contenteditable') === 'true') fillContentEditable(ctrl, value);
      else setNativeValue(ctrl, value);
      try { ctrl.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
      return true;
    }
    toast(`⚠ 「${labelText}」找到字段但无输入框`, false);
    return false;
  }

  /** 按标签定位自定义字段容器 [data-role="object-field"] */
  function findObjectFieldByLabel(labelText) {
    const fields = Array.from(document.querySelectorAll('[data-role="object-field"]'))
      .filter(f => f.offsetParent !== null);
    for (const f of fields) {
      const left = f.querySelector('[data-role="object-field-left"]') || f;
      if ((left.textContent || '').replace(/\s/g, '').includes(labelText)) return f;
    }
    return null;
  }

  /** 读取某自定义字段右侧当前显示值 */
  function readFieldValue(labelText) {
    const f = findObjectFieldByLabel(labelText);
    if (!f) return null;
    const right = f.querySelector('[data-role="object-field-right"]') || f;
    return (right.textContent || '').trim();
  }

  /**
   * 单选/下拉类自定义字段（严重程度/是否稳定复现/优先级）：点开值区 → 在弹层里点匹配选项。
   * TB 选项通常渲染在 body 下的浮层（portal），点击后要全局找可见选项。
   */
  async function selectDropdownOption(labelText, targetValue) {
    const wanted = targetValue.replace(/\s/g, '');
    const field = await waitFor(() => findObjectFieldByLabel(labelText), 5000);
    if (!field) { log('未找到下拉字段', labelText); toast(`⚠ 未找到「${labelText}」`, false); return false; }
    const right = field.querySelector('[data-role="object-field-right"]') || field;
    const curVal = () => (right.textContent || '').replace(/\s/g, '');
    // 已经是目标值就跳过
    if (curVal().includes(wanted)) { log(labelText, '已是', targetValue); return true; }

    const findOption = () => {
      const menus = Array.from(document.querySelectorAll('[role="menu"], [class*="menu__"], [class*="dropdown"], [class*="selectable-selection"]'))
        .filter(m => m.offsetParent !== null);
      const scopes = menus.length ? menus : [document];
      const eq = (el) => (el.textContent || '').trim() === targetValue;
      for (const m of scopes) {
        const items = Array.from(m.querySelectorAll('[class*="item"], [role="option"], [role="menuitem"], li'))
          .filter(el => el.offsetParent !== null && eq(el));
        if (items.length) return items[items.length - 1];
        const leaf = Array.from(m.querySelectorAll('[class*="choice-renderer-value"], span, div'))
          .find(el => el.offsetParent !== null && el.children.length === 0 && eq(el));
        if (leaf) return leaf.closest('[class*="item"]') || leaf.parentElement || leaf;
      }
      return null;
    };

    // 最多两次尝试：点开 → 选项 → 校验；未生效则关闭浮层重试
    for (let attempt = 0; attempt < 2; attempt++) {
      closePopovers();
      await wait(150);
      const clickTarget = deepestVisibleChild(right);
      try { realClick(clickTarget); } catch {}
      try { invokeReactClick(clickTarget); } catch {}
      try { realClick(right); } catch {}
      const opt = await waitFor(findOption, 2500);
      if (!opt) { log('未找到选项', labelText, targetValue, 'attempt', attempt); continue; }
      try { realClick(opt); } catch {}
      try { invokeReactClick(opt); } catch {}
      // 等待并校验字段值已变为目标
      const applied = await waitFor(() => curVal().includes(wanted) ? true : null, 1500);
      closePopovers();
      if (applied) { log('✓ 已选', labelText, '=', targetValue); return true; }
      log('选项已点但未生效，重试', labelText, 'attempt', attempt);
    }
    toast(`⚠「${labelText}」设置「${targetValue}」未生效`, false);
    return false;
  }

  /** 关闭可能残留的下拉/浮层：点弹窗中性区域（标题栏/字段标签），绝不用 Esc（会误关整个创建弹窗） */
  function closePopovers() {
    // 优先点"创建缺陷"标题（纯文本、非交互，可安全收起浮层）
    const header = Array.from(document.querySelectorAll('div, span, h1, h2, h3, p'))
      .find(el => el.offsetParent !== null && (el.textContent || '').trim() === '创建缺陷');
    const label = Array.from(document.querySelectorAll('[data-role="object-field-left"]'))
      .find(el => el.offsetParent !== null);
    const t = header || label;
    if (t) { try { realClick(t); } catch {} }
  }

  /** 备注 6 段模板 */
  function buildNote(fill) {
    const L = (k, v) => `[${k}]：${(v || '').trim()}`;
    return [
      L('前置条件', fill.precondition),
      L('操作步骤描述', fill.steps),
      L('实际结果', fill.actualResult),
      L('预期结果', fill.expectedResult),
      L('问题定位', ''),
      L('补充说明', ''),
    ].join('\n');
  }

  /** 把光标定位到某段落末尾并同步给编辑器 */
  function caretAtEnd(node) {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    } catch (e) { log('caretAtEnd err', e); }
  }

  /** 向当前选区派发 insertText（Slate/Cangjie 监听 beforeinput 处理插入） */
  function dispatchInsertText(target, text) {
    try {
      target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
      target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
      return true;
    } catch (e) { log('dispatchInsertText err', e); return false; }
  }

  /**
   * 填 Cangjie(沧颉/Slate) 备注：模板已有 [前置条件]: 等独立段落，
   * 逐段把光标放到段末，再 beforeinput 插入对应值。
   */
  async function fillCangjieNote(editable, fill) {
    const sections = [
      { marker: '前置条件', value: fill.precondition },
      { marker: '操作步骤描述', value: fill.steps },
      { marker: '实际结果', value: fill.actualResult },
      { marker: '预期结果', value: fill.expectedResult },
    ].filter(s => (s.value || '').trim());
    if (!sections.length) return true;
    editable.focus();
    const blocks = Array.from(editable.querySelectorAll('[data-cangjie-leaf-block="true"], [data-type="paragraph"]'))
      .filter(b => b.offsetParent !== null);
    let anyOk = false;
    for (const sec of sections) {
      const block = blocks.find(b => (b.textContent || '').includes('[' + sec.marker + ']'))
        || blocks.find(b => (b.textContent || '').includes(sec.marker));
      if (!block) { log('未找到段落', sec.marker); continue; }
      const before = editable.textContent || '';
      caretAtEnd(block);
      await wait(150);
      dispatchInsertText(block, (sec.value || '').trim());
      await wait(200);
      if ((editable.textContent || '') !== before) anyOk = true;
    }
    return anyOk;
  }

  // ============================================================
  // Cangjie(沧颉/Slate 0.4x) 编辑器实例直调（全自动写入备注的正道）
  // ============================================================
  function getReactFiber(el) {
    const k = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    return k ? el[k] : null;
  }
  /** 从可编辑 DOM 顺着 fiber 找 Cangjie 的 editor(有 insertText) 和 controller(有 setValue+command) */
  function findCangjieInstances(el) {
    let fiber = getReactFiber(el);
    let d = 0, editor = null, controller = null;
    const check = (v) => {
      if (!v || typeof v !== 'object') return;
      if (!editor && typeof v.insertText === 'function') editor = v;
      if (!controller && typeof v.setValue === 'function' && typeof v.command === 'function') controller = v;
    };
    while (fiber && d < 80) {
      const mp = fiber.memoizedProps;
      if (mp) { for (const key of Object.keys(mp)) { try { check(mp[key]); } catch {} } }
      let ms = fiber.memoizedState, h = 0;
      while (ms && h < 30) { try { check(ms.memoizedState); } catch {} ms = ms.next; h++; }
      if (editor && controller) break;
      fiber = fiber.return; d++;
    }
    return { editor, controller };
  }
  /** 用 Cangjie 实例把值追加到各 [标记] 段落末尾（自动探测可用的提交方式） */
  async function fillCangjieViaInstance(editable, fill) {
    const { editor, controller } = findCangjieInstances(editable);
    if (!editor && !controller) return { ok: false, editor: false, controller: false };
    const sections = [
      { marker: '前置条件', value: fill.precondition },
      { marker: '操作步骤描述', value: fill.steps },
      { marker: '实际结果', value: fill.actualResult },
      { marker: '预期结果', value: fill.expectedResult },
    ].filter(s => (s.value || '').trim());
    if (!sections.length) return { ok: true, editor: true, empty: true };

    const blockList = () => Array.from(editable.querySelectorAll('[data-cangjie-leaf-block="true"], [data-type="paragraph"]'))
      .filter(b => b.offsetParent !== null);
    // 定位段落 → 文本节点索引与末尾 offset（同 key 前缀的 leaf 属同一文本节点）
    const locate = (marker) => {
      const blocks = blockList();
      const bi = blocks.findIndex(b => (b.textContent || '').includes('[' + marker + ']'));
      if (bi < 0) return null;
      const block = blocks[bi];
      const leaves = Array.from(block.querySelectorAll('[data-cangjie-leaf="true"]'));
      const order = [], len = {};
      for (const lf of leaves) {
        const kk = (lf.getAttribute('data-cangjie-key') || '').split(':')[0];
        if (!(kk in len)) { len[kk] = 0; order.push(kk); }
        len[kk] += (lf.textContent || '').length;
      }
      const ti = Math.max(0, order.length - 1);
      const off = order.length ? len[order[ti]] : (block.textContent || '').length;
      return { bi, ti, off };
    };
    // 5 种提交策略（不同 Cangjie 版本入口不同，自动挑能生效的）
    const strategies = [
      { name: 'applyOperation', need: 'c', fn: (bi, ti, off, t) => controller.applyOperation({ type: 'insert_text', path: [bi, ti], offset: off, text: t, marks: [] }) },
      { name: 'command(fn)', need: 'c', fn: (bi, ti, off, t) => controller.command((e) => e.insertText([bi, ti], off, t)) },
      { name: 'run(fn)', need: 'c', fn: (bi, ti, off, t) => controller.run((e) => e.insertText([bi, ti], off, t)) },
      { name: 'editor+flush', need: 'e', fn: (bi, ti, off, t) => { editor.insertText([bi, ti], off, t); controller && controller.flush && controller.flush(); } },
      { name: 'editor+schedule', need: 'e', fn: (bi, ti, off, t) => { editor.insertText([bi, ti], off, t); controller && controller.scheduleFlush && controller.scheduleFlush(); } },
    ];

    let winning = null, lastErr = null;
    for (const sec of sections) {
      const val = (sec.value || '').trim();
      const probe = val.slice(0, 4);
      if (winning) {
        const loc = locate(sec.marker); if (!loc) continue;
        try { winning.fn(loc.bi, loc.ti, loc.off, val); } catch (e) { lastErr = e; }
        await wait(200);
        continue;
      }
      // 首段：逐个策略试，DOM 真变了就锁定该策略
      for (const st of strategies) {
        if (st.need === 'c' && !controller) continue;
        if (st.need === 'e' && !editor) continue;
        const loc = locate(sec.marker); if (!loc) break;
        const before = editable.textContent || '';
        try { st.fn(loc.bi, loc.ti, loc.off, val); } catch (e) { lastErr = e; log('策略', st.name, '报错', e && e.message); continue; }
        await wait(300);
        const now = editable.textContent || '';
        if (now !== before && now.includes(probe)) { winning = st; log('✓ 生效提交方式:', st.name); break; }
      }
      if (!winning) return { ok: false, editor: !!editor, controller: !!controller, err: lastErr && (lastErr.message || String(lastErr)) };
    }
    return { ok: true, winning: winning && winning.name, editor: !!editor, controller: !!controller };
  }

  /** 往富文本编辑器写入多行文本（尽量兼容 contenteditable 编辑器） */
  function fillRichText(editor, text) {
    return fillContentEditable(editor, text);
  }

  /** 在创建缺陷弹窗里回填各字段 */
  async function fillModalFields(fill) {
    if (!fill) return;
    log('▶ 开始回填字段', fill);
    toast('▶ 收到回填数据，开始填写…');
    // 1) 标题 ← 实际结果
    try {
      const titleEl = await waitFor(findModalTitle, 6000);
      if (titleEl && fill.title) {
        setNativeValue(titleEl, fill.title);
        log('✓ 已填标题');
        toast('✓ 已填标题');
      } else if (!titleEl) {
        toast('⚠ 未找到标题输入框', false);
      }
    } catch (e) { log('填标题 err', e); }

    // 2) 软件版本（自定义文本字段，可能需点值区激活）
    try {
      if (fill.softwareVersion) {
        const ok = await fillCustomTextField('软件版本', fill.softwareVersion);
        if (ok) { log('✓ 已填软件版本'); toast('✓ 已填软件版本'); }
        else { log('⚠ 未找到软件版本字段'); }
      }
    } catch (e) { log('填软件版本 err', e); }

    // 3) 备注（Cangjie/Slate）：优先用 Slate 实例 API 全自动写入；失败再走剪贴板 Ctrl+V
    try {
      const editor = await waitFor(findNoteEditor, 5000);
      if (editor) {
        const editable = (editor.matches && editor.matches('[data-cangjie-editable="true"], [contenteditable="true"]'))
          ? editor
          : (editor.querySelector && editor.querySelector('[data-cangjie-editable="true"], [contenteditable="true"]')) || editor;
        try { editable.focus(); } catch {}
        const res = await fillCangjieViaInstance(editable, fill);
        await wait(300);
        const nowText = editable.textContent || '';
        const probe = (fill.precondition || '').trim().slice(0, 6);
        const done = res.empty === true || (res.ok && (!probe || nowText.includes(probe)));
        if (done) {
          log('✓ 备注已自动回填', res.winning || '');
          toast('✓ 已自动回填备注' + (res.winning ? '（' + res.winning + '）' : ''));
        } else {
          log('⚠ 实例填充未生效', res);
          if (res.err) toast('备注写入报错: ' + String(res.err).slice(0, 60), false);
          if (fill.noteCopied) toast('📋 备注已复制：在备注框内按 Ctrl+A 再 Ctrl+V 粘贴', false);
        }
      } else {
        log('⚠ 未找到备注编辑器');
        toast('⚠ 未找到「备注」编辑器', false);
      }
    } catch (e) { log('填备注 err', e); }

    // 清理可能残留的全选（避免界面卡在蓝色高亮态）
    try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch {}

    // 4) 下拉/单选字段：严重程度=一般、是否稳定复现=稳定复现、优先级=普通
    try { await selectDropdownOption('严重程度', '一般'); } catch (e) { log('严重程度 err', e); }
    await wait(200);
    try { await selectDropdownOption('是否稳定复现', '稳定复现'); } catch (e) { log('稳定复现 err', e); }
    await wait(200);
    try { await selectDropdownOption('优先级', '普通'); } catch (e) { log('优先级 err', e); }
    closePopovers();

    // 5) 缺陷分类：由 TB 按「+ 创建缺陷」所属分组回填（见 openCreateModal），这里只做诊断
    try {
      const cur = readFieldValue('缺陷分类');
      log('缺陷分类当前值:', cur);
      if (cur !== null) {
        const empty = /待添加|请选择|^$/.test(cur) || cur === '缺陷分类';
        toast(empty ? '缺陷分类为空，请手动选择' : '缺陷分类: ' + cur, !empty);
      }
    } catch (e) { log('缺陷分类诊断 err', e); }

    toast('✓ 回填流程结束，请核对后点「完成」');
  }

  function findAddBtn() {
    const byRole = Array.from(document.querySelectorAll("[data-role='board-table-header-add-task']"))
      .find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null; });
    if (byRole) return byRole;
    const txts = ['+ 创建任务', '+ 创建缺陷', '创建任务', '创建缺陷', '新缺陷', '新任务'];
    const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"]'));
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (txts.some(x => t === x || t.startsWith(x))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  /**
   * 打开创建缺陷弹窗。
   *
   * 必须用真实事件序列（realClick）打开：TB 靠按钮所属分组的上下文回填「缺陷分类」，
   * React 在 root 上按真实 DOM 事件派发，上下文才完整。invokeReactClick 传的是伪造
   * 事件、且会向上最多爬 8 层找 onClick，可能命中不带分组上下文的通用 handler ——
   * 弹窗照样开，但缺陷分类为空。所以它只能当兜底。
   */
  async function openCreateModal() {
    if (isModalOpen()) return true;
    toast('正在打开创建缺陷弹窗…');
    const btn = await waitFor(findAddBtn, 20000);
    if (!btn) { toast('未找到"+ 创建缺陷"按钮', false); return false; }
    const sameKind = document.querySelectorAll("[data-role='board-table-header-add-task']").length;
    log(`找到按钮，触发点击（同类按钮 ${sameKind} 个）`, btn);
    // 让 TB 把当前分组/筛选上下文挂到按钮上，避免过早点击丢失「缺陷分类」回填
    await wait(400);

    realClick(btn);
    if (await waitFor(isModalOpen, 5000)) return true;

    log('真实点击未弹窗，改用 React props 兜底（缺陷分类可能不会回填）');
    invokeReactClick(btn);
    if (await waitFor(isModalOpen, 3000)) return true;

    log('首次点击未弹窗，重试…');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(300);
    const btn2 = await waitFor(findAddBtn, 3000);
    if (btn2) {
      realClick(btn2);
      if (!(await waitFor(isModalOpen, 3000))) invokeReactClick(btn2);
    }
    return !!(await waitFor(isModalOpen, 5000));
  }

  // ============================================================
  // 回传
  // ============================================================
  function buildTaskUrl(taskId, raw) {
    // TB 缺陷访问格式为 /project/<pid>/bug/task/<tid>（响应里的 url 字段是 /tasks/view/...，不能直访）
    // 优先从 raw 里拿 projectId
    let pid = '';
    if (raw && typeof raw === 'object') {
      pid = raw._projectId || raw.projectId || '';
    }
    // 其次从当前页面路径取
    if (!pid) {
      const m = location.pathname.match(/\/project\/([a-f0-9]{24})/i);
      if (m) pid = m[1];
    }
    if (pid) {
      return `https://www.teambition.com/project/${pid}/bug/task/${taskId}`;
    }
    // 兑底：TB 短链
    return `https://www.teambition.com/task/${taskId}`;
  }

  function sendBackToTcmp(taskUrl) {
    const origin = sessionStorage.getItem(SS_ORIGIN) || '*';
    const did = sessionStorage.getItem(SS_DID) || '';
    const taskId = pendingCreatedTask ? pendingCreatedTask.id : '';
    const raw = pendingCreatedTask ? pendingCreatedTask.raw : null;
    const tbTitle = raw && typeof raw === 'object' ? (raw.content || raw.title || '') : '';
    const payload = {
      type: 'tcmp_tb_defect_submitted',
      tbUrl: taskUrl || '',
      taskId: taskId,
      title: tbTitle || '',
      defectId: did ? Number(did) : null,
      hasUrl: !!taskUrl,
      ts: Date.now(),
    };
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, origin);
        log('✓ postMessage 已发出', payload);
      }
    } catch (e) { log('postMessage err', e); }
    // localStorage 兜底通道 —— 无论 postMessage 成不成功都写，双保险（TCMP 同源页面会收到 storage 事件）
    try {
      localStorage.setItem('tcmp_tb_defect_relay', JSON.stringify(payload));
      log('✓ 已写 localStorage 兜底广播');
    } catch (e) { log('localStorage err', e); }
    toast('✓ TB 提交成功，已通知 TCMP 自动关联');
    sessionStorage.removeItem(SS_WATCH);
    sessionStorage.removeItem(SS_DID);
    sessionStorage.removeItem(SS_ORIGIN);
    pendingCreatedTask = null;
  }

  /** 网络层捕获到 task 后调用 —— 仅在 watching 窗口期内回传 */
  function maybeSendBack() {
    if (sessionStorage.getItem(SS_WATCH) !== '1') {
      log('（未在 watching 窗口期，忽略截获）');
      return;
    }
    if (!pendingCreatedTask) return;
    const url = buildTaskUrl(pendingCreatedTask.id, pendingCreatedTask.raw);
    sendBackToTcmp(url);
  }

  /** 启动监听窗口（弹窗打开后调） */
  function startWatching() {
    if (sessionStorage.getItem(SS_WATCH) === '1') return;
    sessionStorage.setItem(SS_WATCH, '1');
    log('▶ 开始监听 TB 任务创建（fetch/XHR 已劫持）');
    // 如果已经截获（很罕见但可能）→ 立刻回传
    if (pendingCreatedTask) maybeSendBack();

    // 超时保护：10 分钟
    setTimeout(() => {
      if (sessionStorage.getItem(SS_WATCH) === '1') {
        log('监听超时，停止');
        sessionStorage.removeItem(SS_WATCH);
      }
    }, 10 * 60 * 1000);
  }

  // ============================================================
  // 主流程
  // ============================================================
  // \u540c\u6b65 TB \u72b6\u6001\u5230 TCMP\uff08\u5728 TB \u4efb\u52a1\u8be6\u60c5\u9875 #tcmp_sync=<defectId> \u89e6\u53d1\uff09
  // ============================================================
  /** \u4ece TB \u4efb\u52a1\u8be6\u60c5\u9875 DOM \u8bfb\u51fa\u72b6\u6001\u6587\u5b57 */
  async function readTbTaskStatus() {
    // TB \u4efb\u52a1\u8be6\u60c5\u72b6\u6001\u90a3\u4e2a\u6309\u94ae\uff1a\u5728\u4efb\u52a1\u9762\u677f\u6700\u4e0a\u9762\uff0c\u9020\u578b "\u72b6\u6001 [\u5f85\u5904\u7406]"
    return await waitFor(() => {
      // \u7b56\u7565 A\uff1a\u67e5\u5e26 data-role \u7684\u72b6\u6001\u5143\u7d20
      const cand = document.querySelector('[data-role="task-status"], [class*="task-status"], [class*="taskStatus"]');
      if (cand && cand.offsetParent !== null) {
        const t = (cand.textContent || '').trim();
        if (t && t.length < 20) return t;
      }
      // \u7b56\u7565 B\uff1a\u4f9d\u9760 \u72b6\u6001 / \u5f85\u5904\u7406 \u7b49\u5173\u952e\u8bcd
      const labels = Array.from(document.querySelectorAll('div, span, button'))
        .filter(el => el.offsetParent !== null);
      for (const el of labels) {
        const t = (el.textContent || '').trim();
        // \u5e38\u89c1\u72b6\u6001\uff1a\u5f85\u5904\u7406/\u5904\u7406\u4e2d/\u5df2\u5904\u7406/\u5df2\u5173\u95ed/\u5df2\u5b8c\u6210
        if (/^(\u5f85\u5904\u7406|\u5904\u7406\u4e2d|\u5df2\u5904\u7406|\u5df2\u5173\u95ed|\u5df2\u5b8c\u6210|\u672a\u5f00\u59cb|\u8fdb\u884c\u4e2d)$/.test(t)) {
          return t;
        }
      }
      return null;
    }, 8000);
  }

  /** 从当前 URL 提取 TB 任务 id */
  function currentTaskId() {
    const m = location.pathname.match(/\/task\/([a-f0-9]{16,})/i);
    return m ? m[1] : '';
  }

  /** 直接调 TB 自己的接口拿任务内容（标题）——脚本在 teambition.com 上带登录态，最可靠 */
  async function fetchTbTaskTitleByApi() {
    const taskId = currentTaskId();
    if (!taskId) return '';
    const urls = [
      `/api/tasks/${taskId}`,
      `https://www.teambition.com/api/tasks/${taskId}`,
    ];
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const j = await r.json();
        const t = (j && (j.content || j.title)) || (j && j.data && (j.data.content || j.data.title)) || '';
        if (t && String(t).trim()) return String(t).trim();
      } catch (e) { log('fetchTbTaskTitleByApi err', u, e); }
    }
    return '';
  }

  /** 从 TB 任务详情页 DOM 读出缺陷标题（任务内容） */
  async function readTbTaskTitle() {
    return await waitFor(() => {
      // 策略 A：详情页标题多为 textarea（任务内容），取可见且非占位的
      const tas = Array.from(document.querySelectorAll('textarea'))
        .filter(el => el.offsetParent !== null);
      for (const ta of tas) {
        const ph = ta.getAttribute('placeholder') || '';
        // 跳过评论框/占位输入框
        if (/评论|回复|输入标题以新建/.test(ph)) continue;
        const v = (ta.value || '').trim();
        if (v && v.length <= 200) return v;
      }
      // 策略 B：带 title/content 语义 class 的可见元素
      const cand = document.querySelector(
        '[data-role="task-title"], [class*="taskTitle"], [class*="TaskTitle"], [class*="task-content"], [class*="taskContent"]'
      );
      if (cand && cand.offsetParent !== null) {
        const v = (cand.value || cand.textContent || '').trim();
        if (v && v.length <= 200) return v;
      }
      // 策略 C：document.title 形如「标题 - 项目 - Teambition」
      const dt = (document.title || '').trim();
      if (dt) {
        const first = dt.split(/\s[-|·|｜]\s|\s-\s/)[0].trim();
        if (first && !/teambition/i.test(first)) return first;
      }
      return null;
    }, 6000);
  }

  async function runSync(defectId) {
    log('\u25b6 \u5f00\u59cb\u540c\u6b65 TB \u72b6\u6001 (defectId=' + defectId + ')');
    await waitFor(() => !!document.body, 10000);
    await wait(2000); // \u7b49\u9875\u9762\u6e32\u67d3
    // \u5148\u62ff\u6807\u9898\uff08\u63a5\u53e3\u4f18\u5148\uff0cDOM \u5151\u5e95\uff09\uff0c\u4e0e\u72b6\u6001\u8bfb\u53d6\u89e3\u8026
    let tbTitle = await fetchTbTaskTitleByApi();
    if (!tbTitle) tbTitle = await readTbTaskTitle();
    if (tbTitle) log('\u2713 \u8bfb\u53d6\u5230\u6807\u9898:', tbTitle);
    else log('\u26a0 \u672a\u8bfb\u53d6\u5230\u6807\u9898');
    const status = await readTbTaskStatus();
    if (!status) {
      log('⚠ 未读取到状态');
      toast('未读取到 TB 任务状态', false);
      // 状态没读到也把标题回传（释放 loading + 刷新标题）
      const origin = sessionStorage.getItem(SS_ORIGIN) || '*';
      const p0 = { type: 'tcmp_tb_status_synced', defectId: Number(defectId), status: '', title: tbTitle || '', ts: Date.now() };
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(p0, origin);
        }
      } catch {}
      try { localStorage.setItem('tcmp_tb_status_relay', JSON.stringify(p0)); } catch {}
      return;
    }
    log('\u2713 \u8bfb\u53d6\u5230\u72b6\u6001:', status);
    toast('\u2713 \u5df2\u8bfb\u53d6\u72b6\u6001\uff1a' + status + '\uff0c\u56de\u4f20 TCMP');
    const payload = { type: 'tcmp_tb_status_synced', defectId: Number(defectId), status, title: tbTitle || '', ts: Date.now() };
    const origin = sessionStorage.getItem(SS_ORIGIN) || '*';
    try {
      if (window.opener && !window.opener.closed) window.opener.postMessage(payload, origin);
    } catch (e) { log('postMessage err', e); }
    try { localStorage.setItem('tcmp_tb_status_relay', JSON.stringify(payload)); } catch {}
    sessionStorage.removeItem(SS_ORIGIN);
    // 1.5 \u79d2\u540e\u81ea\u52a8\u5173\u95ed\u6807\u7b7e\uff08\u5982\u679c\u662f\u811a\u672c\u6253\u5f00\u7684\uff09
    setTimeout(() => { try { window.close(); } catch {} }, 1500);
  }

  // ============================================================
  let running = false;
  let consumed = false;
  async function tryRun() {
    if (running) return;
    const p = parseParams();
    // \u5206\u652f A\uff1a\u540c\u6b65\u72b6\u6001
    if (p[SYNC_KEY] && !consumed) {
      consumed = true;
      running = true;
      try {
        if (p[ORIGIN_KEY]) sessionStorage.setItem(SS_ORIGIN, p[ORIGIN_KEY]);
        const defectId = p[SYNC_KEY];
        consumeParams();
        await runSync(defectId);
      } finally {
        running = false;
      }
      return;
    }
    // \u5206\u652f B\uff1a\u521b\u5efa\u7f3a\u9677
    const triggered = !!p[TRIGGER_KEY] || sessionStorage.getItem(SS_KEY) === '1';
    if (!triggered) return;
    if (consumed) return;
    consumed = true;
    running = true;
    try {
      sessionStorage.setItem(SS_KEY, '1');
      if (p[ORIGIN_KEY]) sessionStorage.setItem(SS_ORIGIN, p[ORIGIN_KEY]);
      if (p[DID_KEY]) sessionStorage.setItem(SS_DID, p[DID_KEY]);
      if (p[FILL_KEY]) sessionStorage.setItem(SS_FILL, p[FILL_KEY]);
      consumeParams();
      // 等 TB 渲染就绪
      await waitFor(() => !!document.body, 10000);
      await wait(1200);
      const ok = await openCreateModal();
      if (ok) {
        sessionStorage.removeItem(SS_KEY);
        startWatching();
        // 弹窗打开后回填字段（标题/软件版本/备注）
        const rawFill = sessionStorage.getItem(SS_FILL);
        if (rawFill) {
          sessionStorage.removeItem(SS_FILL);
          let fill = null;
          try { fill = JSON.parse(rawFill); } catch (e) { log('解析 fill 失败', e); }
          if (fill) { await wait(600); await fillModalFields(fill); }
        } else {
          log('（未收到 tcmp_fill 回填数据，仅打开弹窗）');
          toast('⚠ 未收到回填数据（请强刷 TCMP 页面重试）', false);
        }
      }
    } finally {
      running = false;
    }
  }

  function init() {
    window.addEventListener('hashchange', tryRun);
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (sessionStorage.getItem(SS_KEY) === '1' && /\/bug\/section\//.test(location.pathname)) {
          consumed = false;
          tryRun();
        }
      }
    }, 800);
    tryRun();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
