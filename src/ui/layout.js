'use strict';

function createLayout(app) {
  const blessed = app.blessed;
  const COLORS = app.COLORS;
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    mouse: true,
    title: 'GitUI Mouse',
    dockBorders: true,
    autoPadding: false
  });
  const rawScreenRender = screen.render.bind(screen);
  screen.render = function renderWithCleanTree() {
    app.sanitizeTree(screen);
    return rawScreenRender();
  };

  screen.program.setMouse({ vt200Mouse: true, sgrMouse: true, utfMouse: true, cellMotion: true }, true);
  screen.enableMouse();
  screen.program.hideCursor();

  app.screen = screen;
  app.regionBorder = { type: 'line', fg: COLORS.border };
  app.iconStyle = { fg: 'brightwhite', bg: COLORS.panel, bold: true };
  app.fileRowHoverBg = COLORS.panelAlt;

  app.header = blessed.box({
    top: 0, left: 0, height: 3, width: '100%',
    tags: true, mouse: true, style: { fg: COLORS.text, bg: '#111a28' },
    content: ' {bold}GitUI Mouse{/bold}  {gray-fg}VS Code 风格的终端源码管理{/gray-fg}'
  });
  app.refreshButton = app.button({ parent: app.header, right: 33, top: 1, content: '刷新' });
  app.actionButton = app.button({ parent: app.header, right: 22, top: 1, content: '操作' });
  app.exitButton = app.button({ parent: app.header, right: 11, top: 1, content: '退出' });

  app.leftPanel = blessed.box({ left: 0, top: 0, width: '42%', bottom: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
  app.repoPanel = blessed.box({ parent: app.leftPanel, top: 0, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.workPanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.changePanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.historyPanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.detailPanel = app.box({ left: '42%', top: 0, right: 0, bottom: 0, border: app.regionBorder, label: ' 文件修改对比 ', scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.footer = blessed.box({ left: 0, bottom: 0, width: '100%', height: 2, tags: true, style: { fg: COLORS.dim, bg: '#111a28' }, content: ' 鼠标点击所有操作 · 提交消息可直接键盘输入 · 破坏性操作会要求确认' });
  screen.append(app.detailPanel);
  screen.append(app.leftPanel);
  app.screenExitButton = app.button({ parent: screen, top: 0, right: 1, width: 6, height: 1, content: '退出', align: 'center', style: { fg: COLORS.text, bg: COLORS.panel, hover: { fg: COLORS.red, bg: COLORS.panelAlt } } });

  app.repoHeader = app.button({ parent: app.repoPanel, top: 1, left: 1, right: 5, height: 1, tags: true, content: '▾ 存储库' });
  app.repoAddButton = app.button({ parent: app.repoPanel, top: 1, right: 1, width: 3, height: 1, content: '+', style: app.iconStyle });
  app.repoArea = blessed.box({ parent: app.repoPanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.repoContent = blessed.box({ parent: app.repoArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

  app.commitHeader = app.button({ parent: app.workPanel, top: 1, left: 1, right: 7, height: 1, tags: true, content: '▾ 提交' });
  app.commitMoreButton = app.button({ parent: app.workPanel, top: 1, right: 1, width: 6, height: 1, content: '...' });
  app.commitInput = blessed.textarea({ parent: app.workPanel, top: 2, left: 2, right: 8, height: 3, mouse: true, inputOnFocus: true, keys: false, tags: false, border: 'line', style: { fg: COLORS.text, bg: '#121925', border: { fg: COLORS.border }, focus: { border: { fg: COLORS.accent } } } });
  app.commitButton = app.button({ parent: app.workPanel, top: 2, right: 1, width: 6, height: 3, shrink: false, align: 'center', valign: 'middle', content: '提交' });

  app.changeHeader = app.button({ parent: app.changePanel, top: 1, left: 1, right: 6, height: 1, tags: true, content: '▾ 更改' });
  app.changeMoreButton = app.button({ parent: app.changePanel, top: 1, right: 1, width: 4, height: 1, content: '...' });
  app.changeArea = blessed.box({ parent: app.changePanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.changeContent = blessed.box({ parent: app.changeArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

  app.historyHeader = app.button({ parent: app.historyPanel, top: 1, left: 1, right: 7, height: 1, tags: true, content: '▾ 提交历史' });
  app.historyMoreButton = app.button({ parent: app.historyPanel, top: 1, right: 1, width: 6, height: 1, content: '...' });
  app.historyArea = blessed.box({ parent: app.historyPanel, top: 2, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.historyContent = blessed.box({ parent: app.historyArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
}

module.exports = { createLayout };
