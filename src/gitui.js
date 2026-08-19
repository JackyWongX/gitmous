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

let activeDropdownMenu = null;
let activeDropdownOutsideHandler = null;

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
  const { style = {}, ...buttonOptions } = options;
  return blessed.button({
    mouse: true,
    keys: false,
    shrink: true,
    padding: { left: 1, right: 1 },
    style: {
      fg: COLORS.text,
      bg: COLORS.panel,
      focus: { fg: COLORS.accent, bold: true },
      hover: { fg: COLORS.accent },
      ...style
    },
    ...buttonOptions
  });
}

const header = blessed.box({
  top: 0, left: 0, height: 3, width: '100%',
  tags: true, mouse: true, style: { fg: COLORS.text, bg: '#111a28' },
  content: ' {bold}GitUI Mouse{/bold}  {gray-fg}VS Code 风格的终端源码管理{/gray-fg}'
});

const refreshButton = button({ parent: header, right: 33, top: 1, content: '刷新' });
const actionButton = button({ parent: header, right: 22, top: 1, content: '操作' });
const exitButton = button({ parent: header, right: 11, top: 1, content: '退出' });

const leftPanel = blessed.box({ left: 0, top: 0, width: '42%', bottom: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
const regionBorder = { type: 'line', fg: COLORS.border };
const repoPanel = blessed.box({ parent: leftPanel, top: 0, left: 0, right: 0, mouse: true, border: regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
const workPanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, border: regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
const changePanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, border: regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
const historyPanel = blessed.box({ parent: leftPanel, left: 0, right: 0, mouse: true, border: regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
const detailPanel = box({ left: '42%', top: 0, right: 0, bottom: 0, border: regionBorder, label: ' 文件修改对比 ', scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
const footer = blessed.box({ left: 0, bottom: 0, width: '100%', height: 2, tags: true, style: { fg: COLORS.dim, bg: '#111a28' }, content: ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认' });
screen.append(detailPanel);
screen.append(leftPanel);

const iconStyle = { fg: 'brightwhite', bg: COLORS.panel, bold: true };
const repoHeader = button({ parent: repoPanel, top: 1, left: 1, right: 5, height: 1, tags: true, content: '▾ 存储库' });
const repoAddButton = button({ parent: repoPanel, top: 1, right: 1, width: 3, height: 1, content: '+', style: iconStyle });
const repoArea = blessed.box({ parent: repoPanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
const repoContent = blessed.box({ parent: repoArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

const commitHeader = button({ parent: workPanel, top: 1, left: 1, right: 7, height: 1, tags: true, content: '▾ 提交' });
const commitMoreButton = button({ parent: workPanel, top: 1, right: 1, width: 6, height: 1, content: '...' });
const commitInput = blessed.textarea({ parent: workPanel, top: 2, left: 2, right: 8, height: 3, mouse: true, inputOnFocus: true, keys: false, tags: false, border: 'line', style: { fg: COLORS.text, bg: '#121925', border: { fg: COLORS.border }, focus: { border: { fg: COLORS.accent } } } });
const commitButton = button({ parent: workPanel, top: 2, right: 1, width: 6, height: 3, align: 'center', valign: 'middle', content: '提交' });

const changeHeader = button({ parent: changePanel, top: 1, left: 1, right: 6, height: 1, tags: true, content: '▾ 更改' });
const fileRowHoverBg = COLORS.panelAlt;
const changeMoreButton = button({ parent: changePanel, top: 1, right: 1, width: 4, height: 1, content: '...' });
const changeArea = blessed.box({ parent: changePanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
const changeContent = blessed.box({ parent: changeArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

const historyHeader = button({ parent: historyPanel, top: 1, left: 1, right: 7, height: 1, tags: true, content: '▾ 图表' });
const historyMoreButton = button({ parent: historyPanel, top: 1, right: 1, width: 6, height: 1, content: '...' });
const historyList = blessed.list({ parent: historyPanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, tags: true, keys: false, style: { selected: { bg: '#2b607b', fg: COLORS.text }, item: { fg: COLORS.text } }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });

function setVisible(element, visible) {
  if (visible) element.show();
  else element.hide();
}

function sectionCaption(collapsed, text) {
  return `${collapsed ? '▸' : '▾'} ${text}`;
}

function commitInputRows() {
  const lines = commitInput.getValue().split('\n').length;
  return Math.min(10, Math.max(3, lines + 2));
}

function syncCommitInputScroll() {
  const visibleRows = Math.max(1, commitInput.height - commitInput.iheight);
  const lineCount = commitInput.getValue().split('\n').length;
  const scrollTop = Math.max(0, lineCount - visibleRows);
  commitInput.childBase = scrollTop;
  commitInput.childOffset = 0;
  if (commitInput.lpos) delete commitInput.lpos._scrollBottom;
}

function reflowLeftPanel() {
  const rows = Math.max(22, screen.height || 24);
  const repoRows = Math.min(6, Math.max(1, state.roots.length));
  const repoHeight = state.collapsed.repositories ? 3 : repoRows + 3;
  const inputHeight = commitInputRows();
  const commitHeight = state.collapsed.commit ? 3 : inputHeight + 3;
  const historyHeight = state.collapsed.history ? 3 : Math.max(6, Math.floor(rows * 0.34));
  const changeHeight = state.collapsed.changes ? 3 : Math.max(5, rows - repoHeight - commitHeight - historyHeight);
  const actualHistoryHeight = state.collapsed.changes ? rows - repoHeight - commitHeight - changeHeight : historyHeight;
  let top = 0;
  repoPanel.top = top;
  repoPanel.height = repoHeight;
  top += repoHeight;
  workPanel.top = top;
  workPanel.height = commitHeight;
  commitInput.height = inputHeight;
  commitButton.height = inputHeight;
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
  setVisible(repoAddButton, !state.collapsed.repositories);
  setVisible(repoArea, !state.collapsed.repositories);
  setVisible(commitInput, !state.collapsed.commit);
  setVisible(commitButton, !state.collapsed.commit);
  setVisible(changeArea, !state.collapsed.changes);
  setVisible(historyList, !state.collapsed.history);
}

function resizeCommitInput() {
  if (state.collapsed.commit) return;
  reflowLeftPanel();
  syncCommitInputScroll();
  screen.render();
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
  notice.display(` {bold}${escapeTags(message)}{/bold} `, 2, () => destroyElement(notice));
}

function setBusy(value, label = '') {
  state.busy = value;
  footer.setContent(value ? ` {yellow-fg}正在执行：${escapeTags(label)}{/yellow-fg}` : ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认');
  screen.render();
}

let reportingUnhandledError = false;

function reportUnhandledError(error) {
  if (reportingUnhandledError) return;
  reportingUnhandledError = true;
  try {
    const message = error && error.message ? error.message : String(error);
    state.busy = false;
    footer.setContent(` {red-fg}操作异常：${escapeTags(message)}{/red-fg}`);
    detailPanel.setLabel(' 程序异常 ');
    detailPanel.setContent(escapeTags(error && error.stack ? error.stack : message));
    screen.render();
  } catch (renderError) {
    try { screen.destroy(); } catch (_) {}
    console.error(renderError && renderError.stack ? renderError.stack : renderError);
  } finally {
    reportingUnhandledError = false;
  }
}

async function perform(label, operation, refresh = true, options = {}) {
  if (state.busy) return;
  try {
    setBusy(true, label);
    const result = await operation();
    if (refresh) await refreshRepo();
    if (!options.silentSuccess) toast(`${label}完成`, COLORS.green);
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
  clearChildren(repoContent);
  state.roots.forEach((root, index) => {
    const active = root === state.repo;
    const rowStyle = { fg: COLORS.text, bg: COLORS.panel, hover: { fg: COLORS.text, bg: COLORS.panelAlt } };
    const branch = active ? ` ${escapeTags(state.branch)}` : '';
    const indicator = active ? '{green-fg}●{/green-fg}' : ' ';
    const rowButton = button({
      parent: repoContent,
      top: index,
      left: 0,
      right: active ? 12 : 0,
      height: 1,
      shrink: false,
      padding: { left: 0, right: 0 },
      tags: true,
      content: `${indicator} ${escapeTags(path.basename(root))}${branch}`,
      style: rowStyle
    });
    rowButton.on('press', () => {
      if (root !== state.repo) selectRepo(root);
    });
    if (active) {
      const branchButton = button({
        parent: repoContent,
        top: index,
        right: 5,
        width: 6,
        height: 1,
        shrink: false,
        content: '分支',
        style: rowStyle
      });
      const moreButton = button({
        parent: repoContent,
        top: index,
        right: 0,
        width: 4,
        height: 1,
        shrink: false,
        content: '...',
        style: rowStyle
      });
      branchButton.on('press', () => branchSwitchMenu(branchButton));
      moreButton.on('press', () => repositoryMenu(moreButton));
    }
  });
  repoContent.height = Math.max(1, state.roots.length);
  resetScrollable(repoArea);
}

function statusMarker(code) {
  if (code === '??' || code.includes('A')) return { label: 'A', tag: 'green-fg' };
  if (code.includes('D')) return { label: 'D', tag: 'red-fg' };
  if (code.includes('R')) return { label: 'R', tag: 'magenta-fg' };
  return { label: 'M', tag: 'yellow-fg' };
}

function unregisterTree(element) {
  if (!element || !element.screen) return;
  const removeFrom = list => {
    let index = list.indexOf(element);
    while (index !== -1) {
      list.splice(index, 1);
      index = list.indexOf(element);
    }
  };
  removeFrom(element.screen.clickable || []);
  removeFrom(element.screen.keyable || []);
  [...element.children].forEach(unregisterTree);
}

function clearScreenMouseRefs(element) {
  if (!element || !element.screen) return;
  const contains = (root, target) => root === target || root.children.some(child => contains(child, target));
  if (element.screen.hover && contains(element, element.screen.hover)) element.screen.hover = null;
  if (element.screen.mouseDown && contains(element, element.screen.mouseDown)) element.screen.mouseDown = null;
}

function resetScrollable(element) {
  element.childBase = 0;
  element.childOffset = 0;
  if (element.lpos) delete element.lpos._scrollBottom;
}

function disposeTree(element) {
  if (!element) return;
  [...element.children].forEach(disposeTree);
  unregisterTree(element);
  element.removeAllListeners();
  element.children.length = 0;
  if (element.parent) element.parent.remove(element);
  element.parent = null;
  element.detached = true;
  element.destroyed = true;
}

function destroyElement(element) {
  if (!element || element.destroyed) return;
  clearScreenMouseRefs(element);
  disposeTree(element);
}

function closeDropdownMenu() {
  if (activeDropdownOutsideHandler) {
    screen.removeListener('mouse', activeDropdownOutsideHandler);
    activeDropdownOutsideHandler = null;
  }
  if (activeDropdownMenu) {
    const menu = activeDropdownMenu;
    activeDropdownMenu = null;
    destroyElement(menu);
  }
}

function clearChildren(element) {
  clearScreenMouseRefs(element);
  [...element.children].forEach(disposeTree);
  element.children.length = 0;
  resetScrollable(element);
}

function runUiAction(action, label = '操作') {
  try {
    const result = action();
    if (result && typeof result.then === 'function') {
      result.catch(error => toast(`${label}失败：${error.message}`, COLORS.red));
    }
  } catch (error) {
    toast(`${label}失败：${error.message}`, COLORS.red);
  }
}

function textWidth(value) {
  return String(value || '').replace(/\{\/?[^}]+}/g, '').length;
}

function anchorPosition(anchor, width, height) {
  const fallback = { top: 2, left: Math.max(1, screen.width - width - 2) };
  if (!anchor || !anchor.parent) return fallback;
  const pos = anchor.lpos || anchor._getCoords();
  if (!pos) return fallback;
  const maxLeft = Math.max(1, screen.width - width - 1);
  const left = Math.min(maxLeft, Math.max(1, pos.xi));
  const below = pos.yl;
  const above = pos.yi - height;
  const top = below + height < screen.height ? below : Math.max(1, above);
  return { top, left };
}

function pointInside(element, data) {
  const pos = element && (element.lpos || element._getCoords());
  if (!pos || data.x == null || data.y == null) return false;
  return data.x >= pos.xi && data.x < pos.xl && data.y >= pos.yi && data.y < pos.yl;
}

function isLiveRowState(rowState) {
  return rowState.elements.every(element => element.parent);
}

function applyFileRowState(rowState) {
  if (!isLiveRowState(rowState)) return;
  const bg = rowState.rowHover || rowState.groupHover ? fileRowHoverBg : COLORS.panel;
  rowState.elements.forEach(element => {
    element.style.bg = bg;
    if (element.style.hover) element.style.hover.bg = bg;
  });
}

function setRowHover(rowState, hovered) {
  if (!isLiveRowState(rowState)) return;
  rowState.rowHover = hovered;
  applyFileRowState(rowState);
  screen.render();
}

function bindFileRowHover(rowState) {
  rowState.elements.forEach(element => {
    element.on('mouseover', () => setRowHover(rowState, true));
    element.on('mouseout', () => setRowHover(rowState, false));
  });
}

function setGroupHover(rowStates, hovered) {
  if (!rowStates.every(isLiveRowState)) return;
  rowStates.forEach(rowState => {
    rowState.groupHover = hovered;
    applyFileRowState(rowState);
  });
  screen.render();
}

function bindGroupActionHover(actionButtons, rowStates) {
  actionButtons.forEach(actionButton => {
    actionButton.on('mouseover', () => setGroupHover(rowStates, true));
    actionButton.on('mouseout', () => setGroupHover(rowStates, false));
  });
}

function addFileGroup(title, files, mode, top) {
  const folded = state.collapsed[mode];
  const staged = mode === 'staged';
  const actionButtons = [];
  const rowStates = [];
  const heading = button({ parent: changeContent, top, left: 0, right: staged ? 3 : 6, height: 1, shrink: false, tags: true, content: `${sectionCaption(folded, title)} {gray-fg}(${files.length}){/gray-fg}` });
  heading.on('press', () => {
    state.collapsed[mode] = !state.collapsed[mode];
    renderChanges();
    screen.render();
  });
  if (staged) {
    const unstageAll = button({ parent: changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: '-', style: iconStyle });
    actionButtons.push(unstageAll);
    unstageAll.on('press', () => perform('取消所有暂存', () => git(['reset', 'HEAD']).catch(() => git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))));
  } else {
    const discardAll = button({ parent: changeContent, top, right: 3, width: 3, height: 1, shrink: false, content: '-', style: iconStyle });
    const stageAll = button({ parent: changeContent, top, right: 0, width: 3, height: 1, shrink: false, content: '+', style: iconStyle });
    actionButtons.push(discardAll, stageAll);
    discardAll.on('press', discardAllChanges);
    stageAll.on('press', () => perform('暂存所有更改', () => git(['add', '-A'])));
  }
  if (folded) {
    bindGroupActionHover(actionButtons, rowStates);
    return top + 1;
  }
  let row = top + 1;
  for (const item of files) {
    const marker = statusMarker(item.code);
    const rowBg = blessed.box({ parent: changeContent, top: row, left: 0, right: 0, height: 1, style: { bg: COLORS.panel } });
    const rowElements = [rowBg];
    const main = button({ parent: changeContent, top: row, left: 2, right: staged ? 3 : 6, height: 1, shrink: false, padding: { left: 0, right: 0 }, tags: true, content: `{${marker.tag}}${marker.label}{/${marker.tag}}  ${escapeTags(item.file)}` });
    rowElements.push(main);
    main.on('press', () => showFileDiff(item, staged));
    if (staged) {
      const unstageButton = button({ parent: changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '-', style: iconStyle });
      rowElements.push(unstageButton);
      unstageButton.on('press', () => unstage(item.file));
    } else {
      const undoButton = button({ parent: changeContent, top: row, right: 3, width: 3, height: 1, shrink: false, content: '-', style: iconStyle });
      const stageButton = button({ parent: changeContent, top: row, right: 0, width: 3, height: 1, shrink: false, content: '+', style: iconStyle });
      rowElements.push(undoButton, stageButton);
      undoButton.on('press', () => discard(item.file, item.code === '??'));
      stageButton.on('press', () => stage(item.file));
    }
    const rowState = { elements: rowElements, rowHover: false, groupHover: false };
    rowStates.push(rowState);
    bindFileRowHover(rowState);
    row += 1;
  }
  bindGroupActionHover(actionButtons, rowStates);
  return row;
}

function renderChanges() {
  clearChildren(changeContent);
  let top = 0;
  top = addFileGroup('暂存的更改', state.status.staged, 'staged', top);
  top = addFileGroup('更改', [...state.status.unstaged, ...state.status.untracked], 'unstaged', top);
  if (top === 0) blessed.box({ parent: changeContent, top: 1, left: 1, content: '{green-fg}工作区干净{/green-fg}', tags: true });
  changeContent.height = Math.max(1, top + 1);
  resetScrollable(changeArea);
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

async function selectRepo(root, options = {}) {
  state.repo = root;
  state.selected = null;
  await perform('加载仓库', refreshRepo, false, options);
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
  yes.on('press', () => { destroyElement(modal); runUiAction(onConfirm, title); screen.render(); });
  no.on('press', () => { destroyElement(modal); screen.render(); });
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
  cancel.on('press', () => { destroyElement(modal); screen.render(); });
  ok.on('press', () => { const value = input.getValue().trim(); if (!value) { toast('请输入内容', COLORS.yellow); return; } destroyElement(modal); runUiAction(() => submit(value), title); screen.render(); });
  screen.render();
}

function showMenu(title, entries, anchor) {
  closeDropdownMenu();
  const visibleEntries = entries.slice(0, 18);
  const width = Math.min(64, Math.max(18, textWidth(title) + 6, ...visibleEntries.map(entry => textWidth(entry.label) + 4)));
  const height = Math.max(3, visibleEntries.length + 2);
  const position = anchorPosition(anchor, width, height);
  const modal = box({
    parent: screen,
    top: position.top,
    left: position.left,
    width,
    height,
    label: ` ${title} `,
    style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.accent } }
  });
  activeDropdownMenu = modal;
  visibleEntries.forEach((entry, index) => {
    const item = button({
      parent: modal,
      top: index + 1,
      left: 1,
      right: 1,
      height: 1,
      shrink: false,
      tags: true,
      padding: { left: 1, right: 1 },
      content: entry.label,
      style: {
        fg: COLORS.text,
        bg: COLORS.panel,
        hover: { fg: COLORS.text, bg: COLORS.panelAlt },
        focus: { fg: COLORS.text, bg: COLORS.panelAlt }
      }
    });
    item.on('press', () => {
      const itemAnchor = { lpos: item.lpos, parent: screen };
      closeDropdownMenu();
      runUiAction(() => entry.action(itemAnchor), title);
      screen.render();
    });
  });
  activeDropdownOutsideHandler = data => {
    if (!data || data.action === 'mousemove' || pointInside(modal, data)) return;
    closeDropdownMenu();
    screen.render();
  };
  setImmediate(() => screen.on('mouse', activeDropdownOutsideHandler));
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

function networkMenu(anchor) {
  showMenu('网络操作', [
    { label: '拉取  git pull --no-rebase', action: () => perform('拉取', () => git(['pull', '--no-rebase'])) },
    { label: '推送  git push', action: () => perform('推送', () => git(['push'])) },
    { label: '抓取  git fetch --prune', action: () => perform('抓取', () => git(['fetch', '--prune'])) },
    { label: '发布当前分支到 origin', action: () => perform('发布分支', () => git(['push', '-u', 'origin', state.branch])) }
  ], anchor);
}

async function localBranches() {
  return (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => '')).split(/\r?\n/).filter(Boolean);
}

async function branchSwitchMenu(anchor) {
  const branches = await localBranches();
  const entries = branches.length
    ? branches.map(name => ({
      label: `${name === state.branch ? '{green-fg}●{/green-fg} ' : '○ '}切换到 ${escapeTags(name)}`,
      action: () => name === state.branch ? toast('已在当前分支') : perform(`切换到 ${name}`, () => git(['switch', name]))
    }))
    : [{ label: '没有本地分支', action: () => {} }];
  showMenu('切换分支', entries, anchor);
}

async function branchMenu(anchor) {
  const branches = await localBranches();
  showMenu('分支管理', [
    { label: '新建分支', action: () => textDialog('新建分支', '通过屏幕软键盘输入分支名', name => perform('创建分支', () => git(['switch', '-c', name]))) },
    { label: '合并分支', action: menuAnchor => mergeMenu(branches, menuAnchor) },
    { label: '删除分支', action: menuAnchor => deleteBranchMenu(branches, menuAnchor) },
    ...branches.map(name => ({ label: `${name === state.branch ? '{green-fg}●{/green-fg} ' : '○ '}切换到 ${escapeTags(name)}`, action: () => name === state.branch ? toast('已在当前分支') : perform(`切换到 ${name}`, () => git(['switch', name])) }))
  ], anchor);
}

function mergeMenu(branches, anchor) {
  const options = branches.filter(name => name !== state.branch).map(name => ({ label: `合并 ${escapeTags(name)} 到 ${escapeTags(state.branch)}`, action: () => confirm('合并分支', `将 ${name} 合并到 ${state.branch}，确定继续吗？`, () => perform('合并分支', () => git(['merge', '--no-edit', name]))) }));
  showMenu('选择要合并的分支', options.length ? options : [{ label: '没有可合并的其他本地分支', action: () => {} }], anchor);
}

function deleteBranchMenu(branches, anchor) {
  const options = branches.filter(name => name !== state.branch).map(name => ({ label: `{red-fg}删除{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除分支', `删除本地分支 ${name} 吗？未合并的提交会阻止删除。`, () => perform('删除分支', () => git(['branch', '-d', name]))) }));
  showMenu('选择要删除的分支', options.length ? options : [{ label: '当前没有可删除的其他本地分支', action: () => {} }], anchor);
}

async function stashMenu(anchor) {
  const stashes = (await git(['stash', 'list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('储藏', [
    { label: '储藏当前更改', action: () => textDialog('储藏当前更改', '输入储藏说明', message => perform('储藏', () => git(['stash', 'push', '-m', message]))) },
    { label: '应用最新储藏', action: () => perform('应用储藏', () => git(['stash', 'pop'])) },
    ...stashes.map((stash, index) => ({ label: `{yellow-fg}${escapeTags(stash)}{/yellow-fg}`, action: menuAnchor => stashDetailMenu(index, stash, menuAnchor) }))
  ], anchor);
}

function stashDetailMenu(index, stash, anchor) {
  showMenu(`储藏 ${index}`, [
    { label: '查看差异', action: async () => { const diff = await git(['stash', 'show', '-p', `stash@{${index}}`]); detailPanel.setContent(formatDiff(diff)); detailPanel.setLabel(` 储藏：${index} `); screen.render(); } },
    { label: '应用但保留', action: () => perform('应用储藏', () => git(['stash', 'apply', `stash@{${index}}`])) },
    { label: '弹出并删除', action: () => perform('弹出储藏', () => git(['stash', 'pop', `stash@{${index}}`])) },
    { label: '{red-fg}删除储藏{/red-fg}', action: () => confirm('删除储藏', `删除 ${stash} 吗？`, () => perform('删除储藏', () => git(['stash', 'drop', `stash@{${index}}`]))) }
  ], anchor);
}

async function tagMenu(anchor) {
  const tags = (await git(['tag', '--list']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('标签', [
    { label: '新建轻量标签（当前 HEAD）', action: () => textDialog('新建标签', '输入标签名，例如 v1.0.0', name => perform('创建标签', () => git(['tag', name]))) },
    ...tags.map(name => ({ label: `{red-fg}删除{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除标签', `删除本地标签 ${name} 吗？`, () => perform('删除标签', () => git(['tag', '-d', name]))) }))
  ], anchor);
}

async function remoteMenu(anchor) {
  const names = (await git(['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean);
  showMenu('远程仓库', [
    { label: '添加远程仓库', action: () => textDialog('远程名称', '例如 origin', name => textDialog('远程地址', '例如 https://example.com/repo.git', url => perform('添加远程', () => git(['remote', 'add', name, url])))) },
    ...names.map(name => ({ label: `查看 ${escapeTags(name)}`, action: async () => { const url = await git(['remote', 'get-url', name]); detailPanel.setLabel(' 远程仓库 '); detailPanel.setContent(`${name}\n${url}`); screen.render(); } })),
    ...names.map(name => ({ label: `{red-fg}删除远程{/red-fg} ${escapeTags(name)}`, action: () => confirm('删除远程', `删除远程 ${name} 吗？`, () => perform('删除远程', () => git(['remote', 'remove', name]))) }))
  ], anchor);
}

function actionMenu(anchor) {
  showMenu('Git 操作', [
    { label: '{cyan-fg}网络：拉取、推送、抓取{/cyan-fg}', action: menuAnchor => networkMenu(menuAnchor) },
    { label: '{green-fg}分支：新建、切换、合并、删除{/green-fg}', action: menuAnchor => branchMenu(menuAnchor) },
    { label: '{yellow-fg}储藏：保存、应用、删除{/yellow-fg}', action: menuAnchor => stashMenu(menuAnchor) },
    { label: '{purple-fg}标签：创建、删除{/purple-fg}', action: menuAnchor => tagMenu(menuAnchor) },
    { label: '远程仓库：添加、查看、删除', action: menuAnchor => remoteMenu(menuAnchor) },
    { label: '{red-fg}撤销最近一次提交（保留暂存区）{/red-fg}', action: () => confirm('撤销提交', '将使用 git reset --soft HEAD~1，提交会被撤销但内容保留在暂存区。', () => perform('撤销提交', () => git(['reset', '--soft', 'HEAD~1']))) }
  ], anchor);
}

function repositoryMenu(anchor) {
  showMenu('存储库', [
    { label: '刷新当前存储库', action: () => perform('刷新', refreshRepo, false) },
    { label: '查看当前存储库路径', action: () => { detailPanel.setLabel(' 存储库路径 '); detailPanel.setContent(escapeTags(state.repo || '未选择')); screen.render(); } }
  ], anchor);
}

function changesMenu(anchor) {
  showMenu('更改', [
    { label: '暂存所有更改', action: () => perform('暂存所有更改', () => git(['add', '-A'])) },
    { label: '取消所有暂存', action: () => perform('取消所有暂存', () => git(['reset', 'HEAD']).catch(() => git(['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']))) },
    { label: '{red-fg}丢弃全部本地更改{/red-fg}', action: () => discardAllChanges() }
  ], anchor);
}

function historyMenu(anchor) {
  showMenu('图表', [
    { label: '刷新提交历史', action: () => perform('刷新历史', refreshRepo, false) },
    { label: '查看当前分支日志', action: async () => { const log = await git(['log', '--graph', '--decorate', '--oneline', '-n', '180']); detailPanel.setLabel(' 当前分支图表 '); detailPanel.setContent(formatDiff(log)); detailPanel.setScroll(0); screen.render(); } },
    { label: '打开 Git 操作菜单', action: menuAnchor => actionMenu(menuAnchor) }
  ], anchor);
}

function discardAllChanges() {
  confirm('丢弃全部更改', '这会还原已跟踪文件并永久删除未跟踪文件，确定继续吗？', () => perform('丢弃全部更改', async () => {
    await git(['restore', '--source=HEAD', '--staged', '--worktree', '.']);
    await git(['clean', '-fd']);
  }));
}

historyList.on('select', (_, index) => { if (state.history[index]) showCommit(state.history[index]); });
refreshButton.on('press', () => perform('刷新', refreshRepo, false));
actionButton.on('press', () => actionMenu(actionButton));
exitButton.on('press', () => { screen.destroy(); process.exit(0); });
repoHeader.on('press', () => toggleSection('repositories'));
commitHeader.on('press', () => toggleSection('commit'));
changeHeader.on('press', () => toggleSection('changes'));
historyHeader.on('press', () => toggleSection('history'));
commitMoreButton.on('press', () => actionMenu(commitMoreButton));
changeMoreButton.on('press', () => changesMenu(changeMoreButton));
historyMoreButton.on('press', () => historyMenu(historyMoreButton));
commitInput.on('keypress', () => setImmediate(resizeCommitInput));
repoAddButton.on('press', () => textDialog('添加仓库', '输入 Git 仓库目录的完整路径', async directory => {
  const root = await findGitRoot(directory);
  if (!root) { toast('该目录不是 Git 仓库', COLORS.red); return; }
  if (!state.roots.includes(root)) state.roots.push(root);
  await selectRepo(root);
}));
commitButton.on('press', () => {
  const message = commitInput.getValue().trim();
  if (!message) { toast('请输入提交消息', COLORS.yellow); commitInput.focus(); screen.render(); return; }
  if (!state.status.staged.length) { toast('没有已暂存的更改', COLORS.yellow); return; }
  confirm('创建提交', `使用以下提交消息：\n${message}`, () => perform('提交', async () => { await git(['commit', '-m', message]); commitInput.clearValue(); resizeCommitInput(); }));
});

screen.on('resize', () => { reflowLeftPanel(); screen.render(); });
screen.key(['C-c'], () => { screen.destroy(); process.exit(0); });
process.on('uncaughtException', reportUnhandledError);
process.on('unhandledRejection', reportUnhandledError);

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
  await selectRepo(state.roots[0], { silentSuccess: true });
}()).catch(error => {
  detailPanel.setContent(`初始化失败：${error.message}`);
  screen.render();
});
