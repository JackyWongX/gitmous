'use strict';

module.exports = {
  currentLocalBranch() {
    if (!this.state.branch || this.isDetachedBranchName(this.state.branch)) return '';
    return this.state.branch;
  },

  async publishCurrentBranch(anchor = this.commitButton) {
    const branch = this.currentLocalBranch();
    if (!branch) {
      this.toast(this.t('noLocalBranchPublish'), this.COLORS.yellow);
      return;
    }
    const remotes = this.state.remotes.length ? this.state.remotes : (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    if (!remotes.length) {
      this.inputDialog(this.t('publishBranch'), this.t('remoteUrlPlaceholder'), url => this.perform(this.t('publishBranch'), async () => {
        await this.git(['remote', 'add', 'origin', url]);
        await this.git(['push', '-u', 'origin', branch]);
      }, true, { progress: true }));
      return;
    }
    if (remotes.length === 1) {
      await this.perform(this.t('publishBranch'), () => this.git(['push', '-u', remotes[0], branch]), true, { progress: true });
      return;
    }
    this.showMenu(this.t('selectRemote'), remotes.map(remote => ({
      label: this.t('publishTo', { remote: this.escapeTags(remote), branch: this.escapeTags(branch) }),
      action: () => this.perform(this.t('publishBranch'), () => this.git(['push', '-u', remote, branch]), true, { progress: true })
    })), anchor);
  },

  async pushCurrentBranch() {
    await this.perform(this.t('pushAction'), () => this.git(['push']), true, { progress: true });
  },

  async pullCurrentBranch() {
    await this.perform(this.t('pullAction'), () => this.git(['pull', '--no-rebase']), true, { progress: true });
  },

  networkMenu(anchor) {
    this.showMenu(this.t('networkActions'), [
      { label: this.t('pullMenu'), action: () => this.perform(this.t('pullAction'), () => this.git(['pull', '--no-rebase']), true, { progress: true }) },
      { label: this.t('pushMenu'), action: () => this.perform(this.t('pushAction'), () => this.git(['push']), true, { progress: true }) },
      { label: this.t('fetchMenu'), action: () => this.perform(this.t('fetchAction'), () => this.git(['fetch', '--prune'])) },
      { label: this.t('publishCurrentToOrigin'), action: () => this.perform(this.t('publishBranch'), () => this.git(['push', '-u', 'origin', this.state.branch]), true, { progress: true }) }
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
      await this.perform(this.t('switchTo', { name: remoteBranch }), () => this.git(['switch', '--detach', remoteBranch]));
      return;
    }
    if (localBranches.includes(localName)) {
      await this.perform(this.t('switchTo', { name: localName }), () => this.git(['switch', localName]));
      return;
    }
    await this.perform(this.t('switchTo', { name: localName }), () => this.git(['switch', '--track', '-c', localName, remoteBranch]));
  },

  createLocalBranch() {
    this.textDialog(this.t('createLocalBranch'), this.t('newLocalBranchPlaceholder'), name => this.perform(this.t('createLocalBranch') + ` ${name}`, () => this.git(['switch', '-c', name])));
  },

  async createRemoteBranch(anchor, localBranches) {
    this.textDialog(this.t('createRemoteBranch'), this.t('newRemoteBranchPlaceholder'), async name => {
      const remotes = this.state.remotes.length ? this.state.remotes : (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
      const publish = remote => this.perform(this.t('createRemoteBranchAt', { name: `${remote}/${name}` }), async () => {
        if (!localBranches.includes(name)) await this.git(['switch', '-c', name]);
        else if (this.state.branch !== name) await this.git(['switch', name]);
        await this.git(['push', '-u', remote, name]);
      });
      if (!remotes.length) {
        this.inputDialog(this.t('remoteAddress'), this.t('remoteUrlPlaceholder'), async url => {
          await this.perform(this.t('addRemoteRepository'), () => this.git(['remote', 'add', 'origin', url]), true, { silentSuccess: true });
          await publish('origin');
        });
        return;
      }
      if (remotes.length === 1) {
        await publish(remotes[0]);
        return;
      }
      this.showMenu(this.t('selectRemote'), remotes.map(remote => ({
        label: this.t('createRemoteAt', { remote: this.escapeTags(remote), name: this.escapeTags(name) }),
        action: () => publish(remote)
      })), anchor);
    });
  },

  mergeBranchIntoCurrent(sourceBranch) {
    const targetBranch = this.currentLocalBranch();
    if (!targetBranch) {
      this.toast(this.t('noLocalBranchPublish'), this.COLORS.yellow);
      return;
    }
    if (sourceBranch === targetBranch) {
      this.toast(this.t('cannotMergeCurrentBranch'), this.COLORS.yellow);
      return;
    }
    this.confirm(
      this.t('mergeBranch'),
      this.t('mergeBranchDetailConfirm', { source: sourceBranch, target: targetBranch }),
      () => this.perform(this.t('mergeBranch'), () => this.git(['merge', '--no-commit', '--no-ff', sourceBranch]))
    );
  },

  deleteLocalBranchWithConfirm(branchName) {
    if (branchName === this.state.branch) {
      this.toast(this.t('cannotDeleteCheckedOutBranch'), this.COLORS.yellow);
      return;
    }
    this.confirm(
      this.t('deleteBranch'),
      this.t('deleteBranchDetailConfirm', { name: branchName }),
      () => this.perform(this.t('deleteBranch'), () => this.git(['branch', '-d', branchName]))
    );
  },

  mergeRemoteBranchIntoCurrent(remoteBranch) {
    const targetBranch = this.currentLocalBranch();
    if (!targetBranch) {
      this.toast(this.t('noLocalBranchPublish'), this.COLORS.yellow);
      return;
    }
    this.confirm(
      this.t('mergeBranch'),
      this.t('mergeRemoteBranchDetailConfirm', { source: remoteBranch, target: targetBranch }),
      () => this.perform(this.t('mergeBranch'), () => this.git(['merge', '--no-commit', '--no-ff', remoteBranch]))
    );
  },

  remoteBranchParts(remoteBranch) {
    const match = String(remoteBranch || '').match(/^([^/]+)\/(.+)$/);
    if (!match) return null;
    return { remote: match[1], branch: match[2] };
  },

  deleteRemoteBranchWithConfirm(remoteBranch) {
    const parts = this.remoteBranchParts(remoteBranch);
    if (!parts) {
      this.toast(this.t('invalidRemoteBranchName', { name: remoteBranch }), this.COLORS.red);
      return;
    }
    this.confirm(
      this.t('deleteRemoteBranch'),
      this.t('deleteRemoteBranchDetailConfirm', { remote: parts.remote, branch: parts.branch, name: remoteBranch }),
      () => this.perform(this.t('deleteRemoteBranch'), () => this.git(['push', parts.remote, '--delete', parts.branch]))
    );
  },

  async branchSwitchMenu(anchor) {
    const [branches, remotes] = await Promise.all([this.localBranches(), this.remoteBranches()]);
    const entries = [
      { type: 'header', label: this.t('localBranches') },
      ...(branches.length
        ? branches.map(name => ({
          type: name === this.state.branch ? 'branchCurrent' : 'localBranch',
          label: `${name === this.state.branch ? '{green-fg}●{/green-fg}' : ' '} ${this.escapeTags(name)}`,
          action: () => name === this.state.branch ? this.toast(this.t('alreadyCurrentBranch')) : this.perform(this.t('switchTo', { name }), () => this.git(['switch', name])),
          mergeTooltip: () => name === this.state.branch
            ? this.t('cannotMergeCurrentBranch')
            : this.t('mergeBranchButtonTooltip', { source: name, target: this.state.branch }),
          deleteTooltip: () => name === this.state.branch
            ? this.t('cannotDeleteCheckedOutBranch')
            : this.t('deleteBranchButtonTooltip', { name }),
          mergeAction: () => this.mergeBranchIntoCurrent(name),
          deleteAction: () => this.deleteLocalBranchWithConfirm(name)
        }))
        : [{ label: `{gray-fg}${this.t('noLocalBranches')}{/gray-fg}`, action: () => {} }]),
      { label: `{green-fg}+{/green-fg} ${this.t('createLocalBranch')}`, action: () => this.createLocalBranch() },
      { type: 'separator', label: '' },
      { type: 'header', label: this.t('remoteBranches') },
      ...(remotes.length
        ? remotes.map(name => ({
          type: 'remoteBranch',
          label: `  {red-fg}☁ {/red-fg} ${this.escapeTags(name)}`,
          action: () => this.switchRemoteBranch(name, branches),
          mergeTooltip: () => this.t('mergeRemoteBranchButtonTooltip', { source: name, target: this.state.branch }),
          deleteTooltip: () => this.t('deleteRemoteBranchButtonTooltip', { name }),
          mergeAction: () => this.mergeRemoteBranchIntoCurrent(name),
          deleteAction: () => this.deleteRemoteBranchWithConfirm(name)
        }))
        : [{ label: `{gray-fg}${this.t('noRemoteBranches')}{/gray-fg}`, action: () => {} }]),
      { label: `{green-fg}+{/green-fg} ${this.t('createRemoteBranch')}`, action: menuAnchor => this.createRemoteBranch(menuAnchor, branches) }
    ];
    this.showMenu(this.t('branchManagement'), entries, anchor);
  },

  async branchMenu(anchor) {
    const branches = await this.localBranches();
    this.showMenu(this.t('branchManagement'), [
      { label: this.t('newBranch'), action: () => this.textDialog(this.t('newBranch'), this.t('newBranchPlaceholder'), name => this.perform(this.t('createBranch'), () => this.git(['switch', '-c', name]))) },
      { label: this.t('mergeBranch'), action: menuAnchor => this.mergeMenu(branches, menuAnchor) },
      { label: this.t('deleteBranch'), action: menuAnchor => this.deleteBranchMenu(branches, menuAnchor) },
      ...branches.map(name => ({ label: `${name === this.state.branch ? '{green-fg}●{/green-fg} ' : '○ '}${this.t('switchToBranch', { name: this.escapeTags(name) })}`, action: () => name === this.state.branch ? this.toast(this.t('alreadyCurrentBranch')) : this.perform(this.t('switchTo', { name }), () => this.git(['switch', name])) }))
    ], anchor);
  },

  mergeMenu(branches, anchor) {
    const options = branches.filter(name => name !== this.state.branch).map(name => ({ label: this.t('mergeInto', { name: this.escapeTags(name), branch: this.escapeTags(this.state.branch) }), action: () => this.confirm(this.t('mergeBranch'), this.t('mergeConfirm', { name, branch: this.state.branch }), () => this.perform(this.t('mergeBranch'), () => this.git(['merge', '--no-commit', '--no-ff', name]))) }));
    this.showMenu(this.t('selectBranchToMerge'), options.length ? options : [{ label: this.t('noBranchToMerge'), action: () => {} }], anchor);
  },

  deleteBranchMenu(branches, anchor) {
    const options = branches.filter(name => name !== this.state.branch).map(name => ({ label: `{red-fg}${this.t('delete')}{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm(this.t('deleteBranch'), this.t('deleteLocalBranchConfirm', { name }), () => this.perform(this.t('deleteBranch'), () => this.git(['branch', '-d', name]))) }));
    this.showMenu(this.t('selectBranchToDelete'), options.length ? options : [{ label: this.t('noBranchToDelete'), action: () => {} }], anchor);
  },

  async stashMenu(anchor) {
    const stashes = (await this.git(['stash', 'list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu(this.t('stash'), [
      { label: this.t('stashCurrentChanges'), action: () => this.textDialog(this.t('stashCurrentChanges'), this.t('stashMessagePlaceholder'), message => this.perform(this.t('stash'), () => this.git(['stash', 'push', '-m', message]))) },
      { label: this.t('applyLatestStash'), action: () => this.perform(this.t('applyLatestStash'), () => this.git(['stash', 'pop'])) },
      ...stashes.map((stash, index) => ({ label: `{yellow-fg}${this.escapeTags(stash)}{/yellow-fg}`, action: menuAnchor => this.stashDetailMenu(index, stash, menuAnchor) }))
    ], anchor);
  },

  stashDetailMenu(index, stash, anchor) {
    this.showMenu(`${this.t('stash')} ${index}`, [
      { label: this.t('viewDiff'), action: async () => { const diff = await this.git(['stash', 'show', '-p', `stash@{${index}}`]); this.setDetailText(` ${this.t('stash')}: ${index} `, this.formatDiff(diff)); this.screen.render(); } },
      { label: this.t('applyKeep'), action: () => this.perform(this.t('applyKeep'), () => this.git(['stash', 'apply', `stash@{${index}}`])) },
      { label: this.t('popAndDelete'), action: () => this.perform(this.t('popAndDelete'), () => this.git(['stash', 'pop', `stash@{${index}}`])) },
      { label: `{red-fg}${this.t('deleteStash')}{/red-fg}`, action: () => this.confirm(this.t('deleteStash'), this.t('deleteStashConfirm', { stash }), () => this.perform(this.t('deleteStash'), () => this.git(['stash', 'drop', `stash@{${index}}`]))) }
    ], anchor);
  },

  async tagMenu(anchor) {
    const tags = (await this.git(['tag', '--list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu(this.t('tags'), [
      { label: this.t('newLightweightTag'), action: () => this.textDialog(this.t('newTag'), this.t('tagPlaceholder'), name => this.perform(this.t('createTag'), () => this.git(['tag', name]))) },
      ...tags.map(name => ({ label: `{red-fg}${this.t('delete')}{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm(this.t('deleteTag'), this.t('deleteLocalTagConfirm', { name }), () => this.perform(this.t('deleteTag'), () => this.git(['tag', '-d', name]))) }))
    ], anchor);
  },

  async remoteMenu(anchor) {
    const names = (await this.git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    this.showMenu(this.t('remotes'), [
      { label: this.t('addRemoteRepository'), action: () => this.textDialog(this.t('remoteName'), this.t('remoteNamePlaceholder'), name => this.textDialog(this.t('remoteUrl'), this.t('remoteUrlExample'), url => this.perform(this.t('addRemote'), () => this.git(['remote', 'add', name, url])))) },
      ...names.map(name => ({ label: this.t('viewRemote', { name: this.escapeTags(name) }), action: async () => { const url = await this.git(['remote', 'get-url', name]); this.setDetailText(this.t('remoteRepository'), `${name}\n${url}`); this.screen.render(); } })),
      ...names.map(name => ({ label: `{red-fg}${this.t('deleteRemote')}{/red-fg} ${this.escapeTags(name)}`, action: () => this.confirm(this.t('deleteRemote'), this.t('deleteRemoteConfirm', { name }), () => this.perform(this.t('deleteRemote'), () => this.git(['remote', 'remove', name]))) }))
    ], anchor);
  },

  actionMenu(anchor) {
    this.showMenu(this.t('gitActions'), [
      { label: this.accentText(this.t('networkCategory')), action: menuAnchor => this.networkMenu(menuAnchor) },
      { label: `{green-fg}${this.t('branchCategory')}{/green-fg}`, action: menuAnchor => this.branchMenu(menuAnchor) },
      { label: `{yellow-fg}${this.t('stashCategory')}{/yellow-fg}`, action: menuAnchor => this.stashMenu(menuAnchor) },
      { label: `{purple-fg}${this.t('tagCategory')}{/purple-fg}`, action: menuAnchor => this.tagMenu(menuAnchor) },
      { label: this.t('remoteCategory'), action: menuAnchor => this.remoteMenu(menuAnchor) },
      { label: `{red-fg}${this.t('undoLastCommit')}{/red-fg}`, action: () => this.confirm(this.t('undoCommit'), this.t('undoCommitConfirm'), () => this.perform(this.t('undoCommit'), () => this.git(['reset', '--soft', 'HEAD~1']))) }
    ], anchor);
  },

};
