'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function getNotesPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'notes.json')
    : path.join(__dirname, '..', 'notes.json');
}

function readAll() {
  const p = getNotesPath();
  try {
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[notes] Failed to read:', e.message);
    return [];
  }
}

function writeAll(data) {
  const p = getNotesPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[notes] Failed to write:', e.message);
  }
}

function getAll() {
  return readAll();
}

function addNote(text, type = 'bug') {
  const all = readAll();
  const now = new Date();
  const date = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  all.push({
    id:   crypto.randomBytes(3).toString('hex'),
    text: text.trim(),
    type,
    date
  });

  writeAll(all);
  return all;
}

function deleteNote(id) {
  const all = readAll().filter(e => e.id !== id);
  writeAll(all);
  return all;
}

module.exports = { getAll, addNote, deleteNote };
