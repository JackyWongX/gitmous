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
        content: '{green-fg}+{/green-fg} 初始化仓库',
        style: { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } }
      });
      initButton.on('press', () => this.runUiAction(() => this.initializeCurrentDirectory(), '初始化仓库'));
      row += 1;
      const cloneButton = this.button({
        parent: this.repoContent,
        top: row,
        left: 0,
        right: 0,
        height: 1,
        shrink: false,
        tags: true,
        content: '{cyan-fg}↓{/cyan-fg} 从远程分支克隆',
        style: { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } }
      });
      cloneButton.on('press', () => this.cloneRemoteRepository());
      row += 1;
    }
    this.state.roots.forEach((root, index) => {
      const active = root === this.state.repo;
      const rowStyle = { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } };
      const branch = active ? ` ${this.escapeTags(this.state.branch)}` : '';
      const indicator = active ? '{green-fg}●{/green-fg}' : ' ';
      const rowButton = this.button({
        parent: this.repoContent,
        top: row + index,
        left: 0,
        right: active ? 12 : 0,
        height: 1,
        shrink: false,
        padding: { left: 0, right: 0 },
        tags: true,
        content: `${indicator} ${this.escapeTags(this.path.basename(root))}${branch}`,
        style: rowStyle
      });
      rowButton.on('press', () => {
        if (root !== this.state.repo) this.selectRepo(root);
      });
      if (active) {
        const branchButton = this.button({
          parent: this.repoContent,
          top: row + index,
          right: 5,
          width: 6,
          height: 1,
          shrink: false,
          content: '分支',
          style: rowStyle
        });
        const moreButton = this.button({
          parent: this.repoContent,
          top: row + index,
          right: 0,
          width: 4,
          height: 1,
          shrink: false,
          content: '...',
          style: rowStyle
        });
        branchButton.on('press', () => this.branchSwitchMenu(branchButton));
        moreButton.on('press', () => this.repositoryMenu(moreButton));
      }
    });
    this.repoContent.height = Math.max(1, row + this.state.roots.length);
    this.resetScrollable(this.repoArea);
  },

  async selectRepo(root, options = {}) {
    this.state.repo = root;
    this.state.selected = null;
    this.state.expandedHistory.clear();
    this.state.historyFiles.clear();
    await this.perform('加载仓库', () => this.refreshRepo(), false, options);
  },

  async refreshRepositoryList() {
    this.state.startDirectoryIsGit = Boolean(await this.findGitRoot(this.state.startDirectory));
    this.state.roots = await this.discoverRepositories(this.state.startDirectory);
  },

  async initializeCurrentDirectory() {
    const root = await this.perform('初始化仓库', async () => {
      await this.git(['init'], { cwd: this.state.startDirectory });
      return this.findGitRoot(this.state.startDirectory);
    }, false);
    if (!root) return;
    await this.refreshRepositoryList();
    if (!this.state.roots.includes(root)) this.state.roots.unshift(root);
    await this.selectRepo(root, { silentSuccess: true });
  },

  cloneRemoteRepository() {
    this.textDialog('克隆远程仓库', '输入远程仓库地址，例如 https://example.com/repo.git', async url => {
      const before = new Set(this.state.roots);
      const newRoot = await this.perform('克隆仓库', async () => {
        await this.git(['clone', url], { cwd: this.state.startDirectory });
        await this.refreshRepositoryList();
        return this.state.roots.find(root => !before.has(root)) || this.state.roots[0] || null;
      }, false);
      if (newRoot) await this.selectRepo(newRoot, { silentSuccess: true });
    });
  }
};
