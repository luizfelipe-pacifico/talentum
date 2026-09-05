const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } = require('electron');
const path = require('node:path');

const url = process.env.TALENTUM_URL || 'http://127.0.0.1:3000';
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
}

async function createWindow() {
  const windowIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'icon-badge.ico'));
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  try {
    await window.loadURL(url);
  } catch (error) {
    dialog.showErrorBox(
      'Falha ao carregar o Talentum',
      `O servidor local não respondeu em ${url}.\n\n${error.message}`,
    );
  }
}

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on('window:minimize', (event) => senderWindow(event)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const window = senderWindow(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.on('window:close', (event) => senderWindow(event)?.close());

Menu.setApplicationMenu(null);
app.setAppUserModelId('org.talentum.app');

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
