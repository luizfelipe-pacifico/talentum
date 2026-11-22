import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Defeito (revisão jurídica dos instaladores, 21/11/2026): os instaladores
   levam o servidor empacotado com cerca de 150 pacotes npm (MIT, Apache-2.0,
   BSD, ISC, MPL-2.0, CC-BY-4.0, OFL-1.1, LGPL-3.0), muitos compilados dentro
   dos chunks do Next, mas nenhum aviso de licença deles nem o LICENSE do
   próprio Talentum. Essas licenças exigem que o aviso acompanhe as cópias
   distribuídas.

   Correção: o preparo gera THIRD_PARTY_NOTICES.txt com nome, versão, licença
   e texto de cada pacote de produção, e o pacote leva esse arquivo e o LICENSE
   em resources/licencas. Com um pacote em release/, o teste confere o arquivo. */

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('o preparo gera os avisos de licença e o pacote os inclui', () => {
  const prepare = readFileSync(path.join(root, 'scripts/desktop-prepare.mjs'), 'utf8');
  assert.match(prepare, /third-party-notices\.mjs/, 'o preparo gera os avisos');
  const entry = (pkg.build.extraResources ?? []).find((item) => item.to === 'licencas');
  assert.ok(entry, 'extraResources sem a pasta licencas');
  assert.equal(entry.from, '.next/licencas');
});

const packaged = ['linux-unpacked', 'win-unpacked'].map((name) => path.join(root, 'release', name, 'resources', 'licencas')).find((dir) => existsSync(dir));

test('o pacote construído traz LICENSE e os avisos de terceiros', { skip: packaged ? false : 'nenhum pacote em release/' }, () => {
  const notices = readFileSync(path.join(packaged, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
  for (const name of ['next', 'react', '@libsql/client', '@prisma/client', 'pdfjs-dist', 'zod']) assert.match(notices, new RegExp(`^${name.replace('/', '\\/')} `, 'm'), name);
  assert.match(readFileSync(path.join(packaged, 'LICENSE.txt'), 'utf8'), /MIT License/);
});
