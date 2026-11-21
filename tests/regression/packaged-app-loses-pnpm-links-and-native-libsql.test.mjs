import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Defeito (primeira execução do workflow Desktop, 21/11/2026): os pacotes de
   Windows e macOS abriam o servidor, mas toda rota do banco respondia 500.

   - Windows: "Cannot find package '@libsql/core'". O standalone do Next guarda
     as dependências do pnpm como links simbólicos, e eles se perdiam na cópia
     para o pacote.
   - macOS: "Cannot find module '@libsql/darwin-arm64'". O libsql escolhe o
     binário nativo por um nome montado em tempo de execução, que o rastreamento
     do Next não segue. No Linux o binário entrava por acaso: o código cita
     `linux-x64-gnu` literalmente.

   Correção: o workflow Desktop instala com `node-linker=hoisted`, um
   node_modules plano sem links (trocar os links por cópias quebrava a resolução
   do pnpm: o servidor não achava `styled-jsx`), e scripts/desktop-prepare.mjs
   copia o pacote nativo do libsql do sistema que está empacotando. Com um
   pacote em release/, o teste confere que todo link resolve e que o binário
   nativo está lá. */

const root = fileURLToPath(new URL('../../', import.meta.url));

function brokenLinksUnder(dir, found = [], limit = 5) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (found.length >= limit) break;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (!existsSync(full)) found.push(path.relative(root, full));
    } else if (entry.isDirectory()) brokenLinksUnder(full, found, limit);
  }
  return found;
}

test('o empacotamento usa node_modules plano e inclui o libsql nativo', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/desktop.yml'), 'utf8');
  assert.match(workflow, /^\s+pnpm_config_node_linker: hoisted$/m, 'node_modules sem links em todo comando do CI de empacotamento');
  const prepare = await readFile(path.join(root, 'scripts/desktop-prepare.mjs'), 'utf8');
  assert.match(prepare, /@libsql\/\$\{target\}/, 'o pacote nativo do libsql do sistema entra no standalone');
  assert.doesNotMatch(prepare, /replaceLinksWithCopies/, 'cópias no lugar dos links quebram a resolução do pnpm');
});

const unpacked = ['linux-unpacked', 'win-unpacked']
  .map((name) => path.join(root, 'release', name, 'resources', 'standalone', 'node_modules'))
  .find((dir) => existsSync(dir));

test('no pacote construído todo link resolve e o libsql nativo está lá', { skip: unpacked ? false : 'nenhum pacote em release/' }, () => {
  assert.deepEqual(brokenLinksUnder(unpacked), [], 'link quebrado no node_modules do pacote');
  const native = readdirSync(path.join(unpacked, '@libsql')).filter((name) => /^(linux|win32|darwin)-/.test(name));
  assert.ok(native.length > 0, 'nenhum binário nativo do libsql em standalone/node_modules/@libsql');
});
