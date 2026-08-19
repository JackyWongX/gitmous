'use strict';

module.exports = {
  currentLocalBranch() {
    if (!this.state.branch || this.state.branch === '(分离 HEAD)') return '';
    return this.state.branch;
  },

  async publishCurrentBranch(anchor = this.commitButton) {
    const branch = this.currentLocalBranch();
    if (!branch) {
      this.toast('当前不是本地分支，无法发布分支', this.COLORS.yellow);
      return;
    }
    const remotes = this.state.remotes.length ? this.state.remotes : (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    if (!remotes.length) {
      this.inputDialog('发布分支', '输入或粘贴远程仓库地址，例如 https://example.com/repo.git', url => this.perform('发布分支', async () => {
        await this.git(['remote', 'add', 'origin', url]);
        await this.git(['push', '-u', 'origin', branch]);
      }));
      return;
    }
    if (remotes.length === 1) {
      await this.perform('发布分支', () => this.git(['push', '-u', remotes[0], branch]));
      return;
    }
    this.showMenu('选择远程仓库', remotes.map(remote => ({
      label: `发布到 ${this.escapeTags(remote)}/${this.escapeTags(branch)}`,
      action: () => this.perform('发布分支', () => this.git(['push', '-u', remote, branch]))
    })), anchor);
  },

  async pushCurrentBranch() {
    await this.perform('推送', () => this.git(['push']));
  },

  async pullCurrentBranch() {
    await this.perform('拉取', () => this.git(['pull', '--no-rebase']));
  },

  networkMenu(anchor) {
    this.showMenu('网络操作', [
      { label: '拉取  git pull --no-rebase', action: () => this.perform('拉取', () => this.git(['pull', '--no-rebase'])) },
      { label: '推送  git push', action: () => this.perform('推送', () => this.git(['push'])) },
      { label: '抓取  git fetch --prune', action: () => this.perform('抓取', () => this.git(['fetch', '--prune'])) },
      { label: '发布当前分支到 origin', action: () => this.perform('发布分支', () => this.git(['push', '-u', 'origin', this.state.branch])) }
    ], anchor);
  },

  async localBranches() {
    return (await this.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  },

  async remoteBranches() {
    return (await this.git(['for-each-ref', '--format=%(refname)', 'refs/remotes']).catch(() => ''))
      .split(/\r?\n/)
      .filter(name => name && !name.endsWith('/HEAD') && name.startsWith('refs/remotes/'))
      .map(name => name.replace(/^refs\/remotes\//, ''))
      .filter(name => name.includes('/'));
  },

  async switchRemoteBranch(remoteBranch, localBranches) {
    const localName = remoteBranch.replace(/^[^/]+\//, '');
    if (!localName || localName === remoteBranch) {
      await this.perform(`切换到 ${remoteBranch}`, () => this.git(['switch', '--detach', remoteBranch]));
      return;
    }
    if (localBranches.includes(localName)) {
      await this.perform(`切换到 ${localName}`, () => this.git(['switch', localName]));
      return;
    }
    await this.perform(`切换到 ${localName}`, () => this.git(['switch', '--track', '-c', localName, remoteBranch]));
  },

  createLocalBranch() {
    this.textDialog('创建本地分支', '输入新本地分支名', name => this.perform(`创建本地分支 ${name}`, () => this.git(['switch', '-c', name])));
  },

  async createRemoteBranch(anchor, localBranches) {
    this.textDialog('创建远程分支', '输入新远程分支名', async name => {
      const remotes = this.state.remotes.length ? this.state.remotes : (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
      const publish = remote => this.perform(`创建远程分支 ${remote}/${name}`, async () => {
        if (!localBranches.includes(name)) await this.git(['switch', '-c', name]);
        else if (this.state.branch !== name) await this.git(['switch', name]);
        await this.git(['push', '-u', remote, name]);
      });
      if (!remotes.length) {
        this.inputDialog('远程仓库地址', '输入或粘贴远程仓库地址，例如 https://example.com/repo.git', async url => {
          await this.perform('添加远程仓库', () => this.git(['remote', 'add', 'origin', url]), true, { silentSuccess: true });
          await publish('origin');
        });
        return;
      }
      if (remotes.length === 1) {
        await publish(remotes[0]);
        return;
      }
      this.showMenu('选择远程仓库', remotes.map(remote => ({
        label: `创建 ${this.escapeTags(remote)}/${this.escapeTags(name)}`,
        action: () => publish(remote)
      })), anchor);
    });
  },

  async branchSwitchMenu(anchor) {
    const [branches, remotes] = await Promise.all([this.localBranches(), this.remoteBranches()]);
    const entries = [
      { type: 'header', label: '本地分支' },
      ...(branches.length
        ? branches.map(name => ({
          label: `${name === this.state.branch ? '{green-fg}●{/green-fg}' : ' '} ${this.escapeTags(name)}`,
          action: () => name === this.state.branch ? this.toast('已在当前分支') : this.perform(`切换到 ${name}`, () => this.git(['switch', name]))
        }))
        : [{ label: '{gray-fg}没有本地分支{/gray-fg}', action: () => {} }]),
      { label: '{green-fg}+{/green-fg} 创建本地分支', action: () => this.createLocalBranch() },
      { type: 'separator', label: '' },
      { type: 'header', label: '远程分支' },
      ...(remotes.length
        ? remotes.map(name => ({
          label: `  {red-fg}☁ {/red-fg} ${this.escapeTags(name)}`,
          action: () => this.switchRemoteBranch(name, branches)
        }))
        : [{ label: '{gray-fg}没有远程分支{/gray-fg}', action: () => {} }]),
      { label: '{green-fg}+{/green-fg} 创建远程分支', action: menuAnchor => this.createRemoteBranch(menuAnchor, branches) }
    ];
    this.showMenu('分支管理', entries, anchor);
  },

  async branchMenu(anchor) {
    const branches = await this.localBranches();
    this.showMenu('分支管理', [
      { label: '新建分支', action: () => this.textDialog('新建分支', '通过屏幕软键盘输入分支名', name => this.perform('创建分支', () => this.git(['switch', '-c', name]))) },
      { label: '合并分支', action: menuAnchor => this.mergeMenu(branches, menuAnchor) },
      { label: '删除分支', action: menuAnchor => this.deleteBranchMenu(branches, menuAnchor) },
      ...branches.map(name => ({ label: `${name === this.state.branch ? '{green-fg}●{/green-fg} ' : '○ '}切换到 ${this.escapeTags(name)}`, action: () => name === this.state.branch ? this.toast('已在当前分支') : this.perform(`切换到 ${name}`, () => this.git(['switch', name])) }))
    ], anchor);
  },

  mergeMenu(branches, anchor) {
    const options = branches.filter(name => name !== this.state.branch).map(name => ({ label: `合并 ${this.escapeTags(name)} 到 ${this.escapeTags(this.state.branch)}`, action: () => this.confirm('合并分支', `将 ${name} 合并到 ${this.state.branch}，确定继续吗？`, () => this.perform('合并分支', () => this.git(['merge', '--no-edit', name]))) }));
    this.showMenu('选择要合并的分支', options.length ? options : [{ label: '没有可合并的其他本地分支', action: () => {} }], anchor);
  },

  deleteBranchMenu(branches, anchor) {
    const options = branches.filter(name => name !== this.state.branch).map(name => ({ label: `{red-fg}删除{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm('删除分支', `删除本地分支 ${name} 吗？未合并的提交会阻止删除。`, () => this.perform('删除分支', () => this.git(['branch', '-d', name]))) }));
    this.showMenu('选择要删除的分支', options.length ? options : [{ label: '当前没有可删除的其他本地分支', action: () => {} }], anchor);
  },

  async stashMenu(anchor) {
    const stashes = (await this.git(['stash', 'list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu('储藏', [
      { label: '储藏当前更改', action: () => this.textDialog('储藏当前更改', '输入储藏说明', message => this.perform('储藏', () => this.git(['stash', 'push', '-m', message]))) },
      { label: '应用最新储藏', action: () => this.perform('应用储藏', () => this.git(['stash', 'pop'])) },
      ...stashes.map((stash, index) => ({ label: `{yellow-fg}${this.escapeTags(stash)}{/yellow-fg}`, action: menuAnchor => this.stashDetailMenu(index, stash, menuAnchor) }))
    ], anchor);
  },

  stashDetailMenu(index, stash, anchor) {
    this.showMenu(`储藏 ${index}`, [
      { label: '查看差异', action: async () => { const diff = await this.git(['stash', 'show', '-p', `stash@{${index}}`]); this.detailPanel.setContent(this.formatDiff(diff)); this.detailPanel.setLabel(` 储藏：${index} `); this.screen.render(); } },
      { label: '应用但保留', action: () => this.perform('应用储藏', () => this.git(['stash', 'apply', `stash@{${index}}`])) },
      { label: '弹出并删除', action: () => this.perform('弹出储藏', () => this.git(['stash', 'pop', `stash@{${index}}`])) },
      { label: '{red-fg}删除储藏{/red-fg}', action: () => this.confirm('删除储藏', `删除 ${stash} 吗？`, () => this.perform('删除储藏', () => this.git(['stash', 'drop', `stash@{${index}}`]))) }
    ], anchor);
  },

  async tagMenu(anchor) {
    const tags = (await this.git(['tag', '--list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu('标签', [
      { label: '新建轻量标签（当前 HEAD）', action: () => this.textDialog('新建标签', '输入标签名，例如 v1.0.0', name => this.perform('创建标签', () => this.git(['tag', name]))) },
      ...tags.map(name => ({ label: `{red-fg}删除{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm('删除标签', `删除本地标签 ${name} 吗？`, () => this.perform('删除标签', () => this.git(['tag', '-d', name]))) }))
    ], anchor);
  },

  async remoteMenu(anchor) {
    const names = (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu('远程仓库', [
      { label: '添加远程仓库', action: () => this.textDialog('远程名称', '例如 origin', name => this.textDialog('远程地址', '例如 https://example.com/repo.git', url => this.perform('添加远程', () => this.git(['remote', 'add', name, url])))) },
      ...names.map(name => ({ label: `查看 ${this.escapeTags(name)}`, action: async () => { const url = await this.git(['remote', 'get-url', name]); this.detailPanel.setLabel(' 远程仓库 '); this.detailPanel.setContent(`${name}\n${url}`); this.screen.render(); } })),
      ...names.map(name => ({ label: `{red-fg}删除远程{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm('删除远程', `删除远程 ${name} 吗？`, () => this.perform('删除远程', () => this.git(['remote', 'remove', name]))) }))
    ], anchor);
  },

  actionMenu(anchor) {
    this.showMenu('Git 操作', [
      { label: '{cyan-fg}网络：拉取、推送、抓取{/cyan-fg}', action: menuAnchor => this.networkMenu(menuAnchor) },
      { label: '{green-fg}分支：新建、切换、合并、删除{/green-fg}', action: menuAnchor => this.branchMenu(menuAnchor) },
      { label: '{yellow-fg}储藏：保存、应用、删除{/yellow-fg}', action: menuAnchor => this.stashMenu(menuAnchor) },
      { label: '{purple-fg}标签：创建、删除{/purple-fg}', action: menuAnchor => this.tagMenu(menuAnchor) },
      { label: '远程仓库：添加、查看、删除', action: menuAnchor => this.remoteMenu(menuAnchor) },
      { label: '{red-fg}撤销最近一次提交（保留暂存区）{/red-fg}', action: () => this.confirm('撤销提交', '将使用 git reset --soft HEAD~1，提交会被撤销但内容保留在暂存区。', () => this.perform('撤销提交', () => this.git(['reset', '--soft', 'HEAD~1']))) }
    ], anchor);
  },

  repositoryMenu(anchor) {
    this.showMenu('存储库', [
      { label: '刷新当前存储库', action: () => this.perform('刷新', () => this.refreshRepo(), false) },
      { label: '查看当前存储库路径', action: () => { this.detailPanel.setLabel(' 存储库路径 '); this.detailPanel.setContent(this.escapeTags(this.state.repo || '未选择')); this.screen.render(); } }
    ], anchor);
  }
};
