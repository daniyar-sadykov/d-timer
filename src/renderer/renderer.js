'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  status:        'idle',    // 'idle' | 'running' | 'paused'
  startWallTime: null,      // Date.now() when current segment started
  accumulatedMs: 0,         // Total ms from all completed segments
  sessionStart:  null,      // Wall-clock time of the very first Start press
  intervalId:    null,
  hourlyRate:    20,
  settingsOpen:  false
};

// ─── DOM ─────────────────────────────────────────────────────────────────────
const timerEl           = document.getElementById('timer-display');
const earningsEl        = document.getElementById('earnings-display');
const btnStart          = document.getElementById('btn-start');
const btnPause          = document.getElementById('btn-pause');
const btnStop           = document.getElementById('btn-stop');
const btnSettings       = document.getElementById('btn-settings');
const btnClose          = document.getElementById('btn-close');
const settingsPanel     = document.getElementById('settings-panel');
const btnCloseSettings  = document.getElementById('btn-close-settings');
const inpRate           = document.getElementById('inp-rate');
const inpChat           = document.getElementById('inp-chat');
const inpToken          = document.getElementById('inp-token');
const btnSaveSettings   = document.getElementById('btn-save-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const settingsStatus    = document.getElementById('settings-status');
const linkChatHelp      = document.getElementById('link-chatid-help');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const cfg = await window.electronAPI.getConfig();
  state.hourlyRate = parseFloat(cfg.hourly_rate) || 20;
  inpRate.value    = cfg.hourly_rate || 20;
  inpChat.value    = cfg.chat_id     || '';
  inpToken.value   = cfg.bot_token   || '';
  updateDisplay(0);
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
  updateDisplay(0);

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

  return [
    `⏱ *Рабочая сессия завершена*`,
    ``,
    `📅 ${fmtDate(start)}`,
    `🕐 Начало:  \`${fmtTime(start)}\``,
    `🕑 Конец:   \`${fmtTime(end)}\``,
    `⏳ Время:   \`${formatTime(elapsedMs)}\``,
    `💵 Заработано: \`$${calcEarnings(elapsedMs)}\` @ $${state.hourlyRate}/ч`
  ].join('\n');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function openSettings() {
  state.settingsOpen = true;
  settingsPanel.classList.add('open');
}

function closeSettings() {
  state.settingsOpen = false;
  settingsPanel.classList.remove('open');
  setSettingsStatus('');
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

// ─── Minimize to Tray ─────────────────────────────────────────────────────────
btnClose.addEventListener('click', () => {
  window.electronAPI.closeWindow();
});
