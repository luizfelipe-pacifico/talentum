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
  // Pede ao processo principal que baixe, verifique e execute o instalador da
  // versão informada. A URL e a verificação ficam no processo principal.
  installUpdate: (version) => ipcRenderer.invoke('app:update-install', String(version)),
  // Conta Talentum: só o estado da conexão chega aqui; o token fica no processo principal.
  cloudAccount: {
    status: () => ipcRenderer.invoke('cloud:status'),
    signIn: () => ipcRenderer.invoke('cloud:sign-in'),
    signOut: () => ipcRenderer.invoke('cloud:sign-out'),
  },
  // Suspensão ou bloqueio de tela do sistema: a janela bloqueia o cofre local.
  onVaultLockRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('vault:lock-requested', listener);
    return () => ipcRenderer.removeListener('vault:lock-requested', listener);
  },
});
