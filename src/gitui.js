'use strict';

const blessed = require('blessed');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Windows PowerShell 常常未设置 TERM；Blessed 会因此跳过鼠标追踪协议。
if (!process.env.TERM) process.env.TERM = 'xterm-256color';

const COLORS = {
  bg: '#10141d', panel: '#171c28', panelAlt: '#1d2432', border: '#39455d',
  text: '#dbe5f5', dim: '#8794aa', accent: '#58b6e8', green: '#65d6a4',
  yellow: '#eec36a', red: '#ef7d87', purple: '#c5a7ff'
};

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  mouse: true,
  title: 'GitUI Mouse',
  dockBorders: true,
  autoPadding: false
});

// 显式启用现代终端支持的 SGR 鼠标协议，避免依赖 TERM 的自动探测结果。
screen.program.setMouse({ vt200Mouse: true, sgrMouse: true, utfMouse: true, cellMotion: true }, true);
screen.enableMouse();
screen.program.hideCursor();

const state = {
  roots: [],
  repo: null,
  branch: '',
  remote: '',
  status: { staged: [], unstaged: [], untracked: [] },
  history: [],
  selected: null,
  busy: false,
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

function box(options) {
  return blessed.box({
    tags: true,
    mouse: true,
    style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } },
    border: 'line',
    ...options
  });
}

function button(options) {
  return blessed.button({
    mouse: true,
    keys: false,
    shrink: true,
    padding: { left: 1, right: 1 },
    style: {
      fg: COLORS.text,
      bg: COLORS.panelAlt,
      focus: { bg: COLORS.accent, fg: '#07131d' },
      hover: { bg: '#2d4960' }
    },
    ...options
  });
}

const header = blessed.box({
  top: 0, left: 0, height: 3, width: '100%',
  tags: true, mouse: true, style: { fg: COLORS.text, bg: '#111a28' },
  content: ' {bold}GitUI Mouse{/bold}  {gray-fg}VS Code 风格的终端源码管理{/gray-fg}'
});
screen.append(header);

const refreshButton = button({ parent: header, right: 33, top: 1, content: '刷新' });
const actionButton = button({ parent: header, right: 22, top: 1, content: '操作' });
const exitButton = button({ parent: header, right: 11, top: 1, content: '退出' });

const leftPanel = blessed.box({ left: 0, top: 3, width: '42%', bottom: 2, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const repoPanel = blessed.box({ parent: leftPanel, top: 0, left: 0, right: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const workPanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const changePanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const historyPanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const detailPanel = box({ left: '42%', top: 3, right: 0, bottom: 2, label: ' 文件修改对比 ', scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
const footer = blessed.box({ left: 0, bottom: 0, width: '100%', height: 2, tags: true, style: { fg: COLORS.dim, bg: '#111a28' }, content: ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认' });
screen.append(detailPanel);
screen.append(leftPanel);
screen.append(footer);

const repoHeader = button({ parent: repoPanel, top: 0, left: 0, right: 6, height: 1, tags: true, content: '▾ 存储库' });
const repoMoreButton = button({ parent: repoPanel, top: 0, right: 0, width: 6, height: 1, content: '...' });
const repoList = blessed.list({ parent: repoPanel, top: 1, left: 0, right: 0, bottom: 2, mouse: true, tags: true, keys: false, vi: false, style: { selected: { bg: COLORS.accent, fg: '#06131b' }, item: { fg: COLORS.text } }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
const addRepoButton = button({ parent: repoPanel, bottom: 1, left: 1, content: '+ 添加仓库' });

const commitHeader = button({ parent: workPanel, top: 0, left: 0, right: 6, height: 1, tags: true, content: '▾ 提交' });
const commitMoreButton = button({ parent: workPanel, top: 0, right: 0, width: 6, height: 1, content: '...' });
const commitInput = blessed.textbox({ parent: workPanel, top: 1, left: 1, right: 13, height: 3, mouse: true, inputOnFocus: true, keys: true, tags: false, border: 'line', style: { fg: COLORS.text, bg: '#121925', border: { fg: COLORS.border }, focus: { border: { fg: COLORS.accent } } } });
const commitButton = button({ parent: workPanel, top: 1, right: 1, width: 11, height: 3, align: 'center', valign: 'middle', content: '提交' });

const changeHeader = button({ parent: changePanel, top: 0, left: 0, right: 27, height: 1, tags: true, content: '▾ 更改' });
const stageAllButton = button({ parent: changePanel, top: 0, right: 18, width: 9, height: 1, content: '暂存全部' });
const unstageAllButton = button({ parent: changePanel, top: 0, right: 9, width: 9, height: 1, content: '取消暂存' });
const changeMoreButton = button({ parent: changePanel, top: 0, right: 0, width: 6, height: 1, content: '...' });
const changeArea = blessed.box({ parent: changePanel, top: 1, left: 0, right: 0, bottom: 0, mouse: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });

const historyHeader = button({ parent: historyPanel, top: 0, left: 0, right: 6, height: 1, tags: true, content: '▾ 图表' });
const historyMoreButton = button({ parent: historyPanel, top: 0, right: 0, width: 6, height: 1, content: '...' });
const historyList = blessed.list({ parent: historyPanel, top: 1, left: 0, right: 0, bottom: 0, mouse: true, tags: true, keys: false, style: { selected: { bg: '#2b607b', fg: COLORS.text }, item: { fg: COLORS.text } }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });

function setVisible(element, visible) {
  if (visible) element.show();
  else element.hide();
}

function sectionCaption(collapsed, text) {
  return `${collapsed ? '▸' : '▾'} ${text}`;
}

function reflowLeftPanel() {
  const rows = Math.max(19, (screen.height || 24) - 5);
  const repoHeight = state.collapsed.repositories ? 1 : Math.min(7, Math.max(5, Math.floor(rows * 0.2)));
  const commitHeight = state.collapsed.commit ? 1 : 5;
  const historyHeight = state.collapsed.history ? 1 : Math.max(6, Math.floor(rows * 0.34));
  const changeHeight = state.collapsed.changes ? 1 : Math.max(3, rows - repoHeight - commitHeight - historyHeight);
  const actualHistoryHeight = state.collapsed.changes ? rows - repoHeight - commitHeight - changeHeight : historyHeight;
  let top = 0;
  repoPanel.top = top;
  repoPanel.height = repoHeight;
  top += repoHeight;
  workPanel.top = top;
  workPanel.height = commitHeight;
  top += commitHeight;
  changePanel.top = top;
  changePanel.height = changeHeight;
  top += changeHeight;
  historyPanel.top = top;
  historyPanel.height = Math.max(1, actualHistoryHeight);

  repoHeader.setContent(sectionCaption(state.collapsed.repositories, '存储库'));
  commitHeader.setContent(sectionCaption(state.collapsed.commit, '提交'));
  changeHeader.setContent(sectionCaption(state.collapsed.changes, '更改'));
  historyHeader.setContent(sectionCaption(state.collapsed.history, '图表'));
  setVisible(repoList, !state.collapsed.repositories);
  setVisible(addRepoButton, !state.collapsed.repositories);
  setVisible(commitInput, !state.collapsed.commit);
  setVisible(commitButton, !state.collapsed.commit);
  setVisible(stageAllButton, !state.collapsed.changes);
  setVisible(unstageAllButton, !state.collapsed.changes);
  setVisible(changeArea, !state.collapsed.changes);
  setVisible(historyList, !state.collapsed.history);
}

function toggleSection(section) {
  state.collapsed[section] = !state.collapsed[section];
  reflowLeftPanel();
  screen.render();
}

function escapeTags(value) {
  return String(value || '').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function git(args, options = {}) {
  if (!state.repo && !options.cwd) return Promise.reject(new Error('请先选择一个 Git 仓库。'));
  const cwd = options.cwd || state.repo;
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr || stdout || error.message).trim();
        reject(new Error(message.replace(/^fatal: /m, '')));
        return;
      }
      // 状态命令使用 NUL 分隔文件名，不能在这里裁剪输出，否则会破坏合法的尾随空格文件名。
      resolve(stdout || '');
    });
  });
}

function toast(message, color = COLORS.accent) {
  const notice = blessed.message({ parent: screen, top: 'center', left: 'center', width: '55%', height: 'shrink', border: 'line', tags: true, style: { fg: COLORS.text, bg: '#172133', border: { fg: color } } });
  notice.display(` {bold}${escapeTags(message)}{/bold} `, 2, () => notice.destroy());
}

function setBusy(value, label = '') {
  state.busy = value;
  footer.setContent(value ? ` {yellow-fg}正在执行：${escapeTags(label)}{/yellow-fg}` : ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认');
  screen.render();
}

async function perform(label, operation, refresh = true) {
  if (state.busy) return;
  try {
    setBusy(true, label);
    const result = await operation();
    if (refresh) await refreshRepo();
    toast(`${label}完成`, COLORS.green);
    return result;
  } catch (error) {
    toast(`${label}失败：${error.message}`, COLORS.red);
  } finally {
    setBusy(false);
  }
}

async function findGitRoot(directory) {
  try {
    return (await new Promise((resolve, reject) => execFile('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { windowsHide: true, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()))));
  } catch (_) {
    return null;
  }
}

async function discoverRepositories(start) {
  const found = new Set();
  const direct = await findGitRoot(start);
  if (direct) found.add(path.resolve(direct));
  const visit = async (directory, depth) => {
    if (depth < 0) return;
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = path.join(directory, entry.name);
      const root = await findGitRoot(child);
      if (root) { found.add(path.resolve(root)); continue; }
      await visit(child, depth - 1);
    }
  };
  await visit(start, 2);
  return [...found].sort((a, b) => a.localeCompare(b));
}

function parseStatus(raw) {
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
}

async function refreshRepo() {
  if (!state.repo) return;
  const [statusRaw, branch, remote, history] = await Promise.all([
    git(['status', '--porcelain=v1', '-z']),
    git(['branch', '--show-current']),
    git(['remote']).catch(() => ''),
    git(['log', '-n', '180', '--date=short', '--pretty=format:%h%x09%ad%x09%an%x09%s']).catch(() => '')
  ]);
  state.status = parseStatus(statusRaw);
  state.branch = branch.trim() || '(分离 HEAD)';
  state.remote = remote.split(/\r?\n/)[0] || '无远程仓库';
  state.history = history ? history.split(/\r?\n/).filter(Boolean).map(line => {
    const [hash, date, author, subject] = line.split('\t');
    return { hash, date, author, subject };
  }) : [];
  renderAll();
}

function renderRepositories() {
  repoList.setItems(state.roots.map(root => {
    const active = root === state.repo ? '{green-fg}●{/green-fg} ' : '○ ';
    const branch = root === state.repo ? ` {cyan-fg}${escapeTags(state.branch)}{/cyan-fg}` : '';
    return `${active}${escapeTags(path.basename(root))}${branch}`;
  }));
  if (state.repo) repoList.select(Math.max(0, state.roots.indexOf(state.repo)));
}

function clearChildren(element) {
  [...element.children].forEach(child => child.destroy());
}

function statusLabel(code) {
  if (code === '??') return '{yellow-fg}U{/yellow-fg}';
  if (code.includes('D')) return '{red-fg}D{/red-fg}';
  if (code.includes('A')) return '{green-fg}A{/green-fg}';
  if (code.includes('R')) return '{purple-fg}R{/purple-fg}';
  return '{yellow-fg}M{/yellow-fg}';
}

function addFileGroup(title, files, mode, top) {
  const folded = state.collapsed[mode];
  const heading = button({ parent: changeArea, top, left: 0, right: 0, height: 1, tags: true, content: `${sectionCaption(folded, title)} {gray-fg}(${files.length}){/gray-fg}`, style: { fg: COLORS.text, bg: COLORS.panel, hover: { bg: '#2d4960' } } });
  heading.on('press', () => {
    state.collapsed[mode] = !state.collapsed[mode];
    renderChanges();
    screen.render();
  });
  if (folded) return top + 1;
  let row = top + 1;
  for (const item of files) {
    const main = button({ parent: changeArea, top: row, left: 0, right: 13, height: 1, tags: true, content: `${statusLabel(item.code)} ${escapeTags(item.file)}`, style: { fg: COLORS.text, bg: COLORS.panel, hover: { bg: '#2d4960' } } });
    const view = button({ parent: changeArea, top: row, right: 7, width: 7, height: 1, content: '查看' });
    const destructive = mode === 'unstaged' || mode === 'untracked';
    const side = button({ parent: changeArea, top: row, right: 0, width: 7, height: 1, content: destructive ? '丢弃' : '取消' });
    main.on('press', () => mode === 'staged' ? unstage(item.file) : stage(item.file));
    view.on('press', () => showFileDiff(item, mode === 'staged'));
    side.on('press', () => destructive ? discard(item.file, mode === 'untracked') : unstage(item.file));
    row += 1;
  }
  return row;
}

function renderChanges() {
  clearChildren(changeArea);
  let top = 0;
  top = addFileGroup('暂存的更改', state.status.staged, 'staged', top);
  top = addFileGroup('更改', state.status.unstaged, 'unstaged', top);
  top = addFileGroup('未跟踪的文件', state.status.untracked, 'untracked', top);
  if (top === 0) blessed.box({ parent: changeArea, top: 1, left: 1, content: '{green-fg}工作区干净{/green-fg}', tags: true });
}

function renderHistory() {
  historyList.setItems(state.history.map(commit => `{cyan-fg}${escapeTags(commit.hash)}{/cyan-fg} {bold}${escapeTags(commit.subject)}{/bold}\n{gray-fg}${escapeTags(commit.date)} · ${escapeTags(commit.author)}{/gray-fg}`));
}

function renderAll() {
  renderRepositories();
  renderChanges();
  renderHistory();
  if (!state.selected) detailPanel.setContent(' 点击文件可查看差异，点击历史可查看提交详情。');
  screen.render();
}

function formatDiff(content) {
  return String(content || '').split(/\r?\n/).map(line => {
    const safe = escapeTags(line);
    if (/^@@/.test(line)) return `{cyan-fg}${safe}{/cyan-fg}`;
    if (/^\+\+\+|^---/.test(line)) return `{bold}${safe}{/bold}`;
    if (/^\+/.test(line)) return `{green-fg}${safe}{/green-fg}`;
    if (/^-/.test(line)) return `{red-fg}${safe}{/red-fg}`;
    if (/^diff |^index |^commit /.test(line)) return `{yellow-fg}${safe}{/yellow-fg}`;
    return safe;
  }).join('\n');
}

async function selectRepo(root) {
  state.repo = root;
  state.selected = null;
  await perform('加载仓库', refreshRepo, false);
}

async function stage(file) { await perform(`暂存 ${file}`, () => git(['add', '--', file])); }
async function unstage(file) {
  await perform(`取消暂存 ${file}`, () => git(['reset', 'HEAD', '--', file]).catch(() => git(['rm', '--cached', '--', file])));
}

function confirm(title, text, onConfirm) {
  const modal = box({ parent: screen, top: 'center', left: 'center', width: 58, height: 9, label: ` ${title} `, style: { fg: COLORS.text, bg: '#182235', border: { fg: COLORS.yellow } } });
  blessed.box({ parent: modal, top: 1, left: 2, right: 2, height: 3, tags: true, content: escapeTags(text), style: { fg: COLORS.text, bg: '#182235' } });
  const yes = button({ parent: modal, bottom: 1, left: 12, width: 12, content: '确认', align: 'center' });
  const no = button({ parent: modal, bottom: 1, right: 12, width: 12, content: '取消', align: 'center' });
  yes.on('press', () => { modal.destroy(); onConfirm(); screen.render(); });
  no.on('press', () => { modal.destroy(); screen.render(); });
  screen.render();
}

function textDialog(title, placeholder, submit) {
  const modal = box({ parent: screen, top: 'center', left: 'center', width: 72, height: 16, label: ` ${title} `, style: { fg: COLORS.text, bg: '#182235', border: { fg: COLORS.accent } } });
  const input = blessed.textbox({ parent: modal, top: 1, left: 2, right: 2, height: 3, mouse: true, inputOnFocus: false, keys: false, value: '', border: 'line', style: { fg: COLORS.text, bg: '#101722', border: { fg: COLORS.border } } });
  input.setValue('');
  const hint = blessed.box({ parent: modal, top: 4, left: 2, right: 2, height: 1, content: escapeTags(placeholder), style: { fg: COLORS.dim, bg: '#182235' } });
  const chars = ['A B C D E F G H I J K L M', 'N O P Q R S T U V W X Y Z', 'a b c d e f g h i j k l m', 'n o p q r s t u v w x y z', '0 1 2 3 4 5 6 7 8 9 - _ / . : @'];
  chars.forEach((line, row) => {
    const values = line.split(' ');
    values.forEach((char, col) => {
      const key = button({ parent: modal, top: 5 + row, left: 2 + col * 5, width: 4, height: 1, content: char, align: 'center' });
      key.on('press', () => { input.setValue(input.getValue() + char); screen.render(); });
    });
  });
  const back = button({ parent: modal, bottom: 1, left: 2, width: 11, content: '退格' });
  const cancel = button({ parent: modal, bottom: 1, left: 16, width: 11, content: '取消' });
  const ok = button({ parent: modal, bottom: 1, right: 2, width: 14, content: '确认' });
  back.on('press', () => { input.setValue(input.getValue().slice(0, -1)); screen.render(); });
  cancel.on('press', () => { modal.destroy(); screen.render(); });
  ok.on('press', () => { const value = input.getValue().trim(); if (!value) { toast('请输入内容', COLORS.yellow); return; } modal.destroy(); submit(value); screen.render(); });
  screen.render();
}

function showMenu(title, entries) {
  const height = Math.min(entries.length + 4, 22);
  const modal = box({ parent: screen, top: 'center', left: 'center', width: 56, height, label: ` ${title} `, style: { fg: COLORS.text, bg: '#182235', border: { fg: COLORS.accent } } });
  entries.slice(0, height - 3).forEach((entry, index) => {
    const item = button({ parent: modal, top: index + 1, left: 2, right: 2, height: 1, tags: true, content: entry.label });
    item.on('press', () => { modal.destroy(); entry.action(); screen.render(); });
  });
  const cancel = button({ parent: modal, bottom: 1, left: 2, width: 10, content: '关闭' });
  cancel.on('press', () => { modal.destroy(); screen.render(); });
  screen.render();
}

async function discard(file, untracked) {
  confirm('丢弃文件', `确定要丢弃 ${file} 的全部本地修改吗？`, () => perform(`丢弃 ${file}`, () => untracked ? git(['clean', '-f', '--', file]) : git(['restore', '--source=HEAD', '--staged', '--worktree', '--', file])));
}

async function showFileDiff(item, staged) {
  state.selected = item.file;
  const diff = await git(staged ? ['diff', '--cached', '--', item.file] : ['diff', '--', item.file]).catch(error => `无法读取差异：${error.message}`);
  detailPanel.setLabel(` 差异：${item.file} `);
  detailPanel.setContent(formatDiff(diff || '没有可显示的文本差异。'));
  detailPanel.setScroll(0);
  screen.render();
}

async function showCommit(commit) {
  const detail = await git(['show', '--stat', '--patch', '--decorate=short', commit.hash]).catch(error => `无法读取提交：${error.message}`);
  detailPanel.setLabel(` 提交：${commit.hash} `);
  detailPanel.setContent(formatDiff(detail));
  detailPanel.setScroll(0);
  screen.render();
}

function networkMenu() {
  showMenu('网络操作', [
    { label: '拉取  git pull --no-rebase', action: () => perform('拉取', () => git(['pull', '--no-rebase'])) },
    { label: '推送  git push', action: () => perform('推送', () => git(['push'])) },
    { label: '抓取  git fetch --prune', action: () => perform('抓取', () => git(['fetch', '--prune'])) },
    { label: '发布当前分支到 origin', action: () => perform('发布分支', () => git(['push', '-u', 'origin', state.branch])) }
  ]);
}

async function branchMenu() {
  const branches = (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('分支管理', [
    { label: '新建分支', action: () => textDialog('新建分支', '通过屏幕软键盘输入分支名', name => perform('创建分支', () => git(['switch', '-c', name]))) },
    { label: '合并分支', action: () => mergeMenu(branches) },
    { label: '删除分支', action: () => deleteBranchMenu(branches) },
    ...branches.map(name => ({ label: `${name === state.branch ? '{green-fg}●{/green-fg} ' : '○ '}切换到 ${escapeTags(name)}`, action: () => name === state.branch ? toast('已在当前分支') : perform(`切换到 ${name}`, () => git(['switch', name])) }))
  ]);
}

function mergeMenu(branches) {
  const options = branches.filter(name => name !== state.branch).map(name => ({ label: `合并 ${escapeTags(name)} 到 ${escapeTags(state.branch)}`, action: () => confirm('合并分支', `将 ${name} 合并到 ${state.branch}，确定继续吗？`, () => perform('合并分支', () => git(['merge', '--no-edit', name]))) }));
  showMenu('选择要合并的分支', options.length ? options : [{ label: '没有可合并的其他本地分支', action: () => {} }]);
}

function deleteBranchMenu(branches) {
  const options = branches.filter(name => name !== state.branch).map(name => ({ label: `{red-fg}删除{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除分支', `删除本地分支 ${name} 吗？未合并的提交会阻止删除。`, () => perform('删除分支', () => git(['branch', '-d', name]))) }));
  showMenu('选择要删除的分支', options.length ? options : [{ label: '当前没有可删除的其他本地分支', action: () => {} }]);
}

async function stashMenu() {
  const stashes = (await git(['stash', 'list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('储藏', [
    { label: '储藏当前更改', action: () => textDialog('储藏当前更改', '输入储藏说明', message => perform('储藏', () => git(['stash', 'push', '-m', message]))) },
    { label: '应用最新储藏', action: () => perform('应用储藏', () => git(['stash', 'pop'])) },
    ...stashes.map((stash, index) => ({ label: `{yellow-fg}${escapeTags(stash)}{/yellow-fg}`, action: () => stashDetailMenu(index, stash) }))
  ]);
}

function stashDetailMenu(index, stash) {
  showMenu(`储藏 ${index}`, [
    { label: '查看差异', action: async () => { const diff = await git(['stash', 'show', '-p', `stash@{${index}}`]); detailPanel.setContent(formatDiff(diff)); detailPanel.setLabel(` 储藏：${index} `); screen.render(); } },
    { label: '应用但保留', action: () => perform('应用储藏', () => git(['stash', 'apply', `stash@{${index}}`])) },
    { label: '弹出并删除', action: () => perform('弹出储藏', () => git(['stash', 'pop', `stash@{${index}}`])) },
    { label: '{red-fg}删除储藏{/red-fg}', action: () => confirm('删除储藏', `删除 ${stash} 吗？`, () => perform('删除储藏', () => git(['stash', 'drop', `stash@{${index}}`]))) }
  ]);
}

async function tagMenu() {
  const tags = (await git(['tag', '--list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('标签', [
    { label: '新建轻量标签（当前 HEAD）', action: () => textDialog('新建标签', '输入标签名，例如 v1.0.0', name => perform('创建标签', () => git(['tag', name]))) },
    ...tags.map(name => ({ label: `{red-fg}删除{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除标签', `删除本地标签 ${name} 吗？`, () => perform('删除标签', () => git(['tag', '-d', name]))) }))
  ]);
}

async function remoteMenu() {
  const names = (await git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('远程仓库', [
    { label: '添加远程仓库', action: () => textDialog('远程名称', '例如 origin', name => textDialog('远程地址', '例如 https://example.com/repo.git', url => perform('添加远程', () => git(['remote', 'add', name, url])))) },
    ...names.map(name => ({ label: `查看 ${escapeTags(name)}`, action: async () => { const url = await git(['remote', 'get-url', name]); detailPanel.setLabel(' 远程仓库 '); detailPanel.setContent(`${name}\n${url}`); screen.render(); } })),
    ...names.map(name => ({ label: `{red-fg}删除远程{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除远程', `删除远程 ${name} 吗？`, () => perform('删除远程', () => git(['remote', 'remove', name]))) }))
  ]);
}

function actionMenu() {
  showMenu('Git 操作', [
    { label: '{cyan-fg}网络：拉取、推送、抓取{/cyan-fg}', action: networkMenu },
    { label: '{green-fg}分支：新建、切换、合并、删除{/green-fg}', action: branchMenu },
    { label: '{yellow-fg}储藏：保存、应用、删除{/yellow-fg}', action: stashMenu },
    { label: '{purple-fg}标签：创建、删除{/purple-fg}', action: tagMenu },
    { label: '远程仓库：添加、查看、删除', action: remoteMenu },
    { label: '{red-fg}撤销最近一次提交（保留暂存区）{/red-fg}', action: () => confirm('撤销提交', '将使用 git reset --soft HEAD~1，提交会被撤销但内容保留在暂存区。', () => perform('撤销提交', () => git(['reset', '--soft', 'HEAD~1']))) }
  ]);
}

function repositoryMenu() {
  showMenu('存储库', [
    { label: '刷新当前存储库', action: () => perform('刷新', refreshRepo, false) },
    { label: '添加已存在的 Git 存储库', action: () => addRepoButton.emit('press') },
    { label: '查看当前存储库路径', action: () => { detailPanel.setLabel(' 存储库路径 '); detailPanel.setContent(escapeTags(state.repo || '未选择')); screen.render(); } }
  ]);
}

function changesMenu() {
  showMenu('更改', [
    { label: '暂存所有更改', action: () => perform('暂存所有更改', () => git(['add', '-A'])) },
    { label: '取消所有暂存', action: () => perform('取消所有暂存', () => git(['reset', 'HEAD']).catch(() => git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))) },
    { label: '{red-fg}丢弃全部本地更改{/red-fg}', action: () => discardAllChanges() }
  ]);
}

function historyMenu() {
  showMenu('图表', [
    { label: '刷新提交历史', action: () => perform('刷新历史', refreshRepo, false) },
    { label: '查看当前分支日志', action: async () => { const log = await git(['log', '--graph', '--decorate', '--oneline', '-n', '180']); detailPanel.setLabel(' 当前分支图表 '); detailPanel.setContent(formatDiff(log)); detailPanel.setScroll(0); screen.render(); } },
    { label: '打开 Git 操作菜单', action: actionMenu }
  ]);
}

function discardAllChanges() {
  confirm('丢弃全部更改', '这会还原已跟踪文件并永久删除未跟踪文件，确定继续吗？', () => perform('丢弃全部更改', async () => {
    await git(['restore', '--source=HEAD', '--staged', '--worktree', '.']);
    await git(['clean', '-fd']);
  }));
}

repoList.on('select', (_, index) => { if (state.roots[index] && state.roots[index] !== state.repo) selectRepo(state.roots[index]); });
historyList.on('select', (_, index) => { if (state.history[index]) showCommit(state.history[index]); });
refreshButton.on('press', () => perform('刷新', refreshRepo, false));
actionButton.on('press', actionMenu);
exitButton.on('press', () => { screen.destroy(); process.exit(0); });
repoHeader.on('press', () => toggleSection('repositories'));
commitHeader.on('press', () => toggleSection('commit'));
changeHeader.on('press', () => toggleSection('changes'));
historyHeader.on('press', () => toggleSection('history'));
repoMoreButton.on('press', repositoryMenu);
commitMoreButton.on('press', actionMenu);
changeMoreButton.on('press', changesMenu);
historyMoreButton.on('press', historyMenu);
addRepoButton.on('press', () => textDialog('添加仓库', '输入 Git 仓库目录的完整路径', async directory => {
  const root = await findGitRoot(directory);
  if (!root) { toast('该目录不是 Git 仓库', COLORS.red); return; }
  if (!state.roots.includes(root)) state.roots.push(root);
  await selectRepo(root);
}));
stageAllButton.on('press', () => perform('暂存所有更改', () => git(['add', '-A'])));
unstageAllButton.on('press', () => perform('取消所有暂存', () => git(['reset', 'HEAD']).catch(() => git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))));
commitButton.on('press', () => {
  const message = commitInput.getValue().trim();
  if (!message) { toast('请输入提交消息', COLORS.yellow); commitInput.focus(); screen.render(); return; }
  if (!state.status.staged.length) { toast('没有已暂存的更改', COLORS.yellow); return; }
  confirm('创建提交', `使用以下提交消息：\n${message}`, () => perform('提交', async () => { await git(['commit', '-m', message]); commitInput.clearValue(); }));
});

screen.on('resize', () => { reflowLeftPanel(); screen.render(); });
screen.key(['C-c'], () => { screen.destroy(); process.exit(0); });

(async function bootstrap() {
  reflowLeftPanel();
  const supplied = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  state.roots = await discoverRepositories(supplied);
  if (!state.roots.length) {
    renderRepositories();
    detailPanel.setContent(` 在 ${supplied} 及下两层目录中未发现 Git 仓库。\n\n点击“添加仓库”，使用屏幕软键盘输入仓库目录。`);
    screen.render();
    return;
  }
  await selectRepo(state.roots[0]);
}()).catch(error => {
  detailPanel.setContent(`初始化失败：${error.message}`);
  screen.render();
});
