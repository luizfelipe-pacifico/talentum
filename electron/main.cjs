const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, safeStorage, session, shell } = require('electron');
const { createCloudAuth, resolveCloudOrigin } = require('./cloud-auth.cjs');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const update = require('./update-verify.cjs');
const chrome = require('./window-chrome.cjs');

/* `localhost` é o endereço documentado do backend local e o publicado pelo
   Compose. `scripts/dev-all.mjs` sobrescreve TALENTUM_URL quando confirma que
   outro endereço responde. No aplicativo empacotado, `startPackagedBackend`
   troca o endereço por uma porta aleatória no loopback. */
/* No app empacotado o endereço nunca vem do ambiente: uma variável plantada no
   perfil do usuário faria a janela confiável abrir uma página remota. Em
   desenvolvimento, só endereços de loopback são aceitos. */
function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}
const requestedUrl = app.isPackaged ? null : process.env.TALENTUM_URL;
let url = requestedUrl && isLoopbackUrl(requestedUrl) ? requestedUrl : 'http://localhost:3000';
let appOrigin = new URL(url).origin;
let localServer;
/* Segredo de bootstrap do backend empacotado: gerado a cada execução, entregue ao
   servidor pelo ambiente e à janela por IPC. Fora do app empacotado fica nulo. */
let bootstrapSecret = null;

/* Links externos permitidos: abrem no navegador do sistema, nunca numa janela
   com o preload do Talentum (docs/ARCHITECTURE.md, Layer 2: Electron). */
// `agenciabrasil.ebc.com.br`: fonte das notícias públicas da área Invest (Etapa 15).
const EXTERNAL_HOSTS = new Set(['github.com', 'icons.getbootstrap.com', 'agenciabrasil.ebc.com.br']);

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

/* Empacotado, o app não abre com chave de depuração: com a porta do Chromium
   aberta, qualquer programa do mesmo usuário leria a tela desbloqueada e usaria
   a sessão local. Os fuses só cobrem --inspect e NODE_OPTIONS.
   tests/regression/packaged-app-accepts-remote-debugging.test.mjs */
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'remote-allow-origins', 'inspect', 'inspect-brk'];
if (app.isPackaged && DEBUG_SWITCHES.some((name) => app.commandLine.hasSwitch(name))) {
  app.exit(1);
}

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
  const iconPath = chrome.windowIconPath(process.platform, path.join(__dirname, '..'));
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: nativeImage.createFromPath(iconPath) } : {}),
    ...chrome.chromeOptions(process.platform),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Maximizada e tela cheia mudam o ícone de restaurar e o recuo dos botões do macOS.
  const sendState = () => {
    if (!window.isDestroyed()) window.webContents.send('window:state', { maximized: window.isMaximized(), fullscreen: window.isFullScreen() });
  };
  for (const name of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) window.on(name, sendState);

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
  if (!app.isPackaged) return;
  const appRoot = app.getAppPath();
  const databasePath = path.join(app.getPath('userData'), 'talentum-local.db').replaceAll('\\', '/');
  const port = await availablePort();
  bootstrapSecret = randomBytes(32).toString('base64url');
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: `file:${databasePath}`,
    TALENTUM_LOCAL_BOOTSTRAP_SECRET: bootstrapSecret,
  };
  /* Sem `prisma migrate deploy`: o banco é cifrado e só abre com a senha. O backend
     aplica as migrations pela conexão cifrada no desbloqueio (src/server/vault/migrations.ts). */
  environment.TALENTUM_MIGRATIONS_DIR = path.join(appRoot, 'prisma', 'migrations');
  /* O standalone vem por extraResources, cópia literal com o próprio node_modules
     (cliente Prisma gerado incluído); em `files` o electron-builder descartaria
     essa pasta. tests/regression/packaged-app-cannot-open-database.test.mjs */
  const standalone = path.join(process.resourcesPath, 'standalone');
  localServer = spawn(process.execPath, [path.join(standalone, 'server.js')], {
    cwd: standalone,
    env: environment,
    stdio: 'ignore',
  });
  localServer.once('exit', () => { localServer = undefined; });
  url = `http://127.0.0.1:${port}`;
  appOrigin = url;
  await waitForHealth(url);
}

/* Só a janela do próprio aplicativo, carregada do backend local, controla a janela. */
function trustedSender(event) {
  const frameUrl = event.senderFrame?.url ?? '';
  return isAppUrl(frameUrl) ? BrowserWindow.fromWebContents(event.sender) : null;
}

ipcMain.handle('app:bootstrap-secret', (event) => (trustedSender(event) ? bootstrapSecret : null));
ipcMain.on('window:minimize', (event) => trustedSender(event)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const window = trustedSender(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.on('window:close', (event) => trustedSender(event)?.close());
/* A janela informa só o tema ('light' ou 'dark') e a superfície sob os botões
   ('bar' ou 'page'); as cores da sobreposição do Windows ficam aqui. Outros
   valores são ignorados. */
ipcMain.on('window:theme', (event, theme, surface) => {
  const window = trustedSender(event);
  if (!window || process.platform !== 'win32' || (theme !== 'light' && theme !== 'dark') || (surface !== 'bar' && surface !== 'page')) return;
  window.setTitleBarOverlay(chrome.overlayFor(theme, surface));
});
ipcMain.handle('window:chrome', async (event) => {
  const window = trustedSender(event);
  if (!window) return null;
  return {
    platform: process.platform,
    systemLayout: process.platform === 'linux' ? await chrome.detectLinuxLayout() : null,
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
  };
});

/* ── Atualização consentida (docs/PRODUCT.md, "New-version notice") ──────────
   A janela só pede "instalar a versão X". Tudo o mais acontece aqui, no
   processo principal: a URL vem da API do repositório oficial fixo, o download
   só segue redirecionamentos para hosts do GitHub, o tamanho precisa bater com o
   publicado, e o instalador só é executado se `verifyInstaller` aprovar o
   checksum e a assinatura (electron/update-verify.cjs). Qualquer falha apaga o
   arquivo e não executa nada. */

const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;
let updateInProgress = false;

function httpsRequest(target, onResponse, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!update.allowedDownloadUrl(target)) return reject(new Error('HOST_NOT_ALLOWED'));
    const request = https.get(target, { headers: { 'User-Agent': 'Talentum-updater', Accept: 'application/octet-stream, application/json' } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error('TOO_MANY_REDIRECTS'));
        return resolve(httpsRequest(new URL(response.headers.location, target).href, onResponse, redirects + 1));
      }
      if (status !== 200) {
        response.resume();
        return reject(new Error('HTTP_STATUS'));
      }
      onResponse(response, resolve, reject);
    });
    request.setTimeout(30_000, () => request.destroy(new Error('TIMEOUT')));
    request.once('error', reject);
  });
}

function fetchText(target, maxBytes) {
  return httpsRequest(target, (response, resolve, reject) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) response.destroy(new Error('TOO_LARGE'));
      else chunks.push(chunk);
    });
    response.once('error', reject);
    response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/* Baixa para o arquivo calculando o SHA-256 no caminho. O tamanho precisa ser
   exatamente o publicado: nem um byte a mais é gravado. */
function downloadTo(target, filePath, expectedBytes) {
  return httpsRequest(target, (response, resolve, reject) => {
    const hash = update.sha256Stream();
    const output = fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 });
    let size = 0;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > expectedBytes) return response.destroy(new Error('TOO_LARGE'));
      hash.update(chunk);
    });
    response.once('error', reject);
    output.once('error', reject);
    output.once('finish', () => (size === expectedBytes ? resolve(hash.digest('hex')) : reject(new Error('SIZE_MISMATCH'))));
    response.pipe(output);
  });
}

async function installUpdate(version) {
  if (!update.isNewerVersion(version, app.getVersion())) return { status: 'refused', reason: 'VERSION_INVALID' };
  // Windows (NSIS) e macOS (.dmg). No Linux a janela leva à página da versão.
  const name = update.installerAssetName(version, process.platform, process.arch);
  if (!name) return { status: 'unsupported-platform' };
  // Sem a chave pública nenhum instalador passa na verificação: recusar antes
  // evita baixar centenas de megabytes só para apagá-los.
  if (!update.UPDATE_SIGNING_PUBLIC_KEY) return { status: 'refused', reason: 'SIGNING_KEY_MISSING' };
  if (updateInProgress) return { status: 'busy' };
  updateInProgress = true;
  const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'talentum-update-'));
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    const release = JSON.parse(await fetchText(`https://api.github.com/repos/${update.OFFICIAL_REPOSITORY}/releases/tags/v${version}`, 2_000_000));
    if (!release || release.draft !== false || release.prerelease !== false || release.tag_name !== `v${version}`) {
      cleanup();
      return { status: 'refused', reason: 'RELEASE_INVALID' };
    }
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((candidate) => candidate && candidate.name === name);
    const signatureAsset = assets.find((candidate) => candidate && candidate.name === `${name}.sig`);
    if (!asset || typeof asset.browser_download_url !== 'string' || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES) {
      cleanup();
      return { status: 'refused', reason: 'ASSET_INVALID' };
    }
    const expected = typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : null;
    const signature = typeof signatureAsset?.browser_download_url === 'string' ? await fetchText(signatureAsset.browser_download_url, 1024) : null;
    const file = path.join(directory, name);
    const actual = await downloadTo(asset.browser_download_url, file, asset.size);
    const verdict = update.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: expected, signatureBase64: signature });
    if (!verdict.ok) {
      cleanup();
      return { status: 'refused', reason: verdict.reason };
    }
    if (process.platform === 'darwin') {
      // No macOS a imagem .dmg é aberta pelo Finder e a pessoa arrasta o app
      // para Aplicativos; o Gatekeeper confere a notarização ao abrir.
      const failure = await shell.openPath(file);
      if (failure) {
        cleanup();
        return { status: 'failed' };
      }
    } else {
      spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    }
    setTimeout(() => app.quit(), 500);
    return { status: 'installing' };
  } catch {
    cleanup();
    return { status: 'failed' };
  } finally {
    updateInProgress = false;
  }
}

ipcMain.handle('app:update-install', (event, version) =>
  trustedSender(event) && typeof version === 'string' ? installUpdate(version) : { status: 'refused', reason: 'REQUEST_INVALID' },
);

/* Conta Talentum (Entrar com Google) pelo navegador do sistema: electron/cloud-auth.cjs.
   O renderer só recebe o estado da conexão, nunca um token. */
let cloudAuth = null;
function cloud() {
  cloudAuth ??= createCloudAuth({
    origin: resolveCloudOrigin(process.env.TALENTUM_CLOUD_ORIGIN, app.isPackaged),
    userDataPath: app.getPath('userData'),
    safeStorage,
    openExternal: (target) => shell.openExternal(target),
  });
  return cloudAuth;
}
const UNAVAILABLE = { available: false, connected: false, persistent: false, displayName: null };
ipcMain.handle('cloud:status', (event) => (trustedSender(event) ? cloud().status() : UNAVAILABLE));
ipcMain.handle('cloud:sign-in', (event) => (trustedSender(event) ? cloud().signIn() : UNAVAILABLE));
ipcMain.handle('cloud:sign-out', (event) => (trustedSender(event) ? cloud().signOut() : UNAVAILABLE));

/* Suspensão e bloqueio de tela do sistema (macOS, Windows e Linux com logind) pedem à
   janela que bloqueie o cofre local: a janela tem a sessão e chama POST /api/vault/lock. */
function requestVaultLock() {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('vault:lock-requested');
}

Menu.setApplicationMenu(null);
app.setAppUserModelId('org.talentum.app');
// Em desenvolvimento o Dock do macOS mostraria o ícone do Electron; o pacote usa o .icns.
if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, '..', 'icon-badge-mac.png'));

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    // Nenhuma permissão do navegador (câmera, notificações, geolocalização) é usada.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    for (const signal of ['suspend', 'lock-screen']) powerMonitor.on(signal, requestVaultLock);
    try {
      await startPackagedBackend();
      await createWindow();
    } catch (error) {
      dialog.showErrorBox('Falha ao iniciar o Talentum', error instanceof Error ? error.message : 'Falha interna.');
      app.quit();
    }
    // macOS: clicar no Dock sem janela aberta reabre. O backend empacotado foi
    // encerrado ao fechar a última janela (o cofre fechou junto), então sobe de novo.
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length > 0) return;
      try {
        if (app.isPackaged && !localServer) await startPackagedBackend();
        await createWindow();
      } catch (error) {
        dialog.showErrorBox('Falha ao iniciar o Talentum', error instanceof Error ? error.message : 'Falha interna.');
      }
    });
  });
}

/* Fechar a última janela encerra o backend local em todas as plataformas: a chave
   dos dados sai da memória. No macOS o aplicativo segue no Dock, como manda a
   convenção da plataforma, e `activate` sobe o backend de novo. */
app.on('window-all-closed', () => {
  localServer?.kill();
  localServer = undefined;
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => localServer?.kill());
