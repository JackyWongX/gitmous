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
    const usesThemeColor = !Object.prototype.hasOwnProperty.call(style, 'fg') || style.fg === this.COLORS.accent;
    const button = this.blessed.button({
      mouse: true,
      keys: false,
      shrink: true,
      padding: { left: 1, right: 1 },
      style: {
        fg: this.COLORS.accent,
        bg: this.COLORS.panel,
        focus: { fg: this.COLORS.accent, bold: true },
        hover: { fg: this.COLORS.accent },
        ...style
      },
      ...buttonOptions
    });
    button.__themeButton = usesThemeColor;
    return button;
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
    const text = String(value || '')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\{\/?[^}]+}/g, '');
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

  normalizeColorValue(value) {
    const text = String(value || '').trim();
    const hex = text.match(/^#?([0-9a-f]{6})$/i);
    if (hex) return `#${hex[1].toLowerCase()}`;
    const rgb = text.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (!rgb) return '';
    const values = rgb.slice(1).map(Number);
    if (values.some(item => item < 0 || item > 255)) return '';
    return `#${values.map(item => item.toString(16).padStart(2, '0')).join('')}`;
  },

  persistUserSettings() {
    if (typeof this.saveSettings !== 'function') return;
    try {
      this.saveSettings({
        language: this.language,
        themeColor: this.COLORS.accent,
        detailDiffExpanded: this.detailDiffExpanded
      });
    } catch (error) {
      this.toast(this.t('settingsSaveFailed', { message: error.message }), this.COLORS.red);
    }
  },

  setElementAccent(element) {
    if (!element) return;
    if (element.style) {
      if (element.__themeButton) {
        element.style.fg = this.COLORS.accent;
        if (element.style.hover) element.style.hover.fg = this.COLORS.accent;
        if (element.style.focus) element.style.focus.fg = this.COLORS.accent;
      }
      if (element.style.border && element.__themeAccentBorder) element.style.border.fg = this.COLORS.accent;
    }
    if (element.scrollbar && element.scrollbar.style) element.scrollbar.style.bg = this.COLORS.accent;
    if (element.children) element.children.forEach(child => this.setElementAccent(child));
  },

  themeRgb() {
    const color = this.normalizeColorValue(this.COLORS.accent) || '#58b6e8';
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16)
    ];
  },

  accentText(value) {
    const [red, green, blue] = this.themeRgb();
    return `\x1b[38;2;${red};${green};${blue}m${this.escapeTags(value)}\x1b[39m`;
  },

  applyThemeColor() {
    this.iconStyle.fg = this.COLORS.accent;
    this.setElementAccent(this.screen);
    this.renderAll();
    this.screen.render();
  },

  setThemeColor(value) {
    const color = this.normalizeColorValue(value);
    if (!color) {
      this.toast(this.t('invalidThemeColor'), this.COLORS.red);
      return;
    }
    this.COLORS.accent = color;
    this.persistUserSettings();
    this.applyThemeColor();
    this.toast(this.t('themeColorChanged', { color }), this.COLORS.accent);
  },

  openThemeColorDialog() {
    this.inputDialog(this.t('setThemeColor'), this.t('themeColorPlaceholder'), value => this.setThemeColor(value));
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
    this.updateDetailConflictButtons();
    this.reflowLeftPanel();
    this.renderAll();
    if (this.detailDiffView) this.showDetailDiff(this.detailDiffView).catch(error => this.toast(this.t('failed', { label: this.t('defaultAction'), message: error.message }), this.COLORS.red));
    this.screen.render();
  },

  setLanguage(language) {
    if (!['en', 'zh'].includes(language) || this.language === language) return;
    this.closeDropdownMenu();
    this.language = language;
    this.persistUserSettings();
    this.applyLanguage();
  },

  languageMenu(anchor) {
    const mark = language => (this.language === language ? '{green-fg}●{/green-fg}' : ' ');
    this.showMenu(this.t('settingsTitle'), [
      { type: 'header', label: this.t('language') },
      { label: `${mark('en')} ${this.t('english')}`, action: () => this.setLanguage('en') },
      { label: `${mark('zh')} ${this.t('chinese')}`, action: () => this.setLanguage('zh') },
      { type: 'separator', label: '' },
      { label: this.t('setThemeColor'), action: () => this.openThemeColorDialog() }
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

  progressBarFrame(label) {
    const screenWidth = this.screen.width || 80;
    const labelWidth = this.textWidth(label);
    const maxWidth = Math.max(20, screenWidth - 4);
    const width = Math.min(maxWidth, Math.max(28, labelWidth + 8));
    return { width, barWidth: Math.max(10, width - 4) };
  },

  showProgressBar(label) {
    this.hideProgressBar();
    const frame = this.progressBarFrame(label);
    const panelBg = this.COLORS.panel || '#101820';
    const root = this.blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: frame.width,
      height: 5,
      tags: true,
      mouse: true,
      border: 'line',
      style: { fg: this.COLORS.text, bg: panelBg, border: { fg: this.COLORS.accent } }
    });
    this.blessed.box({
      parent: root,
      top: 1,
      left: 2,
      right: 2,
      height: 1,
      tags: true,
      content: `{yellow-fg}${this.escapeTags(label)}{/yellow-fg}`,
      style: { fg: this.COLORS.text, bg: panelBg }
    });
    const track = this.blessed.box({
      parent: root,
      top: 3,
      left: 2,
      width: frame.barWidth,
      height: 1,
      content: ' '.repeat(frame.barWidth),
      style: { bg: this.COLORS.panelAlt }
    });
    const fillWidth = Math.max(6, Math.min(14, Math.floor(frame.barWidth / 3)));
    const fill = this.blessed.box({
      parent: track,
      top: 0,
      left: 0,
      width: fillWidth,
      height: 1,
      content: ' '.repeat(fillWidth),
      style: { bg: this.COLORS.accent }
    });
    const progress = { root, track, fill, tick: 0, maxLeft: Math.max(0, frame.barWidth - fillWidth), timer: null, startedAt: Date.now() };
    const render = () => {
      this.bringProgressBarToFront();
      const period = Math.max(1, progress.maxLeft * 2);
      const phase = progress.tick % period;
      const left = phase <= progress.maxLeft ? phase : period - phase;
      progress.fill.left = left;
      progress.tick += 1;
      this.screen.render();
    };
    progress.timer = setInterval(render, 120);
    this.activeProgressBar = progress;
    this.bringProgressBarToFront();
    render();
  },

  bringProgressBarToFront() {
    const progress = this.activeProgressBar;
    if (progress && progress.root && typeof progress.root.setFront === 'function') progress.root.setFront();
  },

  async waitForUiRender() {
    await new Promise(resolve => setImmediate(resolve));
  },

  hideProgressBar() {
    const progress = this.activeProgressBar;
    this.activeProgressBar = null;
    if (!progress) return;
    if (progress.timer) clearInterval(progress.timer);
    this.destroyElement(progress.root);
    this.screen.render();
  },

  async hideProgressBarAfterMinimum(minimumMs = 0) {
    const progress = this.activeProgressBar;
    if (!progress) return;
    const elapsed = Date.now() - (progress.startedAt || Date.now());
    const remaining = Math.max(0, minimumMs - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    if (this.activeProgressBar === progress) this.hideProgressBar();
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
    this.detailDiffLineMeta = [];
    this.detailDiffRaw = '';
    this.clearConflictDiffToolbars();
    this.hideDiffLineToolbar();
    if (this.detailToggleButton) this.detailToggleButton.hide();
    this.updateDetailConflictButtons();
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

  updateDetailConflictButtons() {
    const buttons = [
      this.detailAbortMergeButton,
      this.detailOursButton,
      this.detailTheirsButton,
      this.detailResolvedButton
    ].filter(Boolean);
    const file = this.detailDiffView && this.detailDiffView.file;
    const visible = Boolean(
      this.detailDiffView &&
      this.detailDiffView.conflicted &&
      file &&
      this.state.status.conflicted.some(item => item.file === file)
    );
    buttons.forEach(button => {
      if (visible) button.show();
      else button.hide();
    });
  },

  async showDetailDiff(context, expanded = this.detailDiffExpanded) {
    if (typeof expanded === 'boolean') this.detailDiffExpanded = expanded;
    const nextContext = { ...context };
    this.detailDiffView = nextContext;
    this.updateDetailToggleButton();
    this.updateDetailConflictButtons();
    const args = this.detailDiffExpanded ? nextContext.expandedArgs : nextContext.collapsedArgs;
    const diff = await this.git(args).catch(error => this.t('cannotReadDiff', { message: error.message }));
    const label = typeof nextContext.label === 'function' ? nextContext.label() : nextContext.label;
    this.hideDiffLineToolbar();
    this.clearConflictDiffToolbars();
    this.detailDiffRaw = diff || '';
    this.detailPanel.setLabel(label);
    this.detailPanel.setContent(this.formatDiff(diff || this.t('noTextDiff')));
    this.renderConflictDiffToolbars();
    const firstConflictToolbar = nextContext.conflicted
      ? this.detailDiffConflictToolbarRows[0]
      : null;
    // 解决冲突后刷新时，自动跳到第一个剩余冲突块。
    this.detailPanel.setScroll(firstConflictToolbar ? Math.max(0, firstConflictToolbar.displayLine - 1) : 0);
    this.screen.render();
  },

  toggleDetailDiffView() {
    if (!this.detailDiffView) return;
    const context = { ...this.detailDiffView };
    this.detailDiffExpanded = !this.detailDiffExpanded;
    this.persistUserSettings();
    this.runUiAction(() => this.showDetailDiff(context), this.detailDiffExpanded ? this.t('expandDiff') : this.t('collapseDiff'));
  },

  async perform(label, operation, refresh = true, options = {}) {
    if (this.state.busy) return undefined;
    try {
      this.setBusy(true, label);
      if (options.progress) {
        this.showProgressBar(label);
        await this.waitForUiRender();
      }
      const result = await operation();
      if (refresh) await this.refreshRepo();
      if (!options.silentSuccess) this.toast(this.t('completed', { label }), this.COLORS.green);
      return result;
    } catch (error) {
      this.toast(this.t('failed', { label, message: error.message }), this.COLORS.red);
      return undefined;
    } finally {
      if (options.progress) await this.hideProgressBarAfterMinimum(options.progressMinimumMs || 700);
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
    const targets = [this.changeArea, this.historyArea, this.detailPanel];
    const target = targets.find(element => element && element.visible && this.pointInside(element, data));
    if (!target || typeof target.scroll !== 'function') return;
    const amount = Math.max(1, Math.floor((target.height || 6) / 3));
    target.scroll(data.action === 'wheelup' ? -amount : amount);
    if (target === this.detailPanel) this.hideDiffLineToolbar();
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

  hideDiffLineToolbar() {
    if (!this.activeDiffLineToolbar) return;
    const toolbar = this.activeDiffLineToolbar;
    this.activeDiffLineToolbar = null;
    this.destroyElement(toolbar.root);
    this.screen.render();
  },

  clearConflictDiffToolbars() {
    const toolbars = this.detailDiffConflictToolbars || [];
    this.detailDiffConflictToolbars = [];
    toolbars.forEach(toolbar => this.destroyElement(toolbar.root));
  },

  renderConflictDiffToolbars() {
    // 冲突块工具栏直接渲染在 diff 文本中，避免滚动内容里的子控件定位漂移。
  },

  detailContentColumnFromMouse(data) {
    if (!this.detailPanel || !this.detailPanel.visible || !this.pointInside(this.detailPanel, data)) return -1;
    let pos = null;
    try {
      pos = this.detailPanel.lpos || (typeof this.detailPanel._getCoords === 'function' ? this.detailPanel._getCoords() : null);
    } catch (_) {
      pos = null;
    }
    if (!pos || data.x <= pos.xi || data.x >= pos.xl - 1) return -1;
    return data.x - pos.xi - 1;
  },

  conflictToolbarTargetFromMouse(data) {
    if (!this.detailDiffView || !this.detailDiffView.conflicted) return null;
    const lineIndex = this.detailContentLineFromMouse(data);
    const column = this.detailContentColumnFromMouse(data);
    if (lineIndex < 0 || column < 0) return null;
    const row = (this.detailDiffConflictToolbarRows || []).find(item => item.displayLine === lineIndex);
    if (!row || !Array.isArray(row.buttons)) return null;
    const button = row.buttons.find(item => column >= item.left && column < item.left + item.width);
    return button ? { row, side: button.side } : null;
  },

  handleDetailConflictToolbarMouse(data) {
    if (!data || data.action !== 'mousedown') return;
    const target = this.conflictToolbarTargetFromMouse(data);
    if (!target) return;
    this.hideDiffLineToolbar();
    this.resolveConflictBlockWithConfirm(target.row.line, target.side);
  },

  detailContentLineFromMouse(data) {
    if (!this.detailPanel || !this.detailPanel.visible || !this.pointInside(this.detailPanel, data)) return -1;
    let pos = null;
    try {
      pos = this.detailPanel.lpos || (typeof this.detailPanel._getCoords === 'function' ? this.detailPanel._getCoords() : null);
    } catch (_) {
      pos = null;
    }
    if (!pos || data.y <= pos.yi || data.y >= pos.yl - 1) return -1;
    return (this.detailPanel.childBase || 0) + data.y - pos.yi - 1;
  },

  handleDetailDiffHover(data) {
    if (!data || data.action !== 'mousemove') return;
    if (this.activeDiffLineToolbar && this.pointInside(this.activeDiffLineToolbar.root, data)) return;
    if (this.detailDiffView && this.detailDiffView.conflicted) {
      this.hideDiffLineToolbar();
      return;
    }
    const lineIndex = this.detailContentLineFromMouse(data);
    const meta = lineIndex >= 0 && this.detailDiffLineMeta ? this.detailDiffLineMeta[lineIndex] : null;
    const hasFile = Boolean(this.detailDiffView && this.detailDiffView.file);
    const hunkAction = Boolean(
      hasFile &&
      !this.detailDiffView.conflicted &&
      !this.detailDiffView.staged &&
      meta &&
      meta.actionable &&
      (meta.kind === 'add' || meta.kind === 'delete')
    );
    if (!hunkAction) {
      this.hideDiffLineToolbar();
      return;
    }
    this.showDiffLineToolbar(data, meta);
  },

  showDiffLineToolbar(data, meta) {
    const regionKey = meta.actionRegionKey || `line:${meta.displayLine}`;
    if (
      this.activeDiffLineToolbar &&
      this.activeDiffLineToolbar.regionKey === regionKey &&
      this.activeDiffLineToolbar.file === this.detailDiffView.file
    ) return;
    this.hideDiffLineToolbar();
    let pos = null;
    try {
      pos = this.detailPanel.lpos || (typeof this.detailPanel._getCoords === 'function' ? this.detailPanel._getCoords() : null);
    } catch (_) {
      pos = null;
    }
    const left = pos ? Math.max(pos.xi + 2, pos.xl - 8) : Math.max(1, (this.screen.width || 80) - 10);
    const root = this.blessed.box({
      parent: this.screen,
      top: data.y,
      left,
      width: 7,
      height: 1,
      mouse: true,
      tags: true,
      style: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt }
    });
    const acceptButton = this.button({ parent: root, top: 0, left: 0, width: 3, height: 1, shrink: false, content: '+', align: 'center', style: this.iconStyle });
    const discardButton = this.button({ parent: root, top: 0, right: 0, width: 3, height: 1, shrink: false, content: '-', align: 'center', style: this.iconStyle });
    this.bindTooltip(acceptButton, () => this.t(this.detailDiffView && this.detailDiffView.conflicted ? 'acceptCurrentChangeTooltip' : 'stageDiffHunkTooltip'));
    this.bindTooltip(discardButton, () => this.t(this.detailDiffView && this.detailDiffView.conflicted ? 'discardCurrentChangeTooltip' : 'discardDiffHunkTooltip'));
    acceptButton.on('press', () => this.acceptCurrentDiffChange(meta));
    discardButton.on('press', () => this.discardCurrentDiffChange(meta));
    this.activeDiffLineToolbar = { root, lineIndex: meta.displayLine, regionKey, file: this.detailDiffView.file };
    this.screen.render();
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
    modal.__themeAccentBorder = true;
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
          content: this.accentText(entry.label),
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
          fg: this.COLORS.accent,
          bg: this.COLORS.panel,
          hover: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt },
          focus: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt }
        }
      });
      item.__themeButton = true;
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
    if (kind === 'hunk') return this.accentText(line);
    if (kind === 'file') return `{bold}${safe}{/bold}`;
    if (kind === 'add') return `{green-fg}${safe}{/green-fg}`;
    if (kind === 'delete') return `{red-fg}${safe}{/red-fg}`;
    if (kind === 'conflict') return `{red-fg}${safe}{/red-fg}`;
    if (kind === 'meta') return `{yellow-fg}${safe}{/yellow-fg}`;
    if (kind === 'dim') return `{gray-fg}${safe}{/gray-fg}`;
    return safe;
  },

  ansiStyleText(value, style = {}) {
    const codes = [];
    if (style.bold) codes.push('1');
    const fg = this.normalizeColorValue(style.fg);
    const bg = this.normalizeColorValue(style.bg);
    if (fg) codes.push(`38;2;${parseInt(fg.slice(1, 3), 16)};${parseInt(fg.slice(3, 5), 16)};${parseInt(fg.slice(5, 7), 16)}`);
    if (bg) codes.push(`48;2;${parseInt(bg.slice(1, 3), 16)};${parseInt(bg.slice(3, 5), 16)};${parseInt(bg.slice(5, 7), 16)}`);
    const prefix = codes.length ? `\x1b[${codes.join(';')}m` : '';
    return `${prefix}${this.escapeTags(value)}\x1b[22;39;49m`;
  },

  conflictToolbarLine() {
    const prefix = this.diffLineNumberPrefix(null, null);
    const currentLabel = ` ${this.t('acceptOurs')} `;
    const incomingLabel = ` ${this.t('acceptTheirs')} `;
    const buttonStyle = { fg: '#ffffff', bg: '#0b6f9f', bold: true };
    const rowStyle = { bg: '#12384a' };
    const currentWidth = this.textWidth(currentLabel);
    const gapWidth = 2;
    const incomingWidth = this.textWidth(incomingLabel);
    const bodyWidth = Math.max(0, this.diffBodyWidth());
    const usedWidth = currentWidth + gapWidth + incomingWidth;
    const tailWidth = Math.max(0, bodyWidth - usedWidth);
    const body = [
      this.ansiStyleText(currentLabel, buttonStyle),
      this.ansiStyleText(' '.repeat(gapWidth), rowStyle),
      this.ansiStyleText(incomingLabel, buttonStyle),
      this.ansiStyleText(' '.repeat(tailWidth), rowStyle)
    ].join('');
    const buttonLeft = this.textWidth(prefix);
    return {
      content: `${prefix}${body}`,
      buttons: [
        { side: 'ours', left: buttonLeft, width: currentWidth },
        { side: 'theirs', left: buttonLeft + currentWidth + gapWidth, width: incomingWidth }
      ]
    };
  },

  conflictLineKind(line) {
    if (/^[ +\-]*<{7}/.test(line)) return 'conflict';
    if (/^[ +\-]*\|{7}/.test(line)) return 'conflict';
    if (/^[ +\-]*={7}/.test(line)) return 'conflict';
    if (/^[ +\-]*>{7}/.test(line)) return 'conflict';
    return null;
  },

  diffHunkInfo(line) {
    const normal = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (normal) return { combined: false, oldLine: Number(normal[1]), newLine: Number(normal[2]) };
    const combined = line.match(/^@@@\s+-(\d+)(?:,\d+)?(?:\s+-\d+(?:,\d+)?)*\s+\+(\d+)(?:,\d+)?\s+@@@/);
    if (combined) return { combined: true, oldLine: Number(combined[1]), newLine: Number(combined[2]) };
    return null;
  },

  isConflictStartLine(line) {
    return /^[ +\-]*<{7}/.test(String(line || ''));
  },

  isConflictEndLine(line) {
    return /^[ +\-]*>{7}/.test(String(line || ''));
  },

  conflictRegionKey(lines, rawIndex) {
    let start = -1;
    for (let index = rawIndex; index >= 0; index -= 1) {
      if (this.isConflictStartLine(lines[index])) {
        start = index;
        break;
      }
      if (index !== rawIndex && this.isConflictEndLine(lines[index])) break;
    }
    if (start < 0) return '';
    let end = -1;
    for (let index = rawIndex; index < lines.length; index += 1) {
      if (this.isConflictEndLine(lines[index])) {
        end = index;
        break;
      }
      if (index !== rawIndex && this.isConflictStartLine(lines[index])) break;
    }
    return end >= start ? `conflict:${start}:${end}` : '';
  },

  hunkRegionKey(lines, rawIndex) {
    for (let index = rawIndex; index >= 0; index -= 1) {
      if (/^@@@?\s/.test(lines[index])) return `hunk:${index}`;
      if (/^diff --git /.test(lines[index])) break;
    }
    return '';
  },

  assignDiffActionRegions(lines, meta) {
    meta.forEach(item => {
      if (!item.actionable || !Number.isInteger(item.rawIndex)) return;
      item.actionRegionKey = this.conflictRegionKey(lines, item.rawIndex)
        || this.hunkRegionKey(lines, item.rawIndex)
        || `line:${item.displayLine}`;
    });
  },

  isActionableDiffKind(kind) {
    return ['add', 'delete', 'conflict'].includes(kind);
  },

  formatDiffDisplayLine(line, oldLine, newLine, forcedKind = null, meta = [], rawIndex = null) {
    const kind = forcedKind || this.diffLineKind(line);
    const displayKind = this.conflictLineKind(line) || kind;
    return this.splitDisplayLine(line, this.diffBodyWidth()).map((part, index) => {
      const prefix = index === 0
        ? this.diffLineNumberPrefix(oldLine, newLine)
        : this.diffLineNumberPrefix(null, null);
      meta.push({
        displayLine: meta.length,
        rawLine: line,
        rawIndex,
        kind: displayKind,
        oldLine,
        newLine,
        actionable: index === 0 && this.isActionableDiffKind(displayKind) && (oldLine != null || newLine != null)
      });
      return `${prefix}${this.colorizeDiffLine(part, displayKind)}`;
    }).join('\n');
  },

  formatDiff(content) {
    const result = this.formatDiffWithMeta(content);
    this.detailDiffLineMeta = result.meta;
    this.detailDiffConflictToolbarRows = result.conflictToolbarRows;
    return result.content;
  },

  addConflictToolbarRows(contentLines, meta) {
    if (!this.detailDiffView || !this.detailDiffView.conflicted) {
      return { content: contentLines.join('\n'), meta, conflictToolbarRows: [] };
    }
    const displayContentLines = contentLines.flatMap(line => String(line).split('\n'));
    const nextContentLines = [];
    const nextMeta = [];
    const conflictToolbarRows = [];
    let lastToolbarKey = null;
    meta.forEach((item, index) => {
      const isConflictStart = this.isConflictStartLine(item.rawLine);
      const toolbarKey = Number.isInteger(item.rawIndex) ? `raw:${item.rawIndex}` : `display:${index}`;
      if (isConflictStart && toolbarKey !== lastToolbarKey) {
        const line = item.newLine || item.oldLine || (Number.isInteger(item.rawIndex) ? item.rawIndex + 1 : index + 1);
        if (line) {
          nextContentLines.push('');
          nextMeta.push({
            displayLine: nextMeta.length,
            rawLine: '',
            rawIndex: null,
            kind: 'conflictToolbarSpacing',
            oldLine: null,
            newLine: null,
            actionable: false
          });
          const toolbar = this.conflictToolbarLine();
          conflictToolbarRows.push({ displayLine: nextMeta.length, line, buttons: toolbar.buttons });
          nextContentLines.push(toolbar.content);
          nextMeta.push({
            displayLine: nextMeta.length,
            rawLine: '',
            rawIndex: null,
            kind: 'conflictToolbar',
            oldLine: null,
            newLine: null,
            actionable: false
          });
        }
        lastToolbarKey = toolbarKey;
      }
      item.displayLine = nextMeta.length;
      nextMeta.push(item);
      nextContentLines.push(displayContentLines[index] || '');
    });
    return { content: nextContentLines.join('\n'), meta: nextMeta, conflictToolbarRows };
  },

  formatDiffWithMeta(content) {
    const lines = String(content || '').split(/\r?\n/);
    const meta = [];
    const hasHunk = lines.some(line => this.diffHunkInfo(line));
    if (!hasHunk) {
      const contentLines = lines.map(line => {
        meta.push({
          displayLine: meta.length,
          rawLine: line,
          rawIndex: null,
          kind: this.conflictLineKind(line) || this.diffLineKind(line),
          oldLine: null,
          newLine: null,
          actionable: false
        });
        return this.colorizeDiffLine(line);
      });
      this.assignDiffActionRegions(lines, meta);
      return this.addConflictToolbarRows(contentLines, meta);
    }

    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;
    let combinedHunk = false;
    const contentLines = lines.map((line, index) => {
      const hunk = this.diffHunkInfo(line);
      if (hunk) {
        oldLine = hunk.oldLine;
        newLine = hunk.newLine;
        inHunk = true;
        combinedHunk = hunk.combined;
        return this.formatDiffDisplayLine(line, null, null, 'hunk', meta, index);
      }
      if (index === lines.length - 1 && line === '') {
        meta.push({ displayLine: meta.length, rawLine: line, rawIndex: index, kind: 'text', oldLine: null, newLine: null, actionable: false });
        return '';
      }
      if (!inHunk || /^diff |^index |^commit |^new file |^deleted file |^similarity |^rename |^Binary files |^\+\+\+|^---/.test(line)) {
        return this.formatDiffDisplayLine(line, null, null, null, meta, index);
      }
      if (/^\\ No newline at end of file/.test(line)) {
        return this.formatDiffDisplayLine(line, null, null, 'dim', meta, index);
      }
      if (combinedHunk) {
        const kind = this.conflictLineKind(line) || (line[0] === '+' || line[1] === '+' ? 'add' : (line[0] === '-' || line[1] === '-' ? 'delete' : 'text'));
        const hasOldLine = line[0] !== '+';
        const hasNewLine = line[0] !== '-';
        const currentOldLine = hasOldLine ? oldLine : null;
        const currentNewLine = hasNewLine ? newLine : null;
        if (hasOldLine) oldLine += 1;
        if (hasNewLine) newLine += 1;
        return this.formatDiffDisplayLine(line, currentOldLine, currentNewLine, kind, meta, index);
      }
      if (/^\+/.test(line)) {
        return this.formatDiffDisplayLine(line, null, newLine++, this.conflictLineKind(line) || 'add', meta, index);
      }
      if (/^-/.test(line)) {
        return this.formatDiffDisplayLine(line, oldLine++, null, 'delete', meta, index);
      }
      const contentLine = line.startsWith(' ') ? line : ` ${line}`;
      return this.formatDiffDisplayLine(contentLine, oldLine++, newLine++, this.conflictLineKind(contentLine) || 'text', meta, index);
    });
    this.assignDiffActionRegions(lines, meta);
    return this.addConflictToolbarRows(contentLines, meta);
  }
};
