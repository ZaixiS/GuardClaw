'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  getPort: () => ipcRenderer.invoke('get-port'),
  isElectron: true,
});
