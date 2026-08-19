'use strict';

module.exports = {
  git(args, options = {}) {
    if (!this.state.repo && !options.cwd) return Promise.reject(new Error(this.t('noRepoSelected')));
    const cwd = options.cwd || this.state.repo;
    return new Promise((resolve, reject) => {
      this.execFile('git', ['-C', cwd, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
          const message = (stderr || stdout || error.message).trim();
          reject(new Error(message.replace(/^fatal: /m, '')));
          return;
        }
        resolve(stdout || '');
      });
    });
  },

  async findGitRoot(directory) {
    try {
      return (await new Promise((resolve, reject) => this.execFile('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { windowsHide: true, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()))));
    } catch (_) {
      return null;
    }
  },

  async discoverRepositories(start) {
    const found = new Set();
    const direct = await this.findGitRoot(start);
    if (direct) found.add(this.path.resolve(direct));
    const visit = async (directory, depth) => {
      if (depth < 0) return;
      let entries = [];
      try { entries = this.fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const child = this.path.join(directory, entry.name);
        const root = await this.findGitRoot(child);
        if (root) { found.add(this.path.resolve(root)); continue; }
        await visit(child, depth - 1);
      }
    };
    await visit(start, 2);
    return [...found].sort((a, b) => a.localeCompare(b));
  },

  parseStatus(raw) {
    const result = { staged: [], unstaged: [], untracked: [] };
    const records = raw ? raw.split('\0') : [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!record || record.length < 4) continue;
      const code = record.slice(0, 2);
      const file = record.slice(3);
      const item = { file, code };
      if (code === '??') result.untracked.push(item);
      else {
        if (code[0] !== ' ') result.staged.push(item);
        if (code[1] !== ' ') result.unstaged.push(item);
        if (code[0] === 'R' || code[0] === 'C') index += 1;
      }
    }
    return result;
  },

  parseCommitFiles(raw) {
    return String(raw || '').split(/\r?\n/).filter(Boolean).map(line => {
      const parts = line.split('\t');
      const status = parts[0] || 'M';
      if (status.startsWith('R') || status.startsWith('C')) {
        return { status, oldFile: parts[1] || '', file: parts[2] || parts[1] || '' };
      }
      return { status, file: parts[1] || '' };
    }).filter(item => item.file);
  },

  async refreshRepo() {
    if (!this.state.repo) return;
    const [statusRaw, branch, remote, remoteRefsRaw, head, history] = await Promise.all([
      this.git(['status', '--porcelain=v1', '-z']),
      this.git(['branch', '--show-current']),
      this.git(['remote']).catch(() => ''),
      this.git(['for-each-ref', '--format=%(objectname)%09%(refname:short)', 'refs/remotes']).catch(() => ''),
      this.git(['rev-parse', 'HEAD']).catch(() => ''),
      this.git(['log', '-n', '180', '--date=short', '--pretty=format:%H%x09%h%x09%ad%x09%an%x09%s']).catch(() => '')
    ]);
    this.state.status = this.parseStatus(statusRaw);
    this.state.branch = branch.trim() || this.t('detachedHead');
    this.state.remotes = remote.split(/\r?\n/).filter(Boolean);
    this.state.remote = this.state.remotes[0] || this.t('noRemote');
    this.state.upstream = (await this.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')).trim();
    this.state.ahead = 0;
    this.state.behind = 0;
    if (this.state.upstream) {
      const counts = (await this.git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => '0\t0')).trim().split(/\s+/);
      this.state.ahead = Number(counts[0]) || 0;
      this.state.behind = Number(counts[1]) || 0;
    }
    this.state.repoSignature = this.repoSignature(statusRaw, branch, remote, remoteRefsRaw, head, this.state.upstream, this.state.ahead, this.state.behind);
    this.state.remoteRefs = new Map();
    remoteRefsRaw.split(/\r?\n/).filter(Boolean).forEach(line => {
      const [hash, name] = line.split('\t');
      if (!hash || !name || name.endsWith('/HEAD') || !name.includes('/')) return;
      const names = this.state.remoteRefs.get(hash) || [];
      names.push(name);
      this.state.remoteRefs.set(hash, names);
    });
    this.state.history = history ? history.split(/\r?\n/).filter(Boolean).map(line => {
      const [fullHash, hash, date, author, ...subjectParts] = line.split('\t');
      return { fullHash, hash, date, author, subject: subjectParts.join('\t') };
    }) : [];
    this.renderAll();
  },

  repoSignature(statusRaw, branch, remote, remoteRefsRaw, head, upstream, ahead, behind) {
    return [
      statusRaw || '',
      String(branch || '').trim(),
      remote || '',
      remoteRefsRaw || '',
      String(head || '').trim(),
      upstream || '',
      ahead || 0,
      behind || 0
    ].join('\u001f');
  },

  async readRepoSignature() {
    if (!this.state.repo) return '';
    const [statusRaw, branch, remote, remoteRefsRaw, head] = await Promise.all([
      this.git(['status', '--porcelain=v1', '-z']),
      this.git(['branch', '--show-current']),
      this.git(['remote']).catch(() => ''),
      this.git(['for-each-ref', '--format=%(objectname)%09%(refname:short)', 'refs/remotes']).catch(() => ''),
      this.git(['rev-parse', 'HEAD']).catch(() => '')
    ]);
    const upstream = (await this.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')).trim();
    let ahead = 0;
    let behind = 0;
    if (upstream) {
      const counts = (await this.git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => '0\t0')).trim().split(/\s+/);
      ahead = Number(counts[0]) || 0;
      behind = Number(counts[1]) || 0;
    }
    return this.repoSignature(statusRaw, branch, remote, remoteRefsRaw, head, upstream, ahead, behind);
  }
};
