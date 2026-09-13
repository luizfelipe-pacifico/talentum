const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session } = require('electron');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

let url = process.env.TALENTUM_URL || 'http://127.0.0.1:3000';
let trustedOrigin = new URL(url).origin;
let localServer;
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

  window.webContents.on('will-navigate', (event, destination) => {
    if (new URL(destination).origin !== trustedOrigin) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForHealth(target) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const check = () => {
      const request = http.get(`${target}/api/health/live`, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.setTimeout(2_000, () => request.destroy());
      request.once('error', retry);
    };
    const retry = () => Date.now() >= deadline
      ? reject(new Error('O backend local não iniciou dentro do limite de segurança.'))
      : setTimeout(check, 250);
    check();
  });
}

async function startPackagedBackend() {
  if (!app.isPackaged || process.env.TALENTUM_URL) return;
  const appRoot = app.getAppPath();
  const databasePath = path.join(app.getPath('userData'), 'talentum-local.db').replaceAll('\\', '/');
  const port = await availablePort();
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: `file:${databasePath}`,
    TALENTUM_LOCAL_BOOTSTRAP_SECRET: randomBytes(32).toString('base64url'),
  };
  const prismaCli = path.join(appRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const migrated = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: appRoot, env: environment, encoding: 'utf8' });
  if (migrated.status !== 0) throw new Error('Não foi possível preparar o banco local com segurança.');
  localServer = spawn(process.execPath, [path.join(appRoot, '.next', 'standalone', 'server.js')], {
    cwd: path.join(appRoot, '.next', 'standalone'),
    env: environment,
    stdio: 'ignore',
  });
  localServer.once('exit', () => { localServer = undefined; });
  url = `http://127.0.0.1:${port}`;
  trustedOrigin = url;
  await waitForHealth(url);
}

function senderWindow(event) {
  if (event.senderFrame?.url && new URL(event.senderFrame.url).origin !== trustedOrigin) return null;
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
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    try {
      await startPackagedBackend();
      await createWindow();
    } catch (error) {
      dialog.showErrorBox('Falha ao iniciar o Talentum', error instanceof Error ? error.message : 'Falha interna.');
      app.quit();
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  localServer?.kill();
  if (process.platform !== 'darwin') app.quit();
});
