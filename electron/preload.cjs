const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  // O sistema decide a moldura: botões nativos no macOS e no Windows, desenhados no Linux.
  document.documentElement.classList.add('electron', `platform-${process.platform}`);
});

contextBridge.exposeInMainWorld('talentumWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  // Sistema, disposição dos botões configurada no Linux e estado da janela.
  chrome: () => ipcRenderer.invoke('window:chrome'),
  // Só tema e superfície: o processo principal escolhe as cores dos botões nativos do Windows.
  setTheme: (theme, surface) => ipcRenderer.send('window:theme', theme === 'dark' ? 'dark' : 'light', surface === 'page' ? 'page' : 'bar'),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback({ maximized: Boolean(state?.maximized), fullscreen: Boolean(state?.fullscreen) });
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
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
