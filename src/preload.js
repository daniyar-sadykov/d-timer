'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a locked-down API to the renderer process.
// The renderer can ONLY call these named methods.
contextBridge.exposeInMainWorld('electronAPI', {

  getConfig: () =>
    ipcRenderer.invoke('config:get'),

  setConfig: (partial) =>
    ipcRenderer.invoke('config:set', partial),

  sendTelegram: (message) =>
    ipcRenderer.invoke('telegram:send', message),

  openExternal: (url) =>
    ipcRenderer.invoke('shell:open', url),

  closeWindow: () =>
    ipcRenderer.invoke('window:close'),

  getWorklog: () =>
    ipcRenderer.invoke('worklog:get'),

  addWorklog: (text) =>
    ipcRenderer.invoke('worklog:add', text),

  deleteWorklog: (id) =>
    ipcRenderer.invoke('worklog:delete', id),

  resizeWindow: (w, h) =>
    ipcRenderer.invoke('window:resize', w, h),

  minimizeWindow: () =>
    ipcRenderer.invoke('window:minimize'),

  getNotes: () =>
    ipcRenderer.invoke('notes:get'),

  addNote: (text, type) =>
    ipcRenderer.invoke('notes:add', text, type),

  deleteNote: (id) =>
    ipcRenderer.invoke('notes:delete', id)

});
