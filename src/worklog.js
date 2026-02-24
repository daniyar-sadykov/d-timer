'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function getWorklogPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'worklog.json')
    : path.join(__dirname, '..', 'worklog.json');
}

function readAll() {
  const p = getWorklogPath();
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[worklog] Failed to read:', e.message);
    return {};
  }
}

function writeAll(data) {
  const p = getWorklogPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[worklog] Failed to write:', e.message);
  }
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getToday() {
  const all = readAll();
  return all[todayKey()] || [];
}

function addEntry(text) {
  const all = readAll();
  const key = todayKey();
  if (!all[key]) all[key] = [];

  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0');

  all[key].push({
    id:   crypto.randomBytes(3).toString('hex'),
    text: text.trim(),
    time
  });

  writeAll(all);
  return all[key];
}

function deleteEntry(id) {
  const all = readAll();
  const key = todayKey();
  if (!all[key]) return [];

  all[key] = all[key].filter(e => e.id !== id);
  writeAll(all);
  return all[key];
}

module.exports = { getToday, addEntry, deleteEntry };
