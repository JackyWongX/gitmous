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
      this.bindTooltip(unstageAll, () => this.t('unstageAllTooltip'));
      unstageAll.on('press', () => this.perform(this.t('unstageAll'), () => this.git(['reset', 'HEAD']).catch(() => this.git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))));
    } else {
      const discardAll = this.button({ parent: this.changeContent, top, right: 3, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
      const stageAll = this.button({ parent: this.changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: '+', style: this.iconStyle });
      actionButtons.push(discardAll, stageAll);
      this.bindTooltip(discardAll, () => this.t('discardAllTooltip'));
      this.bindTooltip(stageAll, () => this.t('stageAllTooltip'));
      discardAll.on('press', () => this.discardAllChanges());
      stageAll.on('press', () => this.perform(this.t('stageAllChanges'), () => this.git(['add', '-A'])));
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
      this.bindTooltip(main, () => this.t('viewFileDiffTooltip', { file: item.file }));
      main.on('press', () => this.showFileDiff(item, staged));
      if (staged) {
        const unstageButton = this.button({ parent: this.changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
        rowElements.push(unstageButton);
        this.bindTooltip(unstageButton, () => this.t('unstageFileTooltip', { file: item.file }));
        unstageButton.on('press', () => this.unstage(item.file));
      } else {
        const undoButton = this.button({ parent: this.changeContent, top: row, right: 3, width: 3, height: 1, shrink: false, content: '-', style: this.iconStyle });
        const stageButton = this.button({ parent: this.changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '+', style: this.iconStyle });
        rowElements.push(undoButton, stageButton);
        this.bindTooltip(undoButton, () => this.t('discardFileTooltip', { file: item.file }));
        this.bindTooltip(stageButton, () => this.t('stageFileTooltip', { file: item.file }));
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
    top = this.addFileGroup(this.t('stagedChanges'), this.state.status.staged, 'staged', top);
    top = this.addFileGroup(this.t('unstagedChanges'), [...this.state.status.unstaged, ...this.state.status.untracked], 'unstaged', top);
    if (top === 0) this.blessed.box({ parent: this.changeContent, top: 1, left: 1, content: `{green-fg}${this.t('workingTreeClean')}{/green-fg}`, tags: true });
    this.changeContent.height = Math.max(1, top + 1);
    this.resetScrollable(this.changeArea);
  },

  async stage(file) {
    await this.perform(this.t('stageFile', { file }), () => this.git(['add', '--', file]));
  },

  async unstage(file) {
    await this.perform(this.t('unstageFile', { file }), () => this.git(['reset', 'HEAD', '--', file]).catch(() => this.git(['rm', '--cached', '--', file])));
  },

  async discard(file, untracked) {
    this.confirm(
      this.t('confirmDiscardFile'),
      this.t('discardFileConfirm', { file }),
      () => this.perform(this.t('discardFile', { file }), () => untracked ? this.git(['clean', '-f', '--', file]) : this.git(['restore', '--source=HEAD', '--worktree', '--', file]))
    );
  },

  async showFileDiff(item, staged) {
    this.state.selected = item.file;
    const baseArgs = staged ? ['diff', '--cached'] : ['diff'];
    await this.showDetailDiff({
      label: () => this.t('diffLabel', { file: item.file }),
      collapsedArgs: [...baseArgs, '--', item.file],
      expandedArgs: [...baseArgs, '--unified=999999', '--', item.file]
    });
  },

  discardAllChanges() {
    const count = this.state.status.unstaged.length + this.state.status.untracked.length;
    this.confirm(this.t('confirmDiscardMultiple'), this.t('discardMultipleConfirm', { count }), () => this.perform(this.t('discardAllChanges'), async () => {
      await this.git(['restore', '--source=HEAD', '--worktree', '.']);
      await this.git(['clean', '-fd']);
    }));
  },

  renderAll() {
    this.updateCommitButton();
    this.renderRepositories();
    this.renderChanges();
    this.renderHistory();
    if (!this.state.selected) this.setDetailText(null, this.t('helpDetail'));
    this.screen.render();
  }
};
