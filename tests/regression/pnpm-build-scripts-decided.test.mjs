import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* O CI da branch de conclusão do MVP falhou em `pnpm install --frozen-lockfile`
   com ERR_PNPM_IGNORED_BUILDS: o `electron-builder` trouxe o
   `electron-winstaller`, que tem script de build, e `allowBuilds` não decidia
   nada sobre ele. Todo pacote com script de build precisa de uma decisão
   explícita (true ou false) em pnpm-workspace.yaml. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('allowBuilds só tem decisões booleanas', async () => {
  const yaml = await read('pnpm-workspace.yaml');
  const block = yaml.split(/^allowBuilds:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const entries = [...block.matchAll(/^\s+['"]?([^'":\s]+)['"]?:\s*(.+?)\s*$/gm)];
  assert.ok(entries.length > 0);
  for (const [, name, value] of entries) assert.match(value, /^(true|false)$/, `${name}: ${value}`);
});

test('a instalação não deixou script de build sem decisão', async (t) => {
  const state = await read('node_modules/.modules.yaml').catch(() => null);
  if (!state) return t.skip('dependências não instaladas');
  const ignored = state.split(/^ignoredBuilds:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const names = [...ignored.matchAll(/^\s+-\s+(\S+)/gm)].map((match) => match[1]);
  assert.deepEqual(names, [], `sem decisão em allowBuilds: ${names.join(', ')}`);
});
