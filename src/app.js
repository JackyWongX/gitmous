'use strict';

const blessed = require('blessed');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { COLORS } = require('./theme');
const { createState } = require('./state');
const { createLayout } = require('./ui/layout');

class GitUiApp {
  constructor() {
    if (!process.env.TERM) process.env.TERM = 'xterm-256color';

    this.blessed = blessed;
    this.execFile = execFile;
    this.spawn = spawn;
    this.fs = fs;
    this.path = path;
    this.COLORS = COLORS;
    this.state = createState();
    this.reportingUnhandledError = false;
    this.activeDropdownMenu = null;
    this.activeDropdownOutsideHandler = null;
    this.activeTooltip = null;
    this.activeTooltipAnchor = null;
    this.autoRefreshTimer = null;
    this.autoRefreshRunning = false;
    this.commitInputActive = false;

    createLayout(this);
    this.bindEvents();
    this.startAutoRefresh();
  }

  bindEvents() {
    this.refreshButton.on('press', () => this.perform('刷新', () => this.refreshRepo(), false));
    this.actionButton.on('press', () => this.actionMenu(this.actionButton));
    this.exitButton.on('press', () => { this.screen.destroy(); process.exit(0); });
    this.screenExitButton.on('press', () => { this.screen.destroy(); process.exit(0); });
    this.repoHeader.on('press', () => this.toggleSection('repositories'));
    this.commitHeader.on('press', () => this.toggleSection('commit'));
    this.changeHeader.on('press', () => this.toggleSection('changes'));
    this.historyHeader.on('press', () => this.toggleSection('history'));
    this.commitInput.on('keypress', () => setImmediate(() => this.resizeCommitInput()));
    this.commitInput.on('focus', () => { this.updateCommitPlaceholder(); this.screen.render(); });
    this.commitInput.on('blur', () => { this.updateCommitPlaceholder(); this.screen.render(); });
    this.repoAddButton.on('press', () => this.inputDialog('添加仓库', '输入或粘贴 Git 仓库目录的完整路径', async directory => {
      const root = await this.findGitRoot(directory);
      if (!root) { this.toast('该目录不是 Git 仓库', this.COLORS.red); return; }
      if (!this.state.roots.includes(root)) this.state.roots.push(root);
      await this.selectRepo(root);
    }));
    this.commitButton.on('press', () => this.handleCommitButton());

    this.screen.on('resize', () => { this.reflowLeftPanel(); this.screen.render(); });
    this.screen.on('mouse', data => this.activateCommitInputIfInside(data));
    this.screen.on('mouse', data => this.releaseCommitInputIfOutside(data));
    this.screen.on('mouse', data => this.handleScrollableWheel(data));
    this.screen.on('keypress', (ch, key) => this.handleCommitInputKey(ch, key));
    this.screen.key(['C-c'], () => { this.screen.destroy(); process.exit(0); });
    process.on('uncaughtException', error => this.reportUnhandledError(error));
    process.on('unhandledRejection', error => this.reportUnhandledError(error));
  }

  async bootstrap() {
    this.reflowLeftPanel();
    const supplied = process.argv[2] ? this.path.resolve(process.argv[2]) : process.cwd();
    this.state.startDirectory = supplied;
    const currentRoot = await this.findGitRoot(supplied);
    this.state.startDirectoryIsGit = Boolean(currentRoot);
    this.state.roots = await this.discoverRepositories(supplied);
    if (!this.state.roots.length) {
      this.renderAll();
      this.detailPanel.setContent(` 当前目录不是 Git 仓库：${supplied}\n\n可以在左侧“存储库”区域点击“初始化仓库”或“从远程分支克隆”。`);
      this.screen.render();
      return;
    }
    const defaultRoot = currentRoot
      ? (this.state.roots.find(root => this.samePath(root, currentRoot)) || currentRoot)
      : this.state.roots[0];
    await this.selectRepo(defaultRoot, { silentSuccess: true });
  }

  run() {
    this.bootstrap().catch(error => {
      this.detailPanel.setContent(`初始化失败：${error.message}`);
      this.screen.render();
    });
  }

  startAutoRefresh() {
    if (this.autoRefreshTimer) return;
    this.autoRefreshTimer = setInterval(() => {
      this.checkAutoRefresh().catch(() => {});
    }, 2000);
    if (typeof this.autoRefreshTimer.unref === 'function') this.autoRefreshTimer.unref();
  }

  async checkAutoRefresh() {
    if (!this.state.repo || this.state.busy || this.autoRefreshRunning) return;
    this.autoRefreshRunning = true;
    try {
      const signature = await this.readRepoSignature();
      if (signature && signature !== this.state.repoSignature) {
        await this.refreshRepo();
      }
    } finally {
      this.autoRefreshRunning = false;
    }
  }
}

Object.assign(
  GitUiApp.prototype,
  require('./modules/core'),
  require('./modules/git'),
  require('./modules/commit'),
  require('./modules/repositories'),
  require('./modules/changes'),
  require('./modules/history'),
  require('./modules/menus')
);

module.exports = { GitUiApp };
