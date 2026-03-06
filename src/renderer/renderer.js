'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  status:        'idle',    // 'idle' | 'running' | 'paused'
  startWallTime: null,      // Date.now() when current segment started
  accumulatedMs: 0,         // Total ms from all completed segments
  sessionStart:  null,      // Wall-clock time of the very first Start press
  intervalId:    null,
  hourlyRate:    20,
  settingsOpen:  false,
  worklogOpen:   false,
  worklogEntries: []        // Today's entries cache
};

// ─── DOM ─────────────────────────────────────────────────────────────────────
const timerEl           = document.getElementById('timer-display');
const earningsEl        = document.getElementById('earnings-display');
const btnStart          = document.getElementById('btn-start');
const btnPause          = document.getElementById('btn-pause');
const btnStop           = document.getElementById('btn-stop');
const btnSettings       = document.getElementById('btn-settings');
const btnClose          = document.getElementById('btn-close');
const mainCard          = document.getElementById('main-card');
const settingsPanel     = document.getElementById('settings-panel');
const btnCloseSettings  = document.getElementById('btn-close-settings');
const inpRate           = document.getElementById('inp-rate');
const inpChat           = document.getElementById('inp-chat');
const inpToken          = document.getElementById('inp-token');
const btnSaveSettings   = document.getElementById('btn-save-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const settingsStatus    = document.getElementById('settings-status');
const linkChatHelp      = document.getElementById('link-chatid-help');

// Worklog DOM
const btnWorklog        = document.getElementById('btn-worklog');
const worklogPanel      = document.getElementById('worklog-panel');
const worklogList       = document.getElementById('worklog-list');
const worklogEmpty      = document.getElementById('worklog-empty');
const btnCloseWorklog   = document.getElementById('btn-close-worklog');
const btnCopyWorklog    = document.getElementById('btn-copy-worklog');
const inpWorklog        = document.getElementById('inp-worklog');
const btnAddWorklog     = document.getElementById('btn-add-worklog');
const worklogStatus     = document.getElementById('worklog-status');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const cfg = await window.electronAPI.getConfig();
  state.hourlyRate = parseFloat(cfg.hourly_rate) || 20;
  inpRate.value    = cfg.hourly_rate || 20;
  inpChat.value    = cfg.chat_id     || '';
  inpToken.value   = cfg.bot_token   || '';
  updateDisplay(0);

  // Pre-load today's worklog entries for Telegram report
  state.worklogEntries = await window.electronAPI.getWorklog();
}

init();

// ─── Timer Core ───────────────────────────────────────────────────────────────

function getElapsedMs() {
  if (state.status === 'running' && state.startWallTime !== null) {
    return state.accumulatedMs + (Date.now() - state.startWallTime);
  }
  return state.accumulatedMs;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function calcEarnings(ms) {
  return ((ms / 3_600_000) * state.hourlyRate).toFixed(2);
}

function updateDisplay(ms) {
  timerEl.textContent    = formatTime(ms);
  earningsEl.textContent = `$${calcEarnings(ms)}`;
}

function tick() {
  updateDisplay(getElapsedMs());
}

// ─── Button: Start / Resume ───────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (state.status === 'idle') {
    state.sessionStart  = new Date();
    state.accumulatedMs = 0;
  }

  state.startWallTime = Date.now();
  state.status        = 'running';
  state.intervalId    = setInterval(tick, 500);

  timerEl.classList.add('running');
  timerEl.classList.remove('paused');

  btnStart.disabled    = true;
  btnPause.disabled    = false;
  btnStop.disabled     = false;
  btnPause.textContent = '⏸';
  btnPause.title       = 'Pause';
  btnWorklog.style.display = '';
});

// ─── Button: Pause ────────────────────────────────────────────────────────────
btnPause.addEventListener('click', () => {
  if (state.status !== 'running') return;

  state.accumulatedMs += Date.now() - state.startWallTime;
  state.startWallTime  = null;
  state.status         = 'paused';

  clearInterval(state.intervalId);
  state.intervalId = null;

  timerEl.classList.remove('running');
  timerEl.classList.add('paused');

  // Start button becomes "Resume"
  btnStart.disabled    = false;
  btnStart.textContent = '▶';
  btnStart.title       = 'Resume';
  btnPause.disabled    = true;
  btnStop.disabled     = false;
});

// ─── Button: Stop ─────────────────────────────────────────────────────────────
btnStop.addEventListener('click', async () => {
  if (state.status === 'running') {
    state.accumulatedMs += Date.now() - state.startWallTime;
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  const finalMs      = state.accumulatedMs;
  const sessionEnd   = new Date();
  const sessionStart = state.sessionStart || new Date();

  // Reset state
  state.status        = 'idle';
  state.accumulatedMs = 0;
  state.startWallTime = null;
  state.sessionStart  = null;

  // Reset UI
  timerEl.classList.remove('running', 'paused');
  btnStart.disabled    = false;
  btnStart.textContent = '▶';
  btnStart.title       = 'Start';
  btnPause.disabled    = true;
  btnStop.disabled     = true;
  btnWorklog.style.display = 'none';
  if (state.worklogOpen) closeWorklog();
  updateDisplay(0);

  // Refresh worklog entries before building report
  state.worklogEntries = await window.electronAPI.getWorklog();

  // Send Telegram report (non-blocking)
  const msg    = buildReport(sessionStart, sessionEnd, finalMs);
  const result = await window.electronAPI.sendTelegram(msg);

  if (!result.ok) {
    console.warn('[D-Timer] Telegram error:', result.error);
    // Show brief error in settings status if settings are open
    if (state.settingsOpen) {
      setSettingsStatus('Telegram: ' + result.error, true);
    }
  }
});

// ─── Telegram Report ──────────────────────────────────────────────────────────
function buildReport(start, end, elapsedMs) {
  const fmtTime = (d) => d.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const fmtDate = (d) => d.toLocaleDateString('ru-RU', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  const lines = [
    `⏱ *Рабочая сессия завершена*`,
    ``,
    `📅 ${fmtDate(start)}`,
    `🕐 Начало:  \`${fmtTime(start)}\``,
    `🕑 Конец:   \`${fmtTime(end)}\``,
    `⏳ Время:   \`${formatTime(elapsedMs)}\``,
    `💵 Заработано: \`$${calcEarnings(elapsedMs)}\` @ $${state.hourlyRate}/ч`
  ];

  if (state.worklogEntries && state.worklogEntries.length > 0) {
    lines.push('', '📝 *Выполнено:*');
    state.worklogEntries.forEach(e => {
      lines.push(`• ${e.text}`);
    });
  }

  return lines.join('\n');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const btnMinimize = document.getElementById('btn-minimize');

function hideWindowControls() {
  btnClose.style.display = 'none';
  btnMinimize.style.display = 'none';
}

function showWindowControls() {
  btnClose.style.display = '';
  btnMinimize.style.display = '';
}

function openSettings() {
  if (state.worklogOpen) closeWorklog();
  state.settingsOpen = true;
  settingsPanel.classList.add('open');
  hideWindowControls();
}

function closeSettings() {
  state.settingsOpen = false;
  settingsPanel.classList.remove('open');
  setSettingsStatus('');
  showWindowControls();
}

btnSettings.addEventListener('click', () => {
  if (state.settingsOpen) closeSettings();
  else openSettings();
});

btnCloseSettings.addEventListener('click', closeSettings);
btnCancelSettings.addEventListener('click', closeSettings);

btnSaveSettings.addEventListener('click', async () => {
  const rate  = parseFloat(inpRate.value);
  const chat  = inpChat.value.trim();
  const token = inpToken.value.trim();

  if (isNaN(rate) || rate <= 0) {
    setSettingsStatus('Invalid rate', true);
    return;
  }

  state.hourlyRate = rate;

  // Update earnings display live if timer is running/paused
  if (state.status !== 'idle') {
    updateDisplay(getElapsedMs());
  }

  await window.electronAPI.setConfig({
    hourly_rate: rate,
    chat_id:     chat,
    bot_token:   token
  });

  setSettingsStatus('Saved ✓');
  setTimeout(() => setSettingsStatus(''), 2000);
});

function setSettingsStatus(msg, isError = false) {
  settingsStatus.textContent = msg;
  settingsStatus.className   = 'settings-status' + (isError ? ' error' : '');
}

// ─── External Links ───────────────────────────────────────────────────────────
linkChatHelp.addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openExternal('https://t.me/userinfobot');
});

// ─── Work Log ────────────────────────────────────────────────────────────────

const WIN_W = 300;
const WIN_H_NORMAL  = 200;
const WIN_H_WORKLOG = 380;

async function openWorklog() {
  if (state.settingsOpen) closeSettings();
  state.worklogOpen = true;

  // Hide card so its drag region doesn't block mouse events over the worklog
  mainCard.style.visibility = 'hidden';
  hideWindowControls();

  // Resize first, then show panel after a frame so layout is settled
  await window.electronAPI.resizeWindow(WIN_W, WIN_H_WORKLOG);
  await refreshWorklog();
  requestAnimationFrame(() => {
    worklogPanel.classList.add('open');
    inpWorklog.focus();
  });
}

async function closeWorklog() {
  state.worklogOpen = false;
  worklogPanel.classList.remove('open');

  // Restore card visibility and window controls
  mainCard.style.visibility = '';
  showWindowControls();

  // Wait for fade-out, then shrink
  setTimeout(async () => {
    await window.electronAPI.resizeWindow(WIN_W, WIN_H_NORMAL);
  }, 250);
  setWorklogStatus('');
}

async function refreshWorklog() {
  const entries = await window.electronAPI.getWorklog();
  state.worklogEntries = entries;
  renderWorklogEntries(entries);
}

function renderWorklogEntries(entries) {
  // Remove all entry elements but keep the empty placeholder
  worklogList.querySelectorAll('.worklog-entry').forEach(el => el.remove());

  if (!entries || entries.length === 0) {
    worklogEmpty.style.display = '';
    return;
  }
  worklogEmpty.style.display = 'none';

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'worklog-entry';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'worklog-entry-time';
    timeSpan.textContent = entry.time;

    const textSpan = document.createElement('span');
    textSpan.className = 'worklog-entry-text';
    textSpan.textContent = entry.text;

    const delBtn = document.createElement('button');
    delBtn.className = 'worklog-entry-del';
    delBtn.textContent = '×';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', async () => {
      const updated = await window.electronAPI.deleteWorklog(entry.id);
      state.worklogEntries = updated;
      renderWorklogEntries(updated);
    });

    textSpan.addEventListener('click', () => {
      row.classList.toggle('expanded');
    });

    row.append(timeSpan, textSpan, delBtn);
    worklogList.appendChild(row);
  });
}

async function addWorklogEntry() {
  const text = inpWorklog.value.trim();
  if (!text) return;

  const updated = await window.electronAPI.addWorklog(text);
  state.worklogEntries = updated;
  renderWorklogEntries(updated);
  inpWorklog.value = '';
  inpWorklog.focus();
}

function copyWorklog() {
  if (!state.worklogEntries || state.worklogEntries.length === 0) {
    setWorklogStatus('Nothing to copy');
    setTimeout(() => setWorklogStatus(''), 1500);
    return;
  }

  const lines = state.worklogEntries.map(e => e.text).join('\n');
  navigator.clipboard.writeText(lines).then(() => {
    setWorklogStatus('Copied ✓');
    setTimeout(() => setWorklogStatus(''), 1500);
  });
}

function setWorklogStatus(msg) {
  worklogStatus.textContent = msg;
}

btnWorklog.addEventListener('click', () => {
  if (state.worklogOpen) closeWorklog();
  else openWorklog();
});

btnCloseWorklog.addEventListener('click', closeWorklog);
btnAddWorklog.addEventListener('click', addWorklogEntry);
btnCopyWorklog.addEventListener('click', copyWorklog);

inpWorklog.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addWorklogEntry();
});

// ─── Notes ────────────────────────────────────────────────────────────────────

const WIN_H_NOTES = 380;

const notesPanel     = document.getElementById('notes-panel');
const notesList      = document.getElementById('notes-list');
const notesEmpty     = document.getElementById('notes-empty');
const btnNotes       = document.getElementById('btn-notes');
const btnCloseNotes  = document.getElementById('btn-close-notes');
const inpNotes       = document.getElementById('inp-notes');
const btnAddNote     = document.getElementById('btn-add-note');
const tabBug         = document.getElementById('tab-bug');
const tabFeature     = document.getElementById('tab-feature');

const notesState = {
  open: false,
  entries: [],
  activeType: 'bug'
};

async function openNotes() {
  if (state.settingsOpen) closeSettings();
  if (state.worklogOpen) closeWorklog();
  notesState.open = true;

  mainCard.style.visibility = 'hidden';
  hideWindowControls();

  await window.electronAPI.resizeWindow(WIN_W, WIN_H_NOTES);
  notesState.entries = await window.electronAPI.getNotes();
  renderNotes();
  requestAnimationFrame(() => {
    notesPanel.classList.add('open');
    inpNotes.focus();
  });
}

async function closeNotes() {
  notesState.open = false;
  notesPanel.classList.remove('open');

  mainCard.style.visibility = '';
  showWindowControls();

  setTimeout(async () => {
    await window.electronAPI.resizeWindow(WIN_W, WIN_H_NORMAL);
  }, 250);
}

function renderNotes() {
  notesList.querySelectorAll('.notes-entry').forEach(el => el.remove());

  const filtered = notesState.entries.filter(e => e.type === notesState.activeType);

  if (filtered.length === 0) {
    notesEmpty.style.display = '';
    return;
  }
  notesEmpty.style.display = 'none';

  filtered.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'notes-entry';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'notes-entry-date';
    dateSpan.textContent = entry.date;

    const textSpan = document.createElement('span');
    textSpan.className = 'notes-entry-text';
    textSpan.textContent = entry.text;
    textSpan.addEventListener('click', () => {
      row.classList.toggle('expanded');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'notes-entry-del';
    delBtn.textContent = '\u00d7';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', async () => {
      notesState.entries = await window.electronAPI.deleteNote(entry.id);
      renderNotes();
    });

    row.append(dateSpan, textSpan, delBtn);
    notesList.appendChild(row);
  });
}

async function addNote() {
  const text = inpNotes.value.trim();
  if (!text) return;

  notesState.entries = await window.electronAPI.addNote(text, notesState.activeType);
  renderNotes();
  inpNotes.value = '';
  inpNotes.focus();
}

function setActiveTab(type) {
  notesState.activeType = type;
  tabBug.classList.toggle('active', type === 'bug');
  tabFeature.classList.toggle('active', type === 'feature');
  renderNotes();
}

btnNotes.addEventListener('click', () => {
  if (notesState.open) closeNotes();
  else openNotes();
});

btnCloseNotes.addEventListener('click', closeNotes);
btnAddNote.addEventListener('click', addNote);

inpNotes.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addNote();
});

tabBug.addEventListener('click', () => setActiveTab('bug'));
tabFeature.addEventListener('click', () => setActiveTab('feature'));

// ─── Minimize ─────────────────────────────────────────────────────────────────
btnMinimize.addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

// ─── Close ───────────────────────────────────────────────────────────────────
btnClose.addEventListener('click', () => {
  window.electronAPI.closeWindow();
});
