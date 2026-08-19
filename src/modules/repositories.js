'use strict';

module.exports = {
  renderRepositories() {
    this.clearChildren(this.repoContent);
    let row = 0;
    if (!this.state.startDirectoryIsGit) {
      const initButton = this.button({
        parent: this.repoContent,
        top: row,
        left: 0,
        right: 0,
        height: 1,
        shrink: false,
        tags: true,
        content: `{green-fg}+{/green-fg} ${this.t('initRepository')}`,
        style: { fg: this.COLORS.accent, bg: this.COLORS.panel, hover: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt } }
      });
      initButton.on('press', () => this.runUiAction(() => this.initializeCurrentDirectory(), this.t('initRepository')));
      row += 1;
      const cloneButton = this.button({
        parent: this.repoContent,
        top: row,
        left: 0,
        right: 0,
        height: 1,
        shrink: false,
        tags: true,
        content: `{cyan-fg}↓{/cyan-fg} ${this.t('cloneFromRemote')}`,
        style: { fg: this.COLORS.accent, bg: this.COLORS.panel, hover: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt } }
      });
      cloneButton.on('press', () => this.cloneRemoteRepository());
      row += 1;
    }
    this.state.roots.forEach((root, index) => {
      const active = this.samePath(root, this.state.repo);
      const rowStyle = { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } };
      const actionStyle = { fg: this.COLORS.accent, bg: this.COLORS.panel, hover: { fg: this.COLORS.accent, bg: this.COLORS.panelAlt } };
      const branch = active ? ` ${this.escapeTags(this.state.branch)}` : '';
      const indicator = active ? '{green-fg}●{/green-fg}' : ' ';
      const branchButtonWidth = Math.max(1, this.textWidth(this.t('branchManagement')));
      const rowButton = this.button({
        parent: this.repoContent,
        top: row + index,
        left: 0,
        right: active ? branchButtonWidth : 0,
        height: 1,
        shrink: false,
        padding: { left: 0, right: 0 },
        tags: true,
        content: `${indicator} ${this.escapeTags(this.path.basename(root))}${branch}`,
        style: rowStyle
      });
      rowButton.on('press', () => {
        if (!this.samePath(root, this.state.repo)) this.selectRepo(root);
      });
      if (active) {
        const branchButton = this.button({
          parent: this.repoContent,
          top: row + index,
          right: 0,
          width: branchButtonWidth,
          height: 1,
          shrink: false,
          padding: { left: 0, right: 0 },
          align: 'right',
          content: this.t('branchManagement'),
          style: actionStyle
        });
        branchButton.on('press', () => this.branchSwitchMenu(branchButton));
      }
    });
    this.repoContent.height = Math.max(1, row + this.state.roots.length);
    this.resetScrollable(this.repoArea);
  },

  async selectRepo(root, options = {}) {
    this.state.repo = this.path.resolve(root);
    this.state.selected = null;
    this.state.expandedHistory.clear();
    this.state.historyFiles.clear();
    await this.perform(this.t('loadRepository'), () => this.refreshRepo(), false, options);
  },

  async refreshRepositoryList() {
    this.state.startDirectoryIsGit = Boolean(await this.findGitRoot(this.state.startDirectory));
    this.state.roots = await this.discoverRepositories(this.state.startDirectory);
  },

  async initializeCurrentDirectory() {
    const root = await this.perform(this.t('initRepository'), async () => {
      await this.git(['init'], { cwd: this.state.startDirectory });
      return this.findGitRoot(this.state.startDirectory);
    }, false);
    if (!root) return;
    await this.refreshRepositoryList();
    if (!this.state.roots.includes(root)) this.state.roots.unshift(root);
    await this.selectRepo(root, { silentSuccess: true });
  },

  cloneRemoteRepository() {
    this.textDialog(this.t('cloneRemoteRepository'), this.t('remoteUrlPlaceholder'), async url => {
      const before = new Set(this.state.roots);
      const newRoot = await this.perform(this.t('cloneRepository'), async () => {
        await this.git(['clone', url], { cwd: this.state.startDirectory });
        await this.refreshRepositoryList();
        return this.state.roots.find(root => !before.has(root)) || this.state.roots[0] || null;
      }, false);
      if (newRoot) await this.selectRepo(newRoot, { silentSuccess: true });
    });
  }
};
