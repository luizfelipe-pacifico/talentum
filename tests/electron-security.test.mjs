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
  assert.match(source, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /setPermissionCheckHandler/);
  assert.match(source, /event\.senderFrame\?\.url/);
});

test('preload expõe somente comandos de janela enumerados', async () => {
  const source = await read('electron/preload.cjs');
  assert.match(source, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(source, /require\(['"](?:node:)?(?:fs|child_process)['"]\)|exposeInMainWorld\([^)]*ipcRenderer/s);
  for (const channel of ['window:minimize', 'window:toggle-maximize', 'window:close']) assert.ok(source.includes(channel));
  assert.match(source, /TALENTUM_LOCAL_BOOTSTRAP_SECRET/);
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
