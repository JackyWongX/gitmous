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
    return String(value || '').replace(/\{\/?[^}]+}/g, '').length;
  },

  toast(message, color = this.COLORS.accent) {
    const notice = this.blessed.message({ parent: this.screen, top: 'center', left: 'center', width: '55%', height: 'shrink', border: 'line', tags: true, style: { fg: this.COLORS.text, bg: '#172133', border: { fg: color } } });
    notice.display(` {bold}${this.escapeTags(message)}{/bold} `, 2, () => this.destroyElement(notice));
  },

  setBusy(value, label = '') {
    this.state.busy = value;
    this.footer.setContent(value ? ` {yellow-fg}正在执行：${this.escapeTags(label)}{/yellow-fg}` : ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认');
    this.screen.render();
  },

  reportUnhandledError(error) {
    if (this.reportingUnhandledError) return;
    this.reportingUnhandledError = true;
    try {
      const message = error && error.message ? error.message : String(error);
      this.state.busy = false;
      this.footer.setContent(` {red-fg}操作异常：${this.escapeTags(message)}{/red-fg}`);
      this.detailPanel.setLabel(' 程序异常 ');
      this.detailPanel.setContent(this.escapeTags(error && error.stack ? error.stack : message));
      this.screen.render();
    } catch (renderError) {
      try { this.screen.destroy(); } catch (_) {}
      console.error(renderError && renderError.stack ? renderError.stack : renderError);
    } finally {
      this.reportingUnhandledError = false;
    }
  },

  async perform(label, operation, refresh = true, options = {}) {
    if (this.state.busy) return undefined;
    try {
      this.setBusy(true, label);
      const result = await operation();
      if (refresh) await this.refreshRepo();
      if (!options.silentSuccess) this.toast(`${label}完成`, this.COLORS.green);
      return result;
    } catch (error) {
      this.toast(`${label}失败：${error.message}`, this.COLORS.red);
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
    this.clearScreenMouseRefs(element);
    const children = [...element.children];
    element.children.length = 0;
    children.forEach(child => {
      child.parent = null;
      this.disposeTree(child);
    });
    this.resetScrollable(element);
  },

  runUiAction(action, label = '操作') {
    try {
      const result = action();
      if (result && typeof result.then === 'function') {
        result.catch(error => this.toast(`${label}失败：${error.message}`, this.COLORS.red));
      }
    } catch (error) {
      this.toast(`${label}失败：${error.message}`, this.COLORS.red);
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
        else reject(new Error((stderr || `剪贴板命令退出码 ${code}`).trim()));
      });
      child.stdin.end(value, 'utf8');
    });
  },

  anchorPosition(anchor, width, height) {
    const fallback = { top: 2, left: Math.max(1, this.screen.width - width - 2) };
    if (!anchor || !anchor.parent) return fallback;
    const pos = anchor.lpos || anchor._getCoords();
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
    const pos = element && (element.lpos || element._getCoords());
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
    const yes = this.button({ parent: modal, bottom: 1, left: Math.max(2, Math.floor(width * 0.25) - 4), width: 8, content: '确认', align: 'center' });
    const no = this.button({ parent: modal, bottom: 1, right: Math.max(2, Math.floor(width * 0.25) - 4), width: 8, content: '取消', align: 'center' });
    yes.on('press', () => { this.destroyElement(modal); this.runUiAction(onConfirm, title); this.screen.render(); });
    no.on('press', () => { this.destroyElement(modal); this.screen.render(); });
    this.screen.render();
  },

  textDialog(title, placeholder, submit) {
    const modal = this.box({ parent: this.screen, top: 'center', left: 'center', width: 72, height: 16, label: ` ${title} `, style: { fg: this.COLORS.text, bg: '#182235', border: { fg: this.COLORS.accent } } });
    const input = this.blessed.textbox({ parent: modal, top: 1, left: 2, right: 2, height: 3, mouse: true, inputOnFocus: false, keys: false, value: '', border: 'line', style: { fg: this.COLORS.text, bg: '#101722', border: { fg: this.COLORS.border } } });
    input.setValue('');
    this.blessed.box({ parent: modal, top: 4, left: 2, right: 2, height: 1, content: this.escapeTags(placeholder), style: { fg: this.COLORS.dim, bg: '#182235' } });
    const chars = ['A B C D E F G H I J K L M', 'N O P Q R S T U V W X Y Z', 'a b c d e f g h i j k l m', 'n o p q r s t u v w x y z', '0 1 2 3 4 5 6 7 8 9 - _ / . : @'];
    chars.forEach((line, row) => {
      const values = line.split(' ');
      values.forEach((char, col) => {
        const key = this.button({ parent: modal, top: 5 + row, left: 2 + col * 5, width: 4, height: 1, content: char, align: 'center' });
        key.on('press', () => { input.setValue(input.getValue() + char); this.screen.render(); });
      });
    });
    const back = this.button({ parent: modal, bottom: 1, left: 2, width: 11, content: '退格' });
    const cancel = this.button({ parent: modal, bottom: 1, left: 16, width: 11, content: '取消' });
    const ok = this.button({ parent: modal, bottom: 1, right: 2, width: 14, content: '确认' });
    back.on('press', () => { input.setValue(input.getValue().slice(0, -1)); this.screen.render(); });
    cancel.on('press', () => { this.destroyElement(modal); this.screen.render(); });
    ok.on('press', () => { const value = input.getValue().trim(); if (!value) { this.toast('请输入内容', this.COLORS.yellow); return; } this.destroyElement(modal); this.runUiAction(() => submit(value), title); this.screen.render(); });
    this.screen.render();
  },

  showMenu(title, entries, anchor) {
    this.closeDropdownMenu();
    const visibleEntries = entries.slice(0, 18);
    const width = Math.min(64, Math.max(18, this.textWidth(title) + 6, ...visibleEntries.map(entry => this.textWidth(entry.label) + 4)));
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

  formatDiff(content) {
    return String(content || '').split(/\r?\n/).map(line => {
      const safe = this.escapeTags(line);
      if (/^@@/.test(line)) return `{cyan-fg}${safe}{/cyan-fg}`;
      if (/^\+\+\+|^---/.test(line)) return `{bold}${safe}{/bold}`;
      if (/^\+/.test(line)) return `{green-fg}${safe}{/green-fg}`;
      if (/^-/.test(line)) return `{red-fg}${safe}{/red-fg}`;
      if (/^diff |^index |^commit /.test(line)) return `{yellow-fg}${safe}{/yellow-fg}`;
      return safe;
    }).join('\n');
  }
};
