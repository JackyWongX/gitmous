'use strict';

module.exports = {
  commitInputRows() {
    const lines = this.commitInput.getValue().split('\n').length;
    return Math.min(10, Math.max(3, lines + 2));
  },

  hasAnyChanges() {
    return this.state.status.staged.length > 0 || this.state.status.unstaged.length > 0 || this.state.status.untracked.length > 0;
  },

  commitActionState() {
    if (this.state.status.staged.length > 0 || this.hasAnyChanges()) return { mode: 'commit', label: '提交' };
    if (!this.state.repo) return { mode: 'none', label: '提交' };
    if (!this.state.upstream) return { mode: 'publish', label: '发布分支(推送到指定的远程地址)' };
    if (this.state.behind > 0) return { mode: 'pull', label: '↓ 拉取' };
    return { mode: 'push', label: '↑ 推送' };
  },

  updateCommitButton() {
    const action = this.commitActionState();
    const maxButtonWidth = Math.max(6, Math.min(30, Math.floor((this.screen.width || 80) * 0.28)));
    const width = Math.min(maxButtonWidth, Math.max(6, this.textWidth(action.label) + 2));
    this.commitButton.width = width;
    this.commitButton.setContent(action.label);
    this.commitInput.right = width + 2;
  },

  syncCommitInputScroll() {
    const visibleRows = Math.max(1, this.commitInput.height - this.commitInput.iheight);
    const lineCount = this.commitInput.getValue().split('\n').length;
    const scrollTop = Math.max(0, lineCount - visibleRows);
    this.commitInput.childBase = scrollTop;
    this.commitInput.childOffset = 0;
    if (this.commitInput.lpos) delete this.commitInput.lpos._scrollBottom;
  },

  reflowLeftPanel() {
    const rows = Math.max(22, this.screen.height || 24);
    const startActions = this.state.startDirectoryIsGit ? 0 : 2;
    const repoRows = Math.min(8, Math.max(1, this.state.roots.length + startActions));
    const repoHeight = this.state.collapsed.repositories ? 3 : repoRows + 3;
    const inputHeight = this.commitInputRows();
    const commitHeight = this.state.collapsed.commit ? 3 : inputHeight + 3;
    const historyHeight = this.state.collapsed.history ? 3 : Math.max(6, Math.floor(rows * 0.34));
    const changeHeight = this.state.collapsed.changes ? 3 : Math.max(5, rows - repoHeight - commitHeight - historyHeight);
    const actualHistoryHeight = this.state.collapsed.changes ? rows - repoHeight - commitHeight - changeHeight : historyHeight;
    let top = 0;
    this.repoPanel.top = top;
    this.repoPanel.height = repoHeight;
    top += repoHeight;
    this.workPanel.top = top;
    this.workPanel.height = commitHeight;
    this.updateCommitButton();
    this.commitInput.height = inputHeight;
    this.commitButton.height = inputHeight;
    top += commitHeight;
    this.changePanel.top = top;
    this.changePanel.height = changeHeight;
    top += changeHeight;
    this.historyPanel.top = top;
    this.historyPanel.height = Math.max(1, actualHistoryHeight);

    this.repoHeader.setContent(this.sectionCaption(this.state.collapsed.repositories, '存储库'));
    this.commitHeader.setContent(this.sectionCaption(this.state.collapsed.commit, '提交'));
    this.changeHeader.setContent(this.sectionCaption(this.state.collapsed.changes, '更改'));
    this.historyHeader.setContent(this.sectionCaption(this.state.collapsed.history, '提交历史'));
    this.setVisible(this.repoAddButton, !this.state.collapsed.repositories);
    this.setVisible(this.repoArea, !this.state.collapsed.repositories);
    this.setVisible(this.commitInput, !this.state.collapsed.commit);
    this.setVisible(this.commitButton, !this.state.collapsed.commit);
    this.setVisible(this.changeArea, !this.state.collapsed.changes);
    this.setVisible(this.historyArea, !this.state.collapsed.history);
  },

  resizeCommitInput() {
    if (this.state.collapsed.commit) return;
    this.reflowLeftPanel();
    this.syncCommitInputScroll();
    this.screen.render();
  },

  toggleSection(section) {
    this.state.collapsed[section] = !this.state.collapsed[section];
    this.reflowLeftPanel();
    this.screen.render();
  },

  releaseCommitInputIfOutside(data) {
    if (!data || data.action !== 'mousedown' || this.pointInside(this.commitInput, data)) return;
    if (this.commitInput._reading && typeof this.commitInput._done === 'function') {
      this.commitInput._done('stop');
    }
    if (this.screen.focused === this.commitInput) {
      this.screen.rewindFocus();
    }
    this.screen.grabKeys = false;
    this.screen.program.hideCursor();
  },

  handleCommitButton() {
    const action = this.commitActionState();
    if (action.mode === 'publish') {
      this.runUiAction(() => this.publishCurrentBranch(this.commitButton), '发布分支');
      return;
    }
    if (action.mode === 'push') {
      this.runUiAction(() => this.pushCurrentBranch(), '推送');
      return;
    }
    if (action.mode === 'pull') {
      this.runUiAction(() => this.pullCurrentBranch(), '拉取');
      return;
    }
    const message = this.commitInput.getValue().trim();
    if (!message) { this.toast('请输入提交消息', this.COLORS.yellow); this.commitInput.focus(); this.screen.render(); return; }
    if (!this.state.status.staged.length) { this.toast('没有已暂存的更改', this.COLORS.yellow); return; }
    this.runUiAction(() => this.perform('提交', async () => { await this.git(['commit', '-m', message]); this.commitInput.clearValue(); this.resizeCommitInput(); }), '提交');
  }
};
