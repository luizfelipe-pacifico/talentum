import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('janela Electron mantém isolamento e bloqueia superfícies não autorizadas', async () => {
  const source = await read('electron/main.cjs');
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /will-navigate/);
  // Nenhuma janela nova é aberta pelo app; links permitidos vão ao navegador do sistema.
  assert.match(source, /setWindowOpenHandler\([\s\S]{0,160}return \{ action: 'deny' \}/);
  assert.doesNotMatch(source, /action: 'allow'/);
  assert.equal(source.match(/setWindowOpenHandler/g).length, 1, 'um único handler, para um não substituir o outro');
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /setPermissionCheckHandler/);
  assert.match(source, /event\.senderFrame\?\.url/);
});

test('preload expõe somente comandos de janela enumerados', async () => {
  const source = await read('electron/preload.cjs');
  assert.match(source, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(source, /require\(['"](?:node:)?(?:fs|child_process)['"]\)|exposeInMainWorld\([^)]*ipcRenderer/s);
  for (const channel of ['window:minimize', 'window:toggle-maximize', 'window:close']) assert.ok(source.includes(channel));
  // O segredo de bootstrap chega por IPC; o preload não lê o ambiente do servidor.
  assert.match(source, /ipcRenderer\.invoke\('app:bootstrap-secret'\)/);
  assert.doesNotMatch(source, /process\.env/);
});

test('backend empacotado usa porta aleatória, banco no userData e segredo efêmero', async () => {
  const main = await read('electron/main.cjs');
  const route = await read('src/app/api/action-codes/route.ts');
  const client = await read('src/lib/api-client.ts');
  assert.match(main, /listen\(0, '127\.0\.0\.1'/);
  assert.match(main, /app\.getPath\('userData'\)/);
  assert.match(main, /randomBytes\(32\)/);
  assert.match(main, /migrate', 'deploy'/);
  assert.match(route, /timingSafeEqual/);
  assert.match(client, /X-Talentum-Bootstrap/);
});
