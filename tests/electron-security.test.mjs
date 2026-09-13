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
});
