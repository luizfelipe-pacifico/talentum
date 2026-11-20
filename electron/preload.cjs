const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron');
});

contextBridge.exposeInMainWorld('talentumWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  // O segredo vive no processo principal; só a janela do app o recebe, por IPC.
  bootstrapSecret: () => ipcRenderer.invoke('app:bootstrap-secret'),
});
