'use strict';

function createLayout(app) {
  const blessed = app.blessed;
  const COLORS = app.COLORS;
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    mouse: true,
    sendFocus: true,
    title: 'Gitmous',
    dockBorders: true,
    autoPadding: false
  });
  const rawScreenRender = screen.render.bind(screen);
  screen.render = function renderWithCleanTree() {
    app.sanitizeTree(screen);
    return rawScreenRender();
  };

  app.screen = screen;
  app.restoreTerminalMouseTracking();
  screen.program.hideCursor();
  app.regionBorder = { type: 'line', fg: COLORS.border };
  app.iconStyle = { fg: COLORS.accent, bg: COLORS.panel, bold: true };
  app.sectionTitleStyle = {
    fg: COLORS.text,
    bg: COLORS.panel,
    hover: { fg: COLORS.text, bg: COLORS.panelAlt },
    focus: { fg: COLORS.text, bg: COLORS.panelAlt }
  };
  app.fileRowHoverBg = COLORS.panelAlt;

  app.header = blessed.box({
    top: 0, left: 0, height: 3, width: '100%',
    tags: true, mouse: true, style: { fg: COLORS.text, bg: '#111a28' },
    content: ` {bold}Gitmous{/bold}  {gray-fg}${app.t('appSubtitle')}{/gray-fg}`
  });
  app.refreshButton = app.button({ parent: app.header, right: 33, top: 1, content: app.t('refresh') });
  app.actionButton = app.button({ parent: app.header, right: 22, top: 1, content: app.t('actions') });
  app.exitButton = app.button({ parent: app.header, right: 11, top: 1, content: app.t('exit') });

  app.leftPanel = blessed.box({ left: 0, top: 0, width: '42%', bottom: 0, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
  app.repoPanel = blessed.box({ parent: app.leftPanel, top: 0, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.workPanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.changePanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.historyPanel = blessed.box({ parent: app.leftPanel, left: 0, right: 0, mouse: true, border: app.regionBorder, style: { fg: COLORS.text, bg: COLORS.panel, border: { fg: COLORS.border } } });
  app.detailPanel = app.box({ left: '42%', top: 0, right: 0, bottom: 0, border: app.regionBorder, label: app.detailPanelTitle(app.t('detailPanel')), scrollable: true, alwaysScroll: true, wrap: false, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.footer = blessed.box({ left: 0, bottom: 0, width: '100%', height: 2, tags: true, style: { fg: COLORS.dim, bg: '#111a28' }, content: app.t('footerIdle') });
  screen.append(app.detailPanel);
  screen.append(app.leftPanel);
  app.detailAbortMergeButton = app.button({ parent: screen, top: 0, right: 23, width: 3, height: 1, shrink: false, content: '-', align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailOursButton = app.button({ parent: screen, top: 0, right: 20, width: 3, height: 1, shrink: false, content: 'O', align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailTheirsButton = app.button({ parent: screen, top: 0, right: 17, width: 3, height: 1, shrink: false, content: 'T', align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailResolvedButton = app.button({ parent: screen, top: 0, right: 14, width: 3, height: 1, shrink: false, content: '✓', align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailAbortMergeButton.hide();
  app.detailOursButton.hide();
  app.detailTheirsButton.hide();
  app.detailResolvedButton.hide();
  app.detailPanelCollapseButton = app.button({ parent: screen, top: 0, left: '42%', width: 3, height: 1, shrink: false, content: '◀', align: 'center', style: app.iconStyle });
  app.detailToggleButton = app.button({ parent: screen, top: 0, right: 5, width: 8, height: 1, content: app.t('expand'), align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailToggleButton.hide();
  app.detailPanelExpandButton = app.button({ parent: screen, top: 0, right: 5, width: 3, height: 1, shrink: false, content: '▶', align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });
  app.detailPanelExpandButton.hide();
  app.languageButton = app.button({ parent: screen, top: 0, right: 1, width: 4, height: 1, content: app.t('settings'), align: 'center', style: { fg: COLORS.accent, bg: COLORS.panel, hover: { fg: COLORS.accent, bg: COLORS.panelAlt } } });

  app.repoCollapseButton = app.button({ parent: app.repoPanel, top: 0, left: 2, width: 3, height: 1, shrink: false, content: '▾', align: 'center', style: app.iconStyle });
  app.repoHeader = app.button({ parent: app.repoPanel, top: 0, left: 5, width: 10, height: 1, tags: true, padding: { left: 0, right: 0 }, content: ` ${app.t('repositories')} `, style: app.sectionTitleStyle });
  app.repoHeader.__collapseButton = app.repoCollapseButton;
  app.repoAddButton = app.button({ parent: app.repoPanel, top: 0, right: 1, width: 3, height: 1, content: '+', style: app.iconStyle });
  app.repoArea = blessed.box({ parent: app.repoPanel, top: 1, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.repoContent = blessed.box({ parent: app.repoArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

  app.commitCollapseButton = app.button({ parent: app.workPanel, top: 0, left: 2, width: 3, height: 1, shrink: false, content: '▾', align: 'center', style: app.iconStyle });
  app.commitHeader = app.button({ parent: app.workPanel, top: 0, left: 5, width: 8, height: 1, tags: true, padding: { left: 0, right: 0 }, content: ` ${app.t('commit')} `, style: app.sectionTitleStyle });
  app.commitHeader.__collapseButton = app.commitCollapseButton;
  app.commitInput = blessed.textarea({ parent: app.workPanel, top: 1, left: 2, right: 8, height: 1, mouse: true, inputOnFocus: true, keys: true, tags: false, style: { fg: COLORS.text, bg: COLORS.panel, focus: { fg: COLORS.text, bg: COLORS.panel } } });
  const defaultCommitInputListener = app.commitInput._listener;
  app.commitInput._listener = function keepImeInputActive(ch, key = {}) {
    // 输入法切换会发送 Esc，不能将其当作取消提交消息输入。
    if (key.name === 'escape') return;
    return defaultCommitInputListener.call(this, ch, key);
  };
  app.commitPlaceholder = blessed.box({ parent: app.workPanel, top: 1, left: 2, right: 8, height: 1, mouse: true, tags: false, content: app.t('commitPlaceholder'), style: { fg: COLORS.dim, bg: COLORS.panel } });
  app.commitButton = app.button({
    parent: app.workPanel,
    top: 1,
    right: 1,
    width: 6,
    height: 1,
    shrink: false,
    align: 'center',
    valign: 'middle',
    content: app.t('commitButton'),
    style: {
      fg: COLORS.accent,
      bg: COLORS.panel,
      bold: true,
      hover: { fg: COLORS.accent, bg: COLORS.panelAlt },
      focus: { fg: COLORS.accent, bg: COLORS.panelAlt, bold: true }
    }
  });

  app.changeCollapseButton = app.button({ parent: app.changePanel, top: 0, left: 2, width: 3, height: 1, shrink: false, content: '▾', align: 'center', style: app.iconStyle });
  app.changeHeader = app.button({ parent: app.changePanel, top: 0, left: 5, width: 8, height: 1, tags: true, padding: { left: 0, right: 0 }, content: ` ${app.t('changes')} `, style: app.sectionTitleStyle });
  app.changeHeader.__collapseButton = app.changeCollapseButton;
  app.changeArea = blessed.box({ parent: app.changePanel, top: 1, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.changeContent = blessed.box({ parent: app.changeArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });

  app.historyCollapseButton = app.button({ parent: app.historyPanel, top: 0, left: 2, width: 3, height: 1, shrink: false, content: '▾', align: 'center', style: app.iconStyle });
  app.historyHeader = app.button({ parent: app.historyPanel, top: 0, left: 5, width: 12, height: 1, tags: true, padding: { left: 0, right: 0 }, content: ` ${app.t('history')} `, style: app.sectionTitleStyle });
  app.historyHeader.__collapseButton = app.historyCollapseButton;
  app.historyArea = blessed.box({ parent: app.historyPanel, top: 1, left: 1, right: 1, bottom: 1, mouse: true, scrollable: true, alwaysScroll: true, style: { fg: COLORS.text, bg: COLORS.panel }, scrollbar: { ch: ' ', style: { bg: COLORS.accent } } });
  app.historyContent = blessed.box({ parent: app.historyArea, top: 0, left: 0, right: 0, height: 1, mouse: true, style: { fg: COLORS.text, bg: COLORS.panel } });
}

module.exports = { createLayout };
