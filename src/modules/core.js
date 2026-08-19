'use strict';

module.exports = {
  box(options) {
    return this.blessed.box({
      tags: true,
      mouse: true,
      style: { fg: this.COLORS.text, bg: this.COLORS.panel, border: { fg: this.COLORS.border } },
      border: 'line',
      ...options
    });
  },

  button(options) {
    const { style = {}, ...buttonOptions } = options;
    return this.blessed.button({
      mouse: true,
      keys: false,
      shrink: true,
      padding: { left: 1, right: 1 },
      style: {
        fg: this.COLORS.text,
        bg: this.COLORS.panel,
        focus: { fg: this.COLORS.accent, bold: true },
        hover: { fg: this.COLORS.accent },
        ...style
      },
      ...buttonOptions
    });
  },

  setVisible(element, visible) {
    if (visible) element.show();
    else element.hide();
  },

  sectionCaption(collapsed, text) {
    return `${collapsed ? '▸' : '▾'} ${text}`;
  },

  escapeTags(value) {
    return String(value || '').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  },

  textWidth(value) {
    const text = String(value || '').replace(/\{\/?[^}]+}/g, '');
    let width = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      if (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6)
      ) width += 2;
      else width += 1;
    }
    return width;
  },

  normalizePath(value) {
    if (!value) return '';
    const resolved = this.path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  },

  samePath(left, right) {
    return this.normalizePath(left) === this.normalizePath(right);
  },

  isElementInside(root, element) {
    let current = element;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  },

  isDetachedBranchName(branch) {
    return branch === this.t('detachedHead') || branch === '(detached HEAD)' || branch === '\u0028\u5206\u79bb HEAD\u0029';
  },

  padRightDisplay(value, width) {
    const text = String(value || '');
    return text + ' '.repeat(Math.max(0, width - this.textWidth(text)));
  },

  padCenterDisplay(value, width) {
    const text = String(value || '');
    const padding = Math.max(0, width - this.textWidth(text));
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
  },

  titleFrameLine(title, width) {
    const text = String(title || '');
    const lineWidth = Math.max(2, width - this.textWidth(text) - 2);
    const left = Math.floor(lineWidth / 2);
    const right = lineWidth - left;
    return `┌${'─'.repeat(left)}${text}${'─'.repeat(right)}┐`;
  },

  applyLanguage() {
    this.state.language = this.language;
    this.header.setContent(` {bold}GitUI Mouse{/bold}  {gray-fg}${this.t('appSubtitle')}{/gray-fg}`);
    this.refreshButton.setContent(this.t('refresh'));
    this.actionButton.setContent(this.t('actions'));
    this.exitButton.setContent(this.t('exit'));
    this.languageButton.setContent(this.t('settings'));
    this.detailPanel.setLabel(this.t('detailPanel'));
    this.commitPlaceholder.setContent(this.t('commitPlaceholder'));
    this.updateDetailToggleButton();
    this.reflowLeftPanel();
    this.renderAll();
    if (this.detailDiffView) this.showDetailDiff(this.detailDiffView).catch(error => this.toast(this.t('failed', { label: this.t('defaultAction'), message: error.message }), this.COLORS.red));
    this.screen.render();
  },

  setLanguage(language) {
    if (!['en', 'zh'].includes(language) || this.language === language) return;
    this.closeDropdownMenu();
    this.language = language;
    this.applyLanguage();
  },

  languageMenu(anchor) {
    const mark = language => (this.language === language ? '{green-fg}●{/green-fg}' : ' ');
    this.showMenu(this.t('language'), [
      { label: `${mark('en')} ${this.t('english')}`, action: () => this.setLanguage('en') },
      { label: `${mark('zh')} ${this.t('chinese')}`, action: () => this.setLanguage('zh') }
    ], anchor);
  },

  toast(message, color = this.COLORS.accent) {
    const text = String(message || '');
    const screenWidth = this.screen.width || 80;
    const maxWidth = Math.max(18, screenWidth - 4);
    const bodyLines = this.tooltipLines(text, Math.max(14, maxWidth - 4));
    const title = this.t('notice');
    const bodyWidth = Math.max(...bodyLines.map(line => this.textWidth(line)), this.textWidth(title), 12);
    const width = Math.min(maxWidth, Math.max(18, bodyWidth + 4));
    const innerWidth = width - 4;
    const innerHeight = Math.max(3, bodyLines.length + 2);
    const topPadding = Math.floor((innerHeight - bodyLines.length) / 2);
    const bottomPadding = innerHeight - bodyLines.length - topPadding;
    const emptyBodyLine = `│ ${' '.repeat(innerWidth)} │`;
    const frame = [
      this.titleFrameLine(title, width),
      ...Array(topPadding).fill(emptyBodyLine),
      ...bodyLines.map(line => `│ ${this.padCenterDisplay(line, innerWidth)} │`),
      ...Array(bottomPadding).fill(emptyBodyLine),
      `└${'─'.repeat(width - 2)}┘`
    ];
    const notice = this.blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width,
      height: frame.length,
      tags: true,
      mouse: true,
      content: this.escapeTags(frame.join('\n')),
      style: { fg: color, bg: this.COLORS.panel }
    });
    this.screen.render();
    setTimeout(() => {
      this.destroyElement(notice);
      this.screen.render();
    }, 2000);
  },

  setBusy(value, label = '') {
    this.state.busy = value;
    this.footer.setContent(value ? ` {yellow-fg}${this.escapeTags(this.t('busy', { label }))}{/yellow-fg}` : this.t('footerIdle'));
    this.screen.render();
  },

  reportUnhandledError(error) {
    if (this.reportingUnhandledError) return;
    this.reportingUnhandledError = true;
    try {
      this.clearDetailDiffView();
      const message = error && error.message ? error.message : String(error);
      this.state.busy = false;
      this.footer.setContent(` {red-fg}${this.escapeTags(this.t('operationError', { message }))}{/red-fg}`);
      this.detailPanel.setLabel(this.t('programError'));
      this.detailPanel.setContent(this.escapeTags(error && error.stack ? error.stack : message));
      this.screen.render();
    } catch (renderError) {
      try { this.screen.destroy(); } catch (_) {}
      console.error(renderError && renderError.stack ? renderError.stack : renderError);
    } finally {
      this.reportingUnhandledError = false;
    }
  },

  clearDetailDiffView() {
    this.detailDiffView = null;
    if (this.detailToggleButton) this.detailToggleButton.hide();
  },

  setDetailText(label, content) {
    this.clearDetailDiffView();
    if (label) this.detailPanel.setLabel(label);
    this.detailPanel.setContent(content);
    this.detailPanel.setScroll(0);
  },

  updateDetailToggleButton() {
    if (!this.detailToggleButton) return;
    if (!this.detailDiffView) {
      this.detailToggleButton.hide();
      return;
    }
    this.detailToggleButton.setContent(this.detailDiffExpanded ? this.t('collapse') : this.t('expand'));
    this.detailToggleButton.show();
  },

  async showDetailDiff(context, expanded = this.detailDiffExpanded) {
    if (typeof expanded === 'boolean') this.detailDiffExpanded = expanded;
    const nextContext = { ...context };
    this.detailDiffView = nextContext;
    this.updateDetailToggleButton();
    const args = this.detailDiffExpanded ? nextContext.expandedArgs : nextContext.collapsedArgs;
    const diff = await this.git(args).catch(error => this.t('cannotReadDiff', { message: error.message }));
    const label = typeof nextContext.label === 'function' ? nextContext.label() : nextContext.label;
    this.detailPanel.setLabel(label);
    this.detailPanel.setContent(this.formatDiff(diff || this.t('noTextDiff')));
    this.detailPanel.setScroll(0);
    this.screen.render();
  },

  toggleDetailDiffView() {
    if (!this.detailDiffView) return;
    const context = { ...this.detailDiffView };
    this.detailDiffExpanded = !this.detailDiffExpanded;
    this.runUiAction(() => this.showDetailDiff(context), this.detailDiffExpanded ? this.t('expandDiff') : this.t('collapseDiff'));
  },

  async perform(label, operation, refresh = true, options = {}) {
    if (this.state.busy) return undefined;
    try {
      this.setBusy(true, label);
      const result = await operation();
      if (refresh) await this.refreshRepo();
      if (!options.silentSuccess) this.toast(this.t('completed', { label }), this.COLORS.green);
      return result;
    } catch (error) {
      this.toast(this.t('failed', { label, message: error.message }), this.COLORS.red);
      return undefined;
    } finally {
      this.setBusy(false);
    }
  },

  unregisterTree(element) {
    if (!element || !element.screen) return;
    const removeFrom = list => {
      let index = list.indexOf(element);
      while (index !== -1) {
        list.splice(index, 1);
        index = list.indexOf(element);
      }
    };
    removeFrom(element.screen.clickable || []);
    removeFrom(element.screen.keyable || []);
    [...element.children].forEach(child => this.unregisterTree(child));
  },

  sanitizeTree(element) {
    if (!element || !element.children) return;
    element.children = element.children.filter(child => {
      const keep = child && child.parent === element && !child.detached && !child.destroyed;
      if (!keep) this.unregisterTree(child);
      return keep;
    });
    element.children.forEach(child => this.sanitizeTree(child));
  },

  clearScreenMouseRefs(element) {
    if (!element || !element.screen) return;
    const contains = (root, target) => root === target || root.children.some(child => contains(child, target));
    if (element.screen.hover && contains(element, element.screen.hover)) element.screen.hover = null;
    if (element.screen.mouseDown && contains(element, element.screen.mouseDown)) element.screen.mouseDown = null;
  },

  resetScrollable(element) {
    element.childBase = 0;
    element.childOffset = 0;
    if (element.lpos) delete element.lpos._scrollBottom;
  },

  handleScrollableWheel(data) {
    if (!data || (data.action !== 'wheelup' && data.action !== 'wheeldown')) return;
    if (this.activeDropdownMenu && this.pointInside(this.activeDropdownMenu, data)) return;
    const targets = [this.changeArea, this.historyArea];
    const target = targets.find(element => element && element.visible && this.pointInside(element, data));
    if (!target || typeof target.scroll !== 'function') return;
    const amount = Math.max(1, Math.floor((target.height || 6) / 3));
    target.scroll(data.action === 'wheelup' ? -amount : amount);
    this.screen.render();
  },

  tooltipLines(text, maxWidth, maxLines = 18) {
    const rawLines = String(text || '').split(/\r?\n/);
    const lines = [];
    rawLines.forEach(rawLine => {
      let current = '';
      let currentWidth = 0;
      for (const char of rawLine) {
        const charWidth = this.textWidth(char);
        if (current && currentWidth + charWidth > maxWidth) {
          lines.push(current);
          current = char;
          currentWidth = charWidth;
        } else {
          current += char;
          currentWidth += charWidth;
        }
      }
      lines.push(current);
    });
    if (!lines.length) return [''];
    if (lines.length <= maxLines) return lines;
    return [...lines.slice(0, Math.max(1, maxLines - 1)), '…'];
  },

  hideTooltip(anchor = null) {
    if (anchor && this.activeTooltipAnchor && anchor !== this.activeTooltipAnchor) return;
    if (this.activeTooltip) {
      const tooltip = this.activeTooltip;
      this.activeTooltip = null;
      this.activeTooltipAnchor = null;
      this.destroyElement(tooltip);
      this.screen.render();
      return;
    }
    this.activeTooltipAnchor = null;
  },

  showTooltip(text, anchor) {
    const value = String(text || '').trim();
    if (!value) return;
    if (this.activeDropdownMenu && !this.isElementInside(this.activeDropdownMenu, anchor)) return;
    this.hideTooltip();
    const screenWidth = this.screen.width || 80;
    const screenHeight = this.screen.height || 24;
    const maxContentWidth = Math.max(16, Math.min(72, screenWidth - 6));
    const maxLines = Math.max(4, screenHeight - 4);
    const lines = this.tooltipLines(value, maxContentWidth, maxLines);
    const contentWidth = Math.max(...lines.map(line => this.textWidth(line)), 8);
    const width = Math.min(screenWidth - 2, contentWidth + 4);
    const height = Math.min(screenHeight - 2, lines.length + 2);
    const position = this.anchorPosition(anchor, width, height);
    position.left = Math.min(Math.max(1, screenWidth - width - 1), position.left + 6);
    const tooltip = this.box({
      parent: this.screen,
      top: position.top,
      left: position.left,
      width,
      height,
      tags: true,
      border: 'line',
      style: { fg: this.COLORS.text, bg: '#202838', border: { fg: this.COLORS.border } }
    });
    tooltip.setContent(lines.map(line => ` ${this.escapeTags(line)}`).join('\n'));
    this.activeTooltip = tooltip;
    this.activeTooltipAnchor = anchor;
    this.screen.render();
  },

  bindTooltip(element, textOrFactory, options = {}) {
    if (!element) return;
    const delay = Number(options.delay || 250);
    let timer = null;
    const resolveText = data => (typeof textOrFactory === 'function' ? textOrFactory(data) : textOrFactory);
    let hoverActive = false;
    let requestId = 0;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    element.on('mouseover', data => {
      hoverActive = true;
      clearTimer();
      timer = setTimeout(async () => {
        timer = null;
        if (!element.parent || element.detached || element.destroyed) return;
        const currentRequestId = ++requestId;
        const text = await Promise.resolve(resolveText(data)).catch(error => this.t('cannotReadTooltip', { message: error.message }));
        if (!hoverActive || currentRequestId !== requestId || !element.parent || element.detached || element.destroyed) return;
        this.showTooltip(text, element);
      }, delay);
    });
    element.on('mouseout', () => {
      hoverActive = false;
      requestId += 1;
      clearTimer();
      this.hideTooltip(element);
    });
    element.on('press', () => {
      hoverActive = false;
      requestId += 1;
      clearTimer();
      this.hideTooltip(element);
    });
    element.on('click', () => {
      hoverActive = false;
      requestId += 1;
      clearTimer();
      this.hideTooltip(element);
    });
  },

  disposeTree(element) {
    if (!element) return;
    [...element.children].forEach(child => this.disposeTree(child));
    this.unregisterTree(element);
    element.removeAllListeners();
    element.children.length = 0;
    if (element.parent) element.parent.remove(element);
    element.parent = null;
    element.detached = true;
    element.destroyed = true;
  },

  destroyElement(element) {
    if (!element || element.destroyed) return;
    this.clearScreenMouseRefs(element);
    this.disposeTree(element);
  },

  closeDropdownMenu() {
    this.hideTooltip();
    if (this.activeDropdownOutsideHandler) {
      this.screen.removeListener('mouse', this.activeDropdownOutsideHandler);
      this.activeDropdownOutsideHandler = null;
    }
    if (this.activeDropdownMenu) {
      const menu = this.activeDropdownMenu;
      this.activeDropdownMenu = null;
      this.destroyElement(menu);
    }
  },

  clearChildren(element) {
    this.hideTooltip();
    this.clearScreenMouseRefs(element);
    const children = [...element.children];
    element.children.length = 0;
    children.forEach(child => {
      child.parent = null;
      this.disposeTree(child);
    });
    this.resetScrollable(element);
  },

  runUiAction(action, label = this.t('defaultAction')) {
    try {
      const result = action();
      if (result && typeof result.then === 'function') {
        result.catch(error => this.toast(this.t('failed', { label, message: error.message }), this.COLORS.red));
      }
    } catch (error) {
      this.toast(this.t('failed', { label, message: error.message }), this.COLORS.red);
    }
  },

  writeClipboard(text) {
    return new Promise((resolve, reject) => {
      const value = String(text || '');
      const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
      const command = process.platform === 'win32' && this.fs.existsSync(pwsh) ? pwsh : (process.platform === 'win32' ? 'powershell.exe' : 'pbcopy');
      const args = process.platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-Command', '[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); Set-Clipboard -Value ([Console]::In.ReadToEnd())']
        : [];
      const child = this.spawn(command, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error((stderr || this.t('clipboardExitCode', { code })).trim()));
      });
      child.stdin.end(value, 'utf8');
    });
  },

  anchorPosition(anchor, width, height) {
    const fallback = { top: 2, left: Math.max(1, this.screen.width - width - 2) };
    if (!anchor || !anchor.parent) return fallback;
    let pos = null;
    try {
      pos = anchor.lpos || (typeof anchor._getCoords === 'function' ? anchor._getCoords() : null);
    } catch (_) {
      pos = null;
    }
    if (!pos) return fallback;
    const maxLeft = Math.max(1, this.screen.width - width - 1);
    const left = Math.min(maxLeft, Math.max(1, pos.xi));
    const below = pos.yl;
    const above = pos.yi - height;
    const top = below + height < this.screen.height ? below : Math.max(1, above);
    return { top, left };
  },

  mouseAnchor(data) {
    if (!data || data.x == null || data.y == null) return null;
    return {
      parent: this.screen,
      lpos: { xi: data.x, xl: data.x + 1, yi: data.y, yl: data.y + 1 }
    };
  },

  pointInside(element, data) {
    let pos = null;
    try {
      pos = element && (element.lpos || (typeof element._getCoords === 'function' ? element._getCoords() : null));
    } catch (_) {
      pos = null;
    }
    if (!pos || data.x == null || data.y == null) return false;
    return data.x >= pos.xi && data.x < pos.xl && data.y >= pos.yi && data.y < pos.yl;
  },

  confirm(title, text, onConfirm) {
    const lines = String(text || '').split(/\r?\n/);
    const contentHeight = Math.min(12, Math.max(1, lines.length));
    const contentWidth = Math.max(...lines.map(line => this.textWidth(line)), this.textWidth(title), 12);
    const width = Math.min(Math.max(34, contentWidth + 6), Math.max(34, this.screen.width - 4));
    const height = Math.min(contentHeight + 5, Math.max(7, this.screen.height - 2));
    const modal = this.box({ parent: this.screen, top: 'center', left: 'center', width, height, label: ` ${title} `, style: { fg: this.COLORS.text, bg: '#182235', border: { fg: this.COLORS.yellow } } });
    this.blessed.box({ parent: modal, top: 1, left: 2, right: 2, bottom: 3, scrollable: true, alwaysScroll: true, tags: true, content: this.escapeTags(text), style: { fg: this.COLORS.text, bg: '#182235' }, scrollbar: { ch: ' ', style: { bg: this.COLORS.accent } } });
    const yes = this.button({ parent: modal, bottom: 1, left: Math.max(2, Math.floor(width * 0.25) - 4), width: Math.max(8, this.textWidth(this.t('confirm')) + 2), content: this.t('confirm'), align: 'center' });
    const no = this.button({ parent: modal, bottom: 1, right: Math.max(2, Math.floor(width * 0.25) - 4), width: Math.max(8, this.textWidth(this.t('cancel')) + 2), content: this.t('cancel'), align: 'center' });
    yes.on('press', () => { this.destroyElement(modal); this.runUiAction(onConfirm, title); this.screen.render(); });
    no.on('press', () => { this.destroyElement(modal); this.screen.render(); });
    this.screen.render();
  },

  textDialog(title, placeholder, submit) {
    this.inputDialog(title, placeholder, submit);
  },

  inputDialog(title, placeholder, submit) {
    const modal = this.box({ parent: this.screen, top: 'center', left: 'center', width: 78, height: 8, label: ` ${title} `, style: { fg: this.COLORS.text, bg: '#182235', border: { fg: this.COLORS.accent } } });
    const input = this.blessed.textbox({
      parent: modal,
      top: 1,
      left: 2,
      right: 2,
      height: 3,
      mouse: true,
      inputOnFocus: true,
      keys: true,
      value: '',
      border: 'line',
      style: { fg: this.COLORS.text, bg: '#101722', border: { fg: this.COLORS.border }, focus: { border: { fg: this.COLORS.accent } } }
    });
    const hint = this.blessed.box({ parent: modal, top: 4, left: 2, right: 2, height: 1, content: this.escapeTags(placeholder), style: { fg: this.COLORS.dim, bg: '#182235' } });
    const cancel = this.button({ parent: modal, bottom: 1, left: 2, width: Math.max(11, this.textWidth(this.t('cancel')) + 2), content: this.t('cancel') });
    const ok = this.button({ parent: modal, bottom: 1, right: 2, width: Math.max(14, this.textWidth(this.t('confirm')) + 2), content: this.t('confirm') });
    const finish = () => {
      const value = input.getValue().trim();
      if (!value) { this.toast(this.t('enterContent'), this.COLORS.yellow); return; }
      if (input._reading && typeof input._done === 'function') input._done('stop');
      this.destroyElement(modal);
      this.runUiAction(() => submit(value), title);
      this.screen.render();
    };
    hint.on('click', () => { input.focus(); input.readInput(); this.screen.render(); });
    input.on('submit', finish);
    cancel.on('press', () => {
      if (input._reading && typeof input._done === 'function') input._done('stop');
      this.destroyElement(modal);
      this.screen.render();
    });
    ok.on('press', finish);
    input.focus();
    input.readInput();
    this.screen.render();
  },

  showMenu(title, entries, anchor) {
    this.closeDropdownMenu();
    const visibleEntries = entries.slice(0, 24);
    const entryWidth = entry => this.textWidth(entry.label || '') + (entry.type === 'localBranch' || entry.type === 'remoteBranch' ? 12 : 4);
    const width = Math.min(64, Math.max(18, this.textWidth(title) + 6, ...visibleEntries.map(entryWidth)));
    const height = Math.max(3, visibleEntries.length + 2);
    const position = this.anchorPosition(anchor, width, height);
    const modal = this.box({
      parent: this.screen,
      top: position.top,
      left: position.left,
      width,
      height,
      label: ` ${title} `,
      style: { fg: this.COLORS.text, bg: this.COLORS.panel, border: { fg: this.COLORS.accent } }
    });
    this.activeDropdownMenu = modal;
    visibleEntries.forEach((entry, index) => {
      if (entry.type === 'separator') {
        this.blessed.box({
          parent: modal,
          top: index + 1,
          left: 1,
          right: 1,
          height: 1,
          content: '─'.repeat(Math.max(1, width - 4)),
          style: { fg: this.COLORS.border, bg: this.COLORS.panel }
        });
        return;
      }
      if (entry.type === 'header') {
        this.blessed.box({
          parent: modal,
          top: index + 1,
          left: 1,
          right: 1,
          height: 1,
          tags: true,
          content: `{cyan-fg}${this.escapeTags(entry.label)}{/cyan-fg}`,
          style: { fg: this.COLORS.accent, bg: this.COLORS.panel, bold: true }
        });
        return;
      }
      if (entry.type === 'localBranch' || entry.type === 'remoteBranch') {
        const item = this.button({
          parent: modal,
          top: index + 1,
          left: 1,
          right: 7,
          height: 1,
          shrink: false,
          tags: true,
          padding: { left: 1, right: 1 },
          content: entry.label,
          style: {
            fg: this.COLORS.text,
            bg: this.COLORS.panel,
            hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt },
            focus: { fg: this.COLORS.text, bg: this.COLORS.panelAlt }
          }
        });
        item.on('press', () => {
          const itemAnchor = { lpos: item.lpos, parent: this.screen };
          this.closeDropdownMenu();
          this.runUiAction(() => entry.action(itemAnchor), title);
          this.screen.render();
        });
        const mergeButton = this.button({
          parent: modal,
          top: index + 1,
          right: 4,
          width: 3,
          height: 1,
          shrink: false,
          content: '+',
          style: this.iconStyle
        });
        const deleteButton = this.button({
          parent: modal,
          top: index + 1,
          right: 1,
          width: 3,
          height: 1,
          shrink: false,
          content: 'x',
          style: this.iconStyle
        });
        this.bindTooltip(mergeButton, entry.mergeTooltip);
        this.bindTooltip(deleteButton, entry.deleteTooltip);
        mergeButton.on('press', () => {
          this.closeDropdownMenu();
          this.runUiAction(entry.mergeAction, title);
          this.screen.render();
        });
        deleteButton.on('press', () => {
          this.closeDropdownMenu();
          this.runUiAction(entry.deleteAction, title);
          this.screen.render();
        });
        return;
      }
      const item = this.button({
        parent: modal,
        top: index + 1,
        left: 1,
        right: 1,
        height: 1,
        shrink: false,
        tags: true,
        padding: { left: 1, right: 1 },
        content: entry.label,
        style: {
          fg: this.COLORS.text,
          bg: this.COLORS.panel,
          hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt },
          focus: { fg: this.COLORS.text, bg: this.COLORS.panelAlt }
        }
      });
      item.on('press', () => {
        const itemAnchor = { lpos: item.lpos, parent: this.screen };
        this.closeDropdownMenu();
        this.runUiAction(() => entry.action(itemAnchor), title);
        this.screen.render();
      });
    });
    this.activeDropdownOutsideHandler = data => {
      if (!data || data.action === 'mousemove' || this.pointInside(modal, data)) return;
      this.closeDropdownMenu();
      this.screen.render();
    };
    setImmediate(() => this.screen.on('mouse', this.activeDropdownOutsideHandler));
    this.screen.render();
  },

  diffLineNumberPrefix(oldLine, newLine) {
    const oldText = oldLine == null ? ' '.repeat(5) : String(oldLine).padStart(5);
    const newText = newLine == null ? ' '.repeat(5) : String(newLine).padStart(5);
    return `{gray-fg}${oldText} ${newText} │{/gray-fg} `;
  },

  diffBodyWidth() {
    const fallback = Math.max(24, Math.floor((this.screen.width || 100) * 0.58) - 18);
    const pos = this.detailPanel && this.detailPanel.lpos;
    if (!pos) return fallback;
    return Math.max(16, pos.xl - pos.xi - 18);
  },

  splitDisplayLine(line, maxWidth) {
    const text = String(line || '');
    if (!text) return [''];
    const parts = [];
    let current = '';
    let width = 0;
    for (const char of text) {
      const charWidth = this.textWidth(char);
      if (current && width + charWidth > maxWidth) {
        parts.push(current);
        current = '';
        width = 0;
      }
      current += char;
      width += charWidth;
    }
    parts.push(current);
    return parts;
  },

  diffLineKind(line) {
    if (/^@@/.test(line)) return 'hunk';
    if (/^\+\+\+|^---/.test(line)) return 'file';
    if (/^\+/.test(line)) return 'add';
    if (/^-/.test(line)) return 'delete';
    if (/^diff |^index |^commit |^new file |^deleted file |^similarity |^rename |^Binary files /.test(line)) return 'meta';
    if (/^\\ No newline at end of file/.test(line)) return 'dim';
    return 'text';
  },

  colorizeDiffLine(line, forcedKind = null) {
    const kind = forcedKind || this.diffLineKind(line);
    const safe = this.escapeTags(line);
    if (kind === 'hunk') return `{cyan-fg}${safe}{/cyan-fg}`;
    if (kind === 'file') return `{bold}${safe}{/bold}`;
    if (kind === 'add') return `{green-fg}${safe}{/green-fg}`;
    if (kind === 'delete') return `{red-fg}${safe}{/red-fg}`;
    if (kind === 'meta') return `{yellow-fg}${safe}{/yellow-fg}`;
    if (kind === 'dim') return `{gray-fg}${safe}{/gray-fg}`;
    return safe;
  },

  formatDiffDisplayLine(line, oldLine, newLine, forcedKind = null) {
    const kind = forcedKind || this.diffLineKind(line);
    return this.splitDisplayLine(line, this.diffBodyWidth()).map((part, index) => {
      const prefix = index === 0
        ? this.diffLineNumberPrefix(oldLine, newLine)
        : this.diffLineNumberPrefix(null, null);
      return `${prefix}${this.colorizeDiffLine(part, kind)}`;
    }).join('\n');
  },

  formatDiff(content) {
    const lines = String(content || '').split(/\r?\n/);
    const hasHunk = lines.some(line => /^@@\s/.test(line));
    if (!hasHunk) return lines.map(line => this.colorizeDiffLine(line)).join('\n');

    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;
    return lines.map((line, index) => {
      const hunk = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        inHunk = true;
        return this.formatDiffDisplayLine(line, null, null, 'hunk');
      }
      if (index === lines.length - 1 && line === '') {
        return '';
      }
      if (!inHunk || /^diff |^index |^commit |^new file |^deleted file |^similarity |^rename |^Binary files |^\+\+\+|^---/.test(line)) {
        return this.formatDiffDisplayLine(line, null, null);
      }
      if (/^\\ No newline at end of file/.test(line)) {
        return this.formatDiffDisplayLine(line, null, null, 'dim');
      }
      if (/^\+/.test(line)) {
        return this.formatDiffDisplayLine(line, null, newLine++, 'add');
      }
      if (/^-/.test(line)) {
        return this.formatDiffDisplayLine(line, oldLine++, null, 'delete');
      }
      const contentLine = line.startsWith(' ') ? line : ` ${line}`;
      return this.formatDiffDisplayLine(contentLine, oldLine++, newLine++, 'text');
    }).join('\n');
  }
};
