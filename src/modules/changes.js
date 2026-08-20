'use strict';

module.exports = {
  statusMarker(code) {
    if (this.isConflictStatusCode(code)) return { label: '!', tag: 'red-fg' };
    if (code === '??' || code.includes('A')) return { label: 'A', tag: 'green-fg' };
    if (code.includes('D')) return { label: 'D', tag: 'red-fg' };
    if (code.includes('R')) return { label: 'R', tag: 'magenta-fg' };
    return { label: 'M', tag: 'yellow-fg' };
  },

  isConflictStatusCode(code) {
    return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code);
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
    const conflicted = mode === 'conflicted';
    const actionButtons = [];
    const rowStates = [];
    const headingRight = conflicted ? 3 : (staged ? 3 : 6);
    const heading = this.button({ parent: this.changeContent, top, left: 0, right: headingRight, height: 1, shrink: false, tags: true, content: `${this.sectionCaption(folded, title)} {gray-fg}(${files.length}){/gray-fg}` });
    heading.on('press', () => {
      this.state.collapsed[mode] = !this.state.collapsed[mode];
      this.renderChanges();
      this.screen.render();
    });
    if (conflicted) {
      const abortMerge = this.button({ parent: this.changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: 'x', style: this.iconStyle });
      actionButtons.push(abortMerge);
      this.bindTooltip(abortMerge, () => this.t('abortMergeTooltip'));
      abortMerge.on('press', () => this.abortMergeWithConfirm());
    } else if (staged) {
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
      const actionRight = conflicted ? 9 : (staged ? 3 : 6);
      const main = this.button({ parent: this.changeContent, top: row, left: 2, right: actionRight, height: 1, shrink: false, padding: { left: 0, right: 0 }, tags: true, content: `{${marker.tag}}${marker.label}{/${marker.tag}}  ${this.escapeTags(item.file)}` });
      rowElements.push(main);
      this.bindTooltip(main, () => this.t('viewFileDiffTooltip', { file: item.file }));
      main.on('press', () => this.showFileDiff(item, staged));
      if (conflicted) {
        const oursButton = this.button({ parent: this.changeContent, top: row, right: 6, width: 3, height: 1, shrink: false, content: 'O', style: this.iconStyle });
        const theirsButton = this.button({ parent: this.changeContent, top: row, right: 3, width: 3, height: 1, shrink: false, content: 'T', style: this.iconStyle });
        const resolvedButton = this.button({ parent: this.changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '✓', style: this.iconStyle });
        rowElements.push(oursButton, theirsButton, resolvedButton);
        this.bindTooltip(oursButton, () => this.t('acceptOursTooltip', { file: item.file }));
        this.bindTooltip(theirsButton, () => this.t('acceptTheirsTooltip', { file: item.file }));
        this.bindTooltip(resolvedButton, () => this.t('markResolvedTooltip', { file: item.file }));
        oursButton.on('press', () => this.resolveConflictWithConfirm(item.file, 'ours'));
        theirsButton.on('press', () => this.resolveConflictWithConfirm(item.file, 'theirs'));
        resolvedButton.on('press', () => this.markConflictResolvedWithConfirm(item.file));
      } else if (staged) {
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
    if (this.state.status.conflicted.length) top = this.addFileGroup(this.t('conflicts'), this.state.status.conflicted, 'conflicted', top);
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
      file: item.file,
      staged: Boolean(staged),
      conflicted: this.isConflictStatusCode(item.code),
      label: () => this.t('diffLabel', { file: item.file }),
      collapsedArgs: [...baseArgs, '--', item.file],
      expandedArgs: [...baseArgs, '--unified=999999', '--', item.file]
    });
  },

  async refreshCurrentFileDiff() {
    const file = this.detailDiffView && this.detailDiffView.file;
    if (!file) return;
    const sameFile = item => item && item.file === file;
    const conflicted = this.state.status.conflicted.find(sameFile);
    if (conflicted) {
      await this.showFileDiff(conflicted, false);
      return;
    }
    const unstaged = this.state.status.unstaged.find(sameFile) || this.state.status.untracked.find(sameFile);
    if (unstaged) {
      await this.showFileDiff(unstaged, false);
      return;
    }
    const staged = this.state.status.staged.find(sameFile);
    if (staged) {
      await this.showFileDiff(staged, true);
      return;
    }
    this.state.selected = null;
    this.setDetailText(null, this.t('helpDetail'));
    this.screen.render();
  },

  resolveConflictWithConfirm(file, side) {
    const title = side === 'ours' ? this.t('acceptOurs') : this.t('acceptTheirs');
    this.confirm(
      title,
      this.t(side === 'ours' ? 'acceptOursConfirm' : 'acceptTheirsConfirm', { file }),
      async () => {
        await this.perform(title, async () => {
          await this.git(['checkout', side === 'ours' ? '--ours' : '--theirs', '--', file]);
          await this.git(['add', '--', file]);
        });
        await this.refreshCurrentFileDiff();
      }
    );
  },

  markConflictResolvedWithConfirm(file) {
    this.confirm(
      this.t('markResolved'),
      this.t('markResolvedConfirm', { file }),
      async () => {
        await this.perform(this.t('markResolved'), () => this.git(['add', '--', file]));
        await this.refreshCurrentFileDiff();
      }
    );
  },

  abortMergeWithConfirm() {
    this.confirm(
      this.t('abortMerge'),
      this.t('abortMergeConfirm'),
      async () => {
        await this.perform(this.t('abortMerge'), () => this.git(['merge', '--abort']));
        this.state.selected = null;
        this.setDetailText(null, this.t('helpDetail'));
        this.screen.render();
      }
    );
  },

  repoFilePath(file) {
    const target = this.path.resolve(this.state.repo, file);
    const repoRoot = this.path.resolve(this.state.repo);
    const normalizedTarget = this.normalizePath(target);
    const normalizedRoot = this.normalizePath(repoRoot);
    if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${this.path.sep}`)) {
      throw new Error(this.t('invalidFilePath', { file }));
    }
    return target;
  },

  splitTextPreserveEnd(value) {
    const text = String(value || '');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const hasFinalEol = text.endsWith('\n');
    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    if (hasFinalEol) lines.pop();
    return { lines, eol, hasFinalEol };
  },

  conflictBlockForLine(lines, lineNumber) {
    const target = Number(lineNumber);
    if (!target || target < 1) return null;
    let start = -1;
    let base = -1;
    let separator = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.startsWith('<<<<<<<')) {
        start = index;
        base = -1;
        separator = -1;
        continue;
      }
      if (start !== -1 && line.startsWith('|||||||')) {
        base = index;
        continue;
      }
      if (start !== -1 && line.startsWith('=======')) {
        separator = index;
        continue;
      }
      if (start !== -1 && separator !== -1 && line.startsWith('>>>>>>>')) {
        const end = index;
        if (target >= start + 1 && target <= end + 1) {
          let section = 'marker';
          const oursEnd = base !== -1 ? base : separator;
          if (target > start + 1 && target < oursEnd + 1) section = 'ours';
          else if (base !== -1 && target > base + 1 && target < separator + 1) section = 'base';
          else if (target > separator + 1 && target < end + 1) section = 'theirs';
          return { start, base, separator, end, section };
        }
        start = -1;
        base = -1;
        separator = -1;
      }
    }
    return null;
  },

  hasConflictMarkers(lines) {
    return lines.some(line => line.startsWith('<<<<<<<') || line.startsWith('|||||||') || line.startsWith('=======') || line.startsWith('>>>>>>>'));
  },

  conflictChoiceSide(block, action) {
    if (block.section === 'base') return null;
    if (action === 'acceptCurrent') return block.section === 'theirs' ? 'theirs' : 'ours';
    if (action === 'discardCurrent') return block.section === 'theirs' ? 'ours' : 'theirs';
    return action;
  },

  async applyConflictBlockChoice(file, lineNumber, action) {
    const target = this.repoFilePath(file);
    const text = this.fs.readFileSync(target, 'utf8');
    const parsed = this.splitTextPreserveEnd(text);
    const block = this.conflictBlockForLine(parsed.lines, lineNumber);
    if (!block) {
      throw new Error(this.t('noConflictBlockAtLine'));
    }
    const side = this.conflictChoiceSide(block, action);
    if (!side) {
      throw new Error(this.t('cannotChooseBaseConflict'));
    }
    const selected = side === 'ours'
      ? parsed.lines.slice(block.start + 1, block.base !== -1 ? block.base : block.separator)
      : parsed.lines.slice(block.separator + 1, block.end);
    const nextLines = [
      ...parsed.lines.slice(0, block.start),
      ...selected,
      ...parsed.lines.slice(block.end + 1)
    ];
    let nextText = nextLines.join(parsed.eol);
    if (parsed.hasFinalEol) nextText += parsed.eol;
    this.fs.writeFileSync(target, nextText, 'utf8');
    if (!this.hasConflictMarkers(nextLines)) await this.git(['add', '--', file]);
  },

  conflictLineNumber(meta) {
    return meta && (meta.newLine || meta.oldLine);
  },

  acceptCurrentDiffChange(meta) {
    if (this.detailDiffView && !this.detailDiffView.conflicted) {
      this.stageCurrentDiffHunk(meta);
      return;
    }
    const file = this.detailDiffView && this.detailDiffView.file;
    if (!file) return;
    const line = this.conflictLineNumber(meta);
    this.hideDiffLineToolbar();
    this.confirm(
      this.t('acceptCurrentChange'),
      this.t('acceptCurrentChangeConfirm', { file, line }),
      async () => {
        await this.perform(this.t('acceptCurrentChange'), () => this.applyConflictBlockChoice(file, line, 'acceptCurrent'));
        await this.refreshCurrentFileDiff();
      }
    );
  },

  discardCurrentDiffChange(meta) {
    if (this.detailDiffView && !this.detailDiffView.conflicted) {
      this.discardCurrentDiffHunk(meta);
      return;
    }
    const file = this.detailDiffView && this.detailDiffView.file;
    if (!file) return;
    const line = this.conflictLineNumber(meta);
    this.hideDiffLineToolbar();
    this.confirm(
      this.t('discardCurrentChange'),
      this.t('discardCurrentChangeConfirm', { file, line }),
      async () => {
        await this.perform(this.t('discardCurrentChange'), () => this.applyConflictBlockChoice(file, line, 'discardCurrent'));
        await this.refreshCurrentFileDiff();
      }
    );
  },

  gitWithInput(args, input) {
    if (!this.state.repo) return Promise.reject(new Error(this.t('noRepoSelected')));
    return new Promise((resolve, reject) => {
      const child = this.spawn('git', ['-C', this.state.repo, ...args], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve(stdout);
        else reject(new Error((stderr || stdout || this.t('gitExitCode', { code })).trim().replace(/^fatal: /m, '')));
      });
      child.stdin.end(input, 'utf8');
    });
  },

  diffHunkPatchForMeta(meta) {
    const raw = String(this.detailDiffRaw || '');
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const rawIndex = Number(meta && meta.rawIndex);
    if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= lines.length) {
      throw new Error(this.t('noDiffHunkAtLine'));
    }
    let hunkStart = rawIndex;
    while (hunkStart >= 0 && !/^@@\s/.test(lines[hunkStart])) hunkStart -= 1;
    if (hunkStart < 0) throw new Error(this.t('noDiffHunkAtLine'));

    let fileStart = hunkStart;
    while (fileStart > 0 && !/^diff --git /.test(lines[fileStart - 1])) fileStart -= 1;
    let hunkEnd = hunkStart + 1;
    while (hunkEnd < lines.length && !/^@@\s/.test(lines[hunkEnd]) && !/^diff --git /.test(lines[hunkEnd])) hunkEnd += 1;

    const headerLines = lines.slice(fileStart, hunkStart).filter(line => (
      /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to)/.test(line)
    ));
    if (!headerLines.some(line => /^--- /.test(line)) || !headerLines.some(line => /^\+\+\+ /.test(line))) {
      throw new Error(this.t('noDiffHunkAtLine'));
    }
    return [...headerLines, ...lines.slice(hunkStart, hunkEnd)].join('\n') + '\n';
  },

  async refreshDetailDiffAfterHunk() {
    await this.refreshCurrentFileDiff();
  },

  async stageCurrentDiffHunk(meta) {
    if (!this.detailDiffView || this.detailDiffView.staged || this.detailDiffView.conflicted) return;
    this.hideDiffLineToolbar();
    await this.perform(this.t('stageDiffHunk'), async () => {
      const patch = this.diffHunkPatchForMeta(meta);
      await this.gitWithInput(['apply', '--cached', '--recount', '--whitespace=nowarn', '-'], patch);
    });
    await this.refreshDetailDiffAfterHunk();
  },

  discardCurrentDiffHunk(meta) {
    if (!this.detailDiffView || this.detailDiffView.staged || this.detailDiffView.conflicted) return;
    const file = this.detailDiffView.file;
    this.hideDiffLineToolbar();
    this.confirm(
      this.t('discardDiffHunk'),
      this.t('discardDiffHunkConfirm', { file }),
      async () => {
        await this.perform(this.t('discardDiffHunk'), async () => {
          const patch = this.diffHunkPatchForMeta(meta);
          await this.gitWithInput(['apply', '--reverse', '--recount', '--whitespace=nowarn', '-'], patch);
        });
        await this.refreshDetailDiffAfterHunk();
      }
    );
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
    this.updateDetailConflictButtons();
    this.renderRepositories();
    this.renderChanges();
    this.renderHistory();
    if (!this.state.selected) this.setDetailText(null, this.t('helpDetail'));
    this.screen.render();
  }
};
