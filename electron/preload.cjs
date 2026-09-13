const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron');
});

contextBridge.exposeInMainWorld('talentumWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  bootstrapSecret: () => process.env.TALENTUM_LOCAL_BOOTSTRAP_SECRET || null,
});
