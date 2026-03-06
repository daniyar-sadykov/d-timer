'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell
} = require('electron');
const path   = require('path');
const config  = require('./config');
const worklog = require('./worklog');
const notes   = require('./notes');
const { sendTelegramMessage } = require('./telegram');

let mainWindow = null;
let tray       = null;

const WIN_W = 300;
const WIN_H = 200;

// ─── Window Creation ──────────────────────────────────────────────────────────
function createWindow() {
  const cfg = config.read();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  // Restore saved position, or center on screen
  let startX = cfg.window.x !== null ? cfg.window.x : Math.round((sw - WIN_W) / 2);
  let startY = cfg.window.y !== null ? cfg.window.y : Math.round((sh - WIN_H) / 2);

  // Clamp position to screen bounds (handles changed display configs)
  startX = Math.max(0, Math.min(startX, sw - WIN_W));
  startY = Math.max(0, Math.min(startY, sh - WIN_H));

  mainWindow = new BrowserWindow({
    width:           WIN_W,
    height:          WIN_H,
    x:               startX,
    y:               startY,
    icon:            path.join(__dirname, '..', 'assets', 'icon.ico'),
    frame:           false,
    transparent:     false,
    alwaysOnTop:     true,
    resizable:       false,
    skipTaskbar:     false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Persist position on every move
  mainWindow.on('moved', saveWindowPosition);

  // Close window = quit app
  mainWindow.on('close', () => {
    saveWindowPosition();
  });
}

function saveWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [x, y] = mainWindow.getPosition();
  const cfg = config.read();
  config.write({ ...cfg, window: { x, y } });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = createFallbackIcon();
    } else {
      // Resize to standard tray icon size (Windows: 16x16 or 32x32)
      icon = icon.resize({ width: 32, height: 32 });
    }
  } catch {
    icon = createFallbackIcon();
  }

  tray = new Tray(icon);
  tray.setToolTip('D-Timer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => { mainWindow?.show(); mainWindow?.focus(); }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// Simple 16x16 green square as fallback tray icon
function createFallbackIcon() {
  // 16x16 solid #7fff8c PNG (base64)
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIUlEQVQ4jWNg' +
              'YGD4z8BAgGEiGzaqYVQDVMOohpEHAAAjQQABbkMJ4QAAAABJRU5ErkJggg==';
  return nativeImage.createFromDataURL(`data:image/png;base64,${b64}`);
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => config.read());

ipcMain.handle('config:set', (event, partial) => config.update(partial));

ipcMain.handle('telegram:send', async (event, message) => {
  const cfg = config.read();
  if (!cfg.bot_token || !cfg.chat_id) {
    return { ok: false, error: 'bot_token or chat_id not configured. Open Settings (⚙) to add your Telegram Chat ID.' };
  }
  return sendTelegramMessage(cfg.bot_token, cfg.chat_id, message);
});

// ─── Worklog Handlers ──────────────────────────────────────────────────────
ipcMain.handle('worklog:get', () => worklog.getToday());

ipcMain.handle('worklog:add', (event, text) => worklog.addEntry(text));

ipcMain.handle('worklog:delete', (event, id) => worklog.deleteEntry(id));

// ─── Notes Handlers ───────────────────────────────────────────────────────
ipcMain.handle('notes:get', () => notes.getAll());

ipcMain.handle('notes:add', (event, text, type) => notes.addNote(text, type));

ipcMain.handle('notes:delete', (event, id) => notes.deleteNote(id));

ipcMain.handle('window:resize', (event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setResizable(true);
  mainWindow.setSize(width, height);
  mainWindow.setResizable(false);
});

ipcMain.handle('shell:open', (event, url) => {
  const ALLOWED = ['t.me', 'telegram.me', 'telegram.org'];
  try {
    const parsed = new URL(url);
    if (ALLOWED.includes(parsed.hostname)) shell.openExternal(url);
  } catch {}
});

ipcMain.handle('window:close', () => {
  app.quit();
});

ipcMain.handle('window:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.minimize();
});

// ─── Single Instance Lock ─────────────────────────────────────────────────────
// Если уже запущен один экземпляр — показываем его окно и выходим из нового
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Это второй экземпляр — просто завершаемся
  app.quit();
} else {
  // Когда второй экземпляр пытается запуститься — показываем существующее окно
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  // ─── App Lifecycle ──────────────────────────────────────────────────────────
  app.whenReady().then(() => {
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
