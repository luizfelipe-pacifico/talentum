const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell } = require('electron');
const path = require('node:path');

/* `localhost` é o endereço documentado do backend local e o publicado pelo
   Compose. `scripts/dev-all.mjs` sobrescreve TALENTUM_URL quando confirma que
   outro endereço responde. */
const url = process.env.TALENTUM_URL || 'http://localhost:3000';
const appOrigin = new URL(url).origin;

/* Links externos permitidos: abrem no navegador do sistema, nunca numa janela
   com o preload do Talentum (docs/ARCHITECTURE-ELECTRON.md, controles 2 e 3). */
const EXTERNAL_HOSTS = new Set(['github.com', 'icons.getbootstrap.com']);

function openExternalSafely(target) {
  try {
    const parsed = new URL(target);
    if (parsed.protocol === 'https:' && EXTERNAL_HOSTS.has(parsed.hostname)) shell.openExternal(parsed.href);
  } catch {
    // Endereço inválido: ignorado.
  }
}

const isAppUrl = (target) => {
  try {
    return new URL(target).origin === appOrigin;
  } catch {
    return false;
  }
};

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

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternalSafely(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (!isAppUrl(target)) {
      event.preventDefault();
      openExternalSafely(target);
    }
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

/* Só a janela do próprio aplicativo, carregada do backend local, controla a janela. */
function trustedSender(event) {
  const frameUrl = event.senderFrame?.url ?? '';
  return isAppUrl(frameUrl) ? BrowserWindow.fromWebContents(event.sender) : null;
}

ipcMain.on('window:minimize', (event) => trustedSender(event)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const window = trustedSender(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.on('window:close', (event) => trustedSender(event)?.close());

Menu.setApplicationMenu(null);
app.setAppUserModelId('org.talentum.app');

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    // Nenhuma permissão do navegador (câmera, notificações, geolocalização) é usada.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
