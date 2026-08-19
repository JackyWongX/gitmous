'use strict';

module.exports = {
  renderHistory() {
    this.clearChildren(this.historyContent);
    let row = 0;
    this.state.history.forEach((commit, index) => {
      const expanded = this.state.expandedHistory.has(commit.hash);
      const remoteBranches = this.state.remoteRefs.get(commit.fullHash) || [];
      const hasRemoteMarker = remoteBranches.length > 0;
      const rightMarker = this.historyRightMarker(remoteBranches, index === 0);
      const markerWidth = rightMarker ? Math.min(36, Math.max(3, this.textWidth(rightMarker) + 1)) : 0;
      const commitButton = this.blessed.box({
        parent: this.historyContent,
        top: row,
        left: 0,
        right: markerWidth ? markerWidth + 1 : 0,
        height: 1,
        tags: true,
        mouse: true,
        content: `${expanded ? '▾' : '▸'} {cyan-fg}${this.escapeTags(commit.hash)}{/cyan-fg} ${this.escapeTags(commit.subject)}`,
        style: { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } }
      });
      if (rightMarker) {
        this.blessed.box({
          parent: this.historyContent,
          top: row,
          right: 0,
          width: markerWidth,
          height: 1,
          tags: true,
          align: 'right',
          content: rightMarker,
          style: { fg: this.COLORS.text, bg: this.COLORS.panel, bold: true }
        });
      }
      commitButton.on('click', data => {
        if (data && data.button === 'right') {
          this.commitContextMenu(commit, this.mouseAnchor(data) || commitButton);
          return;
        }
        this.toggleCommitFiles(commit);
      });
      this.bindTooltip(commitButton, () => this.commitTooltipText(commit, remoteBranches, index === 0), { delay: 300 });
      row += 1;
      if (!expanded) return;

      const files = this.state.historyFiles.get(commit.hash);
      if (files == null) {
        this.blessed.box({ parent: this.historyContent, top: row, left: 2, right: 0, height: 1, tags: true, content: '{gray-fg}加载文件列表...{/gray-fg}', style: { fg: this.COLORS.dim, bg: this.COLORS.panel } });
        row += 1;
        return;
      }
      if (!files.length) {
        this.blessed.box({ parent: this.historyContent, top: row, left: 2, right: 0, height: 1, tags: true, content: '{gray-fg}没有文件变更{/gray-fg}', style: { fg: this.COLORS.dim, bg: this.COLORS.panel } });
        row += 1;
        return;
      }
      files.forEach(fileItem => {
        const marker = this.statusMarker(fileItem.status);
        const renameText = fileItem.oldFile ? ` {gray-fg}${this.escapeTags(fileItem.oldFile)} →{/gray-fg}` : '';
        const fileButton = this.button({
          parent: this.historyContent,
          top: row,
          left: 2,
          right: 0,
          height: 1,
          shrink: false,
          tags: true,
          padding: { left: 0, right: 0 },
          content: `{${marker.tag}}${marker.label}{/${marker.tag}}  ${this.escapeTags(fileItem.file)}${renameText}`,
          style: { fg: this.COLORS.text, bg: this.COLORS.panel, hover: { fg: this.COLORS.text, bg: this.COLORS.panelAlt } }
        });
        this.bindTooltip(fileButton, `查看该提交中的文件差异：${fileItem.file}`);
        fileButton.on('press', () => this.showCommitFileDiff(commit, fileItem));
        row += 1;
      });
    });
    this.historyContent.height = Math.max(1, row);
    this.resetScrollable(this.historyArea);
  },

  async commitTooltipData(commit) {
    const key = commit.fullHash || commit.hash;
    if (!this.commitTooltipCache) this.commitTooltipCache = new Map();
    if (this.commitTooltipCache.has(key)) return this.commitTooltipCache.get(key);
    const raw = await this.git([
      'show',
      '-s',
      '--date=iso-strict',
      '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%D%x1f%B',
      key
    ]).catch(() => '');
    const parts = raw.split('\x1f');
    const data = {
      fullHash: (parts[0] || commit.fullHash || '').trim(),
      shortHash: (parts[1] || commit.hash || '').trim(),
      author: (parts[2] || commit.author || '').trim(),
      email: (parts[3] || '').trim(),
      date: (parts[4] || commit.date || '').trim(),
      refs: (parts[5] || '').trim(),
      message: parts.slice(6).join('\x1f').trim() || commit.subject || '(无提交内容)'
    };
    this.commitTooltipCache.set(key, data);
    return data;
  },

  async commitTooltipText(commit, remoteBranches, isLatestCommit) {
    const data = await this.commitTooltipData(commit);
    const lines = [
      `完整 hash：${data.fullHash || commit.fullHash || commit.hash}`,
      `短 hash：${data.shortHash || commit.hash}`,
      `作者：${data.email ? `${data.author} <${data.email}>` : (data.author || '未知')}`,
      `日期：${data.date || '未知'}`
    ];
    if (isLatestCommit && this.state.branch && this.state.branch !== '(分离 HEAD)') lines.push(`当前分支：@${this.state.branch}`);
    const remoteNames = remoteBranches.filter(name => name.includes('/'));
    if (remoteNames.length) lines.push(`远程分支：${remoteNames.join(', ')}`);
    if (data.refs) lines.push(`引用：${data.refs}`);
    lines.push('');
    lines.push('提交内容：');
    lines.push(...String(data.message || '(无提交内容)').split(/\r?\n/));
    return lines.join('\n');
  },

  historyRightMarker(remoteBranches, isLatestCommit) {
    const parts = [];
    const branchName = this.latestBranchMarker(isLatestCommit);
    if (branchName) parts.push(`{blue-fg}${this.escapeTags(branchName)}{/blue-fg}`);
    const remoteMarker = this.remoteBranchMarker(remoteBranches);
    if (remoteMarker) parts.push(`{red-fg}${this.escapeTags(remoteMarker)}{/red-fg}`);
    return parts.join(' ');
  },

  remoteBranchMarker(remoteBranches) {
    const branchNames = remoteBranches.filter(name => name.includes('/'));
    if (!branchNames.length) return '';
    const label = `☁  ${branchNames.join(', ')}`;
    return label.length > 30 ? `${label.slice(0, 29)}…` : label;
  },

  latestBranchMarker(isLatestCommit) {
    if (!isLatestCommit) return '';
    const branch = this.state.branch;
    if (!branch || branch === '(分离 HEAD)') return '';
    const label = `@${branch}`;
    return label.length > 22 ? `${label.slice(0, 21)}…` : label;
  },

  async showCommit(commit) {
    const detail = await this.git(['show', '--stat', '--patch', '--decorate=short', commit.hash]).catch(error => `无法读取提交：${error.message}`);
    this.setDetailText(` 提交：${commit.hash} `, this.formatDiff(detail));
    this.screen.render();
  },

  async toggleCommitFiles(commit) {
    if (this.state.expandedHistory.has(commit.hash)) {
      this.state.expandedHistory.delete(commit.hash);
      this.renderHistory();
      this.screen.render();
      return;
    }
    this.state.expandedHistory.add(commit.hash);
    if (!this.state.historyFiles.has(commit.hash)) {
      this.state.historyFiles.set(commit.hash, null);
      this.renderHistory();
      this.screen.render();
      const raw = await this.git(['show', '--name-status', '--format=', '--find-renames', commit.hash]).catch(() => '');
      this.state.historyFiles.set(commit.hash, this.parseCommitFiles(raw));
    }
    this.renderHistory();
    this.screen.render();
  },

  async showCommitFileDiff(commit, fileItem) {
    this.state.selected = `${commit.hash}:${fileItem.file}`;
    const paths = fileItem.oldFile ? [fileItem.oldFile, fileItem.file] : [fileItem.file];
    await this.showDetailDiff({
      label: ` ${commit.hash}：${fileItem.file} `,
      collapsedArgs: ['show', '--format=', '--patch', '--find-renames', commit.hash, '--', ...paths],
      expandedArgs: ['show', '--format=', '--patch', '--find-renames', '--unified=999999', commit.hash, '--', ...paths]
    });
  },

  async resolveCommitHash(commit) {
    if (commit.fullHash && commit.fullHash.length >= 40) return commit.fullHash;
    return (await this.git(['rev-parse', commit.hash])).trim();
  },

  commitContextMenu(commit, anchor) {
    const shortHash = commit.hash || (commit.fullHash || '').slice(0, 8);
    this.showMenu(`提交 ${shortHash}`, [
      {
        label: '创建分支',
        action: () => this.textDialog('从提交创建分支', '输入新分支名', async name => {
          const fullHash = await this.resolveCommitHash(commit);
          await this.perform(`创建分支 ${name}`, () => this.git(['branch', name, fullHash]));
        })
      },
      {
        label: '复制hash',
        action: () => this.perform('复制hash', async () => {
          const fullHash = await this.resolveCommitHash(commit);
          await this.writeClipboard(fullHash);
        }, false)
      },
      {
        label: '复制提交内容',
        action: () => this.perform('复制提交内容', async () => {
          const fullHash = await this.resolveCommitHash(commit);
          const content = await this.git(['show', '--stat', '--patch', '--decorate=full', '--find-renames', fullHash]);
          await this.writeClipboard(content);
        }, false)
      },
      {
        label: '{red-fg}还原到当前{/red-fg}',
        action: async () => {
          const fullHash = await this.resolveCommitHash(commit);
          this.confirm(
            '还原到当前提交',
            `这会执行 git reset --hard ${fullHash}\n\n当前分支会回退到该提交；该提交之后的提交会从当前分支历史中移除，已跟踪文件的未提交修改也会丢失。\n\n确定继续吗？`,
            () => this.perform('还原到当前提交', () => this.git(['reset', '--hard', fullHash]))
          );
        }
      }
    ], anchor);
  }
};
