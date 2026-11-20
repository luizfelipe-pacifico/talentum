import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Fusíveis do Electron (docs/SECURITY.md, item aberto 20).

   Sem `electronFuses`, o executável instalado aceitava `NODE_OPTIONS` e
   `--inspect`: qualquer programa do usuário podia abrir o Talentum com um
   depurador ou injetar código no processo principal, que tem acesso ao banco e
   à chave do dispositivo. Os fusíveis desligam isso no binário. `runAsNode`
   continua ligado enquanto o backend empacotado for iniciado com
   `ELECTRON_RUN_AS_NODE`; desligá-lo exige migrar para `utilityProcess`. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o instalador grava os fusíveis que o app não usa como desligados', async () => {
  const { build } = JSON.parse(await read('package.json'));
  const fuses = build.electronFuses;
  assert.ok(fuses, 'build.electronFuses existe');
  assert.equal(fuses.enableNodeOptionsEnvironmentVariable, false);
  assert.equal(fuses.enableNodeCliInspectArguments, false);
  assert.equal(fuses.grantFileProtocolExtraPrivileges, false);
  assert.equal(fuses.enableCookieEncryption, true);
});

test('runAsNode só fica ligado porque o backend empacotado depende dele', async () => {
  const { build } = JSON.parse(await read('package.json'));
  const main = await read('electron/main.cjs');
  const usesRunAsNode = /ELECTRON_RUN_AS_NODE: '1'/.test(main);
  assert.equal(build.electronFuses.runAsNode, usesRunAsNode, 'o fusível acompanha a forma como o backend sobe');
});
