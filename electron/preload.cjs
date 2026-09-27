'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('uamsPlatform', Object.freeze({
  kind: 'windows-desktop',
  persistence: 'electron-user-data',
  saveFile: (file) => ipcRenderer.invoke('uams:save-file', file),
}));
