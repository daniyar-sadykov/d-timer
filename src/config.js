'use strict';

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

// Compute lazily so app is fully initialized when first called
function getConfigPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'config.json')
    : path.join(__dirname, '..', 'config.json');
}

const DEFAULTS = {
  bot_token:   '',
  chat_id:     '',
  hourly_rate: 20,
  window: { x: null, y: null }
};

function read() {
  const configPath = getConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      // First run in packaged mode: seed from the bundled config.json
      // that electron-builder copies next to the exe (extraFiles).
      const bundled = getBundledConfigPath();
      const initial = bundled && fs.existsSync(bundled)
        ? { ...DEFAULTS, ...JSON.parse(fs.readFileSync(bundled, 'utf8')) }
        : { ...DEFAULTS };
      write(initial);
      return initial;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('[config] Failed to read config:', e.message);
    return { ...DEFAULTS };
  }
}

// In packaged app, config.json is placed next to the .exe via extraFiles
function getBundledConfigPath() {
  if (!app.isPackaged) return null;
  return path.join(path.dirname(app.getPath('exe')), 'config.json');
}

function write(data) {
  const configPath = getConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[config] Failed to write config:', e.message);
  }
}

function update(partial) {
  const current = read();
  const merged  = { ...current, ...partial };
  write(merged);
  return merged;
}

module.exports = { read, write, update, getConfigPath };
