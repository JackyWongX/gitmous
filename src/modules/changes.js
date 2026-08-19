'use strict';

module.exports = {
  statusMarker(code) {
    if (code === '??' || code.includes('A')) return { label: 'A', tag: 'green-fg' };
    if (code.includes('D')) return { label: 'D', tag: 'red-fg' };
    if (code.includes('R')) return { label: 'R', tag: 'magenta-fg' };
    return { label: 'M', tag: 'yellow-fg' };
  },

  isLiveRowState(rowState) {
    return rowState.elements.every(element => element.parent);
  },

  applyFileRowState(rowState) {
    if (!this.isLiveRowState(rowState)) return;
    const bg = rowState.rowHover || rowState.groupHover ? this.fileRowHoverBg : this.COLORS.panel;
    rowState.elements.forEach(element => {
      element.style.bg = bg;
      if (element.style.hover) element.style.hover.bg = bg;
    });
  },

  setRowHover(rowState, hovered) {
    if (!this.isLiveRowState(rowState)) return;
    rowState.rowHover = hovered;
    this.applyFileRowState(rowState);
    this.screen.render();
  },

  bindFileRowHover(rowState) {
    rowState.elements.forEach(element => {
      element.on('mouseover', () => this.setRowHover(rowState, true));
      element.on('mouseout', () => this.setRowHover(rowState, false));
    });
  },

  setGroupHover(rowStates, hovered) {
    if (!rowStates.every(rowState => this.isLiveRowState(rowState))) return;
    rowStates.forEach(rowState => {
      rowState.groupHover = hovered;
      this.applyFileRowState(rowState);
    });
    this.screen.render();
  },

  bindGroupActionHover(actionButtons, rowStates) {
    actionButtons.forEach(actionButton => {
      actionButton.on('mouseover', () => this.setGroupHover(rowStates, true));
      actionButton.on('mouseout', () => this.setGroupHover(rowStates, false));
    });
  },

  addFileGroup(title, files, mode, top) {
    const folded = this.state.collapsed[mode];
    const staged = mode === 'staged';
    const actionButtons = [];
    const rowStates = [];
    const heading = this.button({ parent: this.changeContent, top, left: 0, right: staged ? 3 : 6, height: 1, shrink: false, tags: true, content: `${this.sectionCaption(folded, title)} {gray-fg}(${files.length}){/gray-fg}` });
    heading.on('press', () => {
      this.state.collapsed[mode] = !this.state.collapsed[mode];
      this.renderChanges();
      this.screen.render();
    });
    if (staged) {
      const unstageAll = this.button({ parent: this.changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
      actionButtons.push(unstageAll);
      unstageAll.on('press', () => this.perform('取消所有暂存', () => this.git(['reset', 'HEAD']).catch(() => this.git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))));
    } else {
      const discardAll = this.button({ parent: this.changeContent, top, right: 3, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
      const stageAll = this.button({ parent: this.changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: '+', style: this.iconStyle });
      actionButtons.push(discardAll, stageAll);
      discardAll.on('press', () => this.discardAllChanges());
      stageAll.on('press', () => this.perform('暂存所有更改', () => this.git(['add', '-A'])));
    }
    if (folded) {
      this.bindGroupActionHover(actionButtons, rowStates);
      return top + 1;
    }
    let row = top + 1;
    for (const item of files) {
      const marker = this.statusMarker(item.code);
      const rowBg = this.blessed.box({ parent: this.changeContent, top: row, left: 0, right: 0, height: 1, style: { bg: this.COLORS.panel } });
      const rowElements = [rowBg];
      const main = this.button({ parent: this.changeContent, top: row, left: 2, right: staged ? 3 : 6, height: 1, shrink: false, padding: { left: 0, right: 0 }, tags: true, content: `{${marker.tag}}${marker.label}{/${marker.tag}}  ${this.escapeTags(item.file)}` });
      rowElements.push(main);
      main.on('press', () => this.showFileDiff(item, staged));
      if (staged) {
        const unstageButton = this.button({ parent: this.changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
        rowElements.push(unstageButton);
        unstageButton.on('press', () => this.unstage(item.file));
      } else {
        const undoButton = this.button({ parent: this.changeContent, top: row, right: 3, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
        const stageButton = this.button({ parent: this.changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '+', style: this.iconStyle });
        rowElements.push(undoButton, stageButton);
        undoButton.on('press', () => this.discard(item.file, item.code === '??'));
        stageButton.on('press', () => this.stage(item.file));
      }
      const rowState = { elements: rowElements, rowHover: false, groupHover: false };
      rowStates.push(rowState);
      this.bindFileRowHover(rowState);
      row += 1;
    }
    this.bindGroupActionHover(actionButtons, rowStates);
    return row;
  },

  renderChanges() {
    this.clearChildren(this.changeContent);
    let top = 0;
    top = this.addFileGroup('暂存的更改', this.state.status.staged, 'staged', top);
    top = this.addFileGroup('更改', [...this.state.status.unstaged, ...this.state.status.untracked], 'unstaged', top);
    if (top === 0) this.blessed.box({ parent: this.changeContent, top: 1, left: 1, content: '{green-fg}工作区干净{/green-fg}', tags: true });
    this.changeContent.height = Math.max(1, top + 1);
    this.resetScrollable(this.changeArea);
  },

  async stage(file) {
    await this.perform(`暂存 ${file}`, () => this.git(['add', '--', file]));
  },

  async unstage(file) {
    await this.perform(`取消暂存 ${file}`, () => this.git(['reset', 'HEAD', '--', file]).catch(() => this.git(['rm', '--cached', '--', file])));
  },

  async discard(file, untracked) {
    this.confirm(
      '确认撤销文件更改',
      `这是危险操作，会丢弃该文件的本地修改，操作后无法从 GitUI 恢复。\n\n文件：${file}\n\n确定继续吗？`,
      () => this.perform(`丢弃 ${file}`, () => untracked ? this.git(['clean', '-f', '--', file]) : this.git(['restore', '--source=HEAD', '--worktree', '--', file]))
    );
  },

  async showFileDiff(item, staged) {
    this.state.selected = item.file;
    const diff = await this.git(staged ? ['diff', '--cached', '--', item.file] : ['diff', '--', item.file]).catch(error => `无法读取差异：${error.message}`);
    this.detailPanel.setLabel(` 差异：${item.file} `);
    this.detailPanel.setContent(this.formatDiff(diff || '没有可显示的文本差异。'));
    this.detailPanel.setScroll(0);
    this.screen.render();
  },

  discardAllChanges() {
    const count = this.state.status.unstaged.length + this.state.status.untracked.length;
    this.confirm('确认撤销多个文件更改', `这是危险操作，会丢弃“更改”区域中的 ${count} 个文件修改。\n\n已跟踪文件会还原到 HEAD，未跟踪文件会被永久删除，操作后无法从 GitUI 恢复。\n\n确定继续吗？`, () => this.perform('丢弃全部更改', async () => {
      await this.git(['restore', '--source=HEAD', '--worktree', '.']);
      await this.git(['clean', '-fd']);
    }));
  },

  renderAll() {
    this.updateCommitButton();
    this.renderRepositories();
    this.renderChanges();
    this.renderHistory();
    if (!this.state.selected) this.detailPanel.setContent(' 点击更改文件可查看工作区差异；点击提交可展开文件列表，再点击文件查看该提交的修改对比。');
    this.screen.render();
  }
};
