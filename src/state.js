'use strict';

function createState() {
  return {
    startDirectory: process.cwd(),
    startDirectoryIsGit: false,
    roots: [],
    repo: null,
    branch: '',
    remote: '',
    remotes: [],
    upstream: '',
    ahead: 0,
    behind: 0,
    repoSignature: '',
    status: { staged: [], unstaged: [], untracked: [] },
    history: [],
    remoteRefs: new Map(),
    expandedHistory: new Set(),
    historyFiles: new Map(),
    selected: null,
    busy: false,
    language: 'en',
    collapsed: {
      repositories: false,
      commit: false,
      changes: false,
      staged: false,
      unstaged: false,
      untracked: false,
      history: false
    }
  };
}

module.exports = { createState };
