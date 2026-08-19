'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_SETTINGS = {
  language: 'en',
  themeColor: '#58b6e8',
  detailDiffExpanded: false
};

function normalizeColorValue(value) {
  const text = String(value || '').trim();
  const hex = text.match(/^#?([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgb = text.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!rgb) return '';
  const values = rgb.slice(1).map(Number);
  if (values.some(item => item < 0 || item > 255)) return '';
  return `#${values.map(item => item.toString(16).padStart(2, '0')).join('')}`;
}

function settingsDirectory() {
  const base = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(base, 'gitui-mouse');
}

function settingsFilePath() {
  return path.join(settingsDirectory(), 'settings.json');
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const language = ['en', 'zh'].includes(source.language) ? source.language : DEFAULT_SETTINGS.language;
  const themeColor = normalizeColorValue(source.themeColor) || DEFAULT_SETTINGS.themeColor;
  const detailDiffExpanded = typeof source.detailDiffExpanded === 'boolean' ? source.detailDiffExpanded : DEFAULT_SETTINGS.detailDiffExpanded;
  return { language, themeColor, detailDiffExpanded };
}

function loadSettings() {
  const file = settingsFilePath();
  try {
    if (!fs.existsSync(file)) return { file, settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { file, settings: normalizeSettings(parsed) };
  } catch (_) {
    return { file, settings: { ...DEFAULT_SETTINGS } };
  }
}

function saveSettings(settings) {
  const file = settingsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized = normalizeSettings(settings);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
  return { file, settings: normalized };
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeColorValue,
  saveSettings,
  settingsFilePath
};
