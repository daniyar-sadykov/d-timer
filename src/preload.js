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
    ipcRenderer.invoke('window:close')

});
