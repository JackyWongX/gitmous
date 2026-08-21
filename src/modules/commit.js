'use strict';

module.exports = {
  commitInputRows() {
    const lines = this.commitInput.getValue().split('\n').length;
    return Math.min(10, Math.max(1, lines));
  },

  hasAnyChanges() {
    return this.state.isMerging || this.state.status.staged.length > 0 || this.state.status.unstaged.length > 0 || this.state.status.untracked.length > 0 || this.state.status.conflicted.length > 0;
  },

  commitActionState() {
    if (this.state.status.staged.length > 0 || this.hasAnyChanges()) return { mode: 'commit', label: this.t('commitButton') };
    if (!this.state.repo) return { mode: 'none', label: this.t('commitButton') };
    if (!this.state.upstream) return { mode: 'publish', label: this.t('publishButton') };
    if (this.state.behind > 0) return { mode: 'pull', label: this.t('pull') };
    if (this.state.ahead > 0) return { mode: 'push', label: this.t('push') };
    return { mode: 'commit', label: this.t('commitButton') };
  },

  updateCommitButton() {
    const action = this.commitActionState();
    const panelWidth = Math.max(24, Math.floor((this.screen.width || 80) * 0.42) - 2);
    const inputLeft = 2;
    const buttonRight = 1;
    const gap = 1;
    const minInputWidth = 14;
    const desiredButtonWidth = Math.max(6, this.textWidth(action.label) + 2);
    const maxButtonWidth = Math.max(4, panelWidth - inputLeft - buttonRight - gap - minInputWidth);
    const width = Math.min(desiredButtonWidth, maxButtonWidth);
    this.commitButton.right = buttonRight;
    this.commitButton.width = width;
    this.commitButton.setContent(action.label);
    this.commitInput.left = inputLeft;
    this.commitInput.right = buttonRight + width + gap;
    this.commitPlaceholder.left = this.commitInput.left;
    this.commitPlaceholder.right = this.commitInput.right;
  },

  syncCommitInputScroll() {
    const visibleRows = Math.max(1, this.commitInput.height - this.commitInput.iheight);
    const lineCount = this.commitInput.getValue().split('\n').length;
    const scrollTop = Math.max(0, lineCount - visibleRows);
    this.commitInput.childBase = scrollTop;
    this.commitInput.childOffset = 0;
    if (this.commitInput.lpos) delete this.commitInput.lpos._scrollBottom;
  },

  updateSectionHeader(element, section, text) {
    const content = ` ${this.sectionCaption(this.state.collapsed[section], text)} `;
    element.setContent(content);
    element.width = this.textWidth(content) + 2;
  },

  updateCommitPlaceholder() {
    const hasValue = Boolean(this.commitInput.getValue());
    const isFocused = this.screen.focused === this.commitInput || this.commitInputActive;
    const visible = !this.state.collapsed.commit && !hasValue && !isFocused;
    this.setVisible(this.commitPlaceholder, visible);
  },

  focusCommitInput() {
    this.commitPlaceholder.hide();
    this.commitInput.focus();
    if (!this.commitInput._reading) this.commitInput.readInput();
    this.commitInputActive = Boolean(this.commitInput._reading);
    this.screen.program.showCursor();
    this.screen.render();
  },

  pointInsideCommitInput(data) {
    return this.pointInside(this.commitInput, data) || this.pointInside(this.commitPlaceholder, data);
  },

  activateCommitInputIfInside(data) {
    if (!data || data.action !== 'mousedown' || this.state.collapsed.commit) return;
    if (!this.pointInsideCommitInput(data)) return;
    this.focusCommitInput();
  },

  reflowLeftPanel() {
    const rows = Math.max(22, this.screen.height || 24);
    const startActions = this.state.startDirectoryIsGit ? 0 : 2;
    const repoRows = Math.min(8, Math.max(1, this.state.roots.length + startActions));
    const collapsedHeight = 2;
    const repoHeight = this.state.collapsed.repositories ? collapsedHeight : repoRows + 2;
    const inputHeight = this.commitInputRows();
    const commitHeight = this.state.collapsed.commit ? collapsedHeight : inputHeight + 2;
    const historyHeight = this.state.collapsed.history ? collapsedHeight : Math.max(6, Math.floor(rows * 0.34));
    const changeHeight = this.state.collapsed.changes ? collapsedHeight : Math.max(5, rows - repoHeight - commitHeight - historyHeight);
    const actualHistoryHeight = this.state.collapsed.changes ? rows - repoHeight - commitHeight - changeHeight : historyHeight;
    let top = 0;
    this.repoPanel.top = top;
    this.repoPanel.height = repoHeight;
    top += repoHeight;
    this.workPanel.top = top;
    this.workPanel.height = commitHeight;
    this.updateCommitButton();
    this.commitInput.height = inputHeight;
    this.commitPlaceholder.height = inputHeight;
    this.commitButton.height = inputHeight;
    top += commitHeight;
    this.changePanel.top = top;
    this.changePanel.height = changeHeight;
    top += changeHeight;
    this.historyPanel.top = top;
    this.historyPanel.height = Math.max(1, actualHistoryHeight);

    this.updateSectionHeader(this.repoHeader, 'repositories', this.t('repositories'));
    this.updateSectionHeader(this.commitHeader, 'commit', this.t('commit'));
    this.updateSectionHeader(this.changeHeader, 'changes', this.t('changes'));
    this.updateSectionHeader(this.historyHeader, 'history', this.t('history'));
    this.setVisible(this.repoAddButton, !this.state.collapsed.repositories);
    this.setVisible(this.repoArea, !this.state.collapsed.repositories);
    this.setVisible(this.commitInput, !this.state.collapsed.commit);
    this.setVisible(this.commitButton, !this.state.collapsed.commit);
    this.updateCommitPlaceholder();
    this.setVisible(this.changeArea, !this.state.collapsed.changes);
    this.setVisible(this.historyArea, !this.state.collapsed.history);
  },

  resizeCommitInput() {
    if (this.state.collapsed.commit) return;
    this.reflowLeftPanel();
    this.syncCommitInputScroll();
    this.screen.render();
  },

  resizeCommitInputIfNeeded() {
    if (this.state.collapsed.commit || this.commitInput.height === this.commitInputRows()) return;
    this.resizeCommitInput();
  },

  async readMergeState() {
    const mergeHeadRaw = await this.git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).catch(() => '');
    const mergeHeads = mergeHeadRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!mergeHeads.length) return { isMerging: false, message: '' };

    const gitDirRaw = (await this.git(['rev-parse', '--git-dir']).catch(() => '')).trim();
    const gitDir = this.path.isAbsolute(gitDirRaw) ? gitDirRaw : this.path.resolve(this.state.repo, gitDirRaw || '.git');
    const mergeMessageFile = this.path.join(gitDir, 'MERGE_MSG');
    let mergeMessage = '';
    try {
      mergeMessage = this.fs.readFileSync(mergeMessageFile, 'utf8')
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('#'))
        .join('\n')
        .replace(/\s+$/g, '');
    } catch (_) {
      mergeMessage = '';
    }

    const incomingSubjects = [];
    for (const hash of mergeHeads) {
      const raw = await this.git(['log', '--reverse', '--format=%s', `HEAD..${hash}`]).catch(() => '');
      raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => incomingSubjects.push(line));
    }
    const uniqueSubjects = [...new Set(incomingSubjects)];
    if (uniqueSubjects.length) {
      const incomingBlock = uniqueSubjects.map(subject => `- ${subject}`).join('\n');
      mergeMessage = mergeMessage ? `${mergeMessage}\n\n${this.t('incomingCommitMessages')}\n${incomingBlock}` : incomingBlock;
    }

    return { isMerging: true, message: mergeMessage };
  },

  async syncMergeCommitMessage() {
    const mergeState = await this.readMergeState();
    this.state.isMerging = mergeState.isMerging;
    if (!mergeState.isMerging || !mergeState.message) {
      this.state.mergeMessageSource = '';
      this.state.mergeMessageApplied = false;
      return;
    }
    if (mergeState.message !== this.state.mergeMessageSource) {
      this.state.mergeMessageSource = mergeState.message;
      this.state.mergeMessageApplied = false;
    }
    if (!this.state.mergeMessageApplied && !this.commitInput.getValue().trim()) {
      this.commitInput.setValue(mergeState.message);
      this.state.mergeMessageApplied = true;
      this.resizeCommitInput();
    }
  },

  toggleSection(section) {
    this.state.collapsed[section] = !this.state.collapsed[section];
    this.reflowLeftPanel();
    this.screen.render();
  },

  releaseCommitInputIfOutside(data) {
    if (!data || data.action !== 'mousedown' || this.pointInsideCommitInput(data)) return;
    if (this.commitInput._reading) this.commitInput.cancel();
    this.commitInputActive = false;
    if (this.screen.focused === this.commitInput) {
      this.screen.rewindFocus();
    }
    this.screen.grabKeys = false;
    this.screen.program.hideCursor();
    this.updateCommitPlaceholder();
    this.screen.render();
  },

  handleCommitButton() {
    const action = this.commitActionState();
    if (action.mode === 'publish') {
      this.runUiAction(() => this.publishCurrentBranch(this.commitButton), this.t('publishBranch'));
      return;
    }
    if (action.mode === 'push') {
      this.runUiAction(() => this.pushCurrentBranch(), this.t('pushAction'));
      return;
    }
    if (action.mode === 'pull') {
      this.runUiAction(() => this.pullCurrentBranch(), this.t('pullAction'));
      return;
    }
    const message = this.commitInput.getValue().trim();
    if (!message) { this.toast(this.t('commitMessageRequired'), this.COLORS.yellow); this.focusCommitInput(); return; }
    if (this.state.status.conflicted.length) {
      this.toast(this.t('resolveConflictsFirst'), this.COLORS.yellow);
      return;
    }
    this.runUiAction(() => this.perform(this.t('commit'), async () => {
      if (!this.state.status.staged.length) await this.git(['add', '-A']);
      await this.git(['commit', '-m', message]);
      this.commitInput.clearValue();
      this.state.mergeMessageSource = '';
      this.state.mergeMessageApplied = false;
      this.resizeCommitInput();
    }), this.t('commit'));
  }
};
