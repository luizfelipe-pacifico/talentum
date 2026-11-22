import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Defeito (revisão da página de downloads, 21/11/2026): o botão "Baixar…"
   mostrava um espaço vazio no lugar do ícone. scripts/gerar-icones-lp.mjs só
   varria apps/web/src/components/lp, e `bi-download`, usado em
   apps/web/src/app/downloads/page.tsx, nunca entrou no mapa de ícones.

   Correção: o gerador varre todo apps/web/src; este teste exige que cada ícone
   usado ali exista no mapa. */

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'apps', 'web', 'src');
const map = readFileSync(path.join(source, 'components', 'lp', 'icons.tsx'), 'utf8');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.tsx?$/.test(entry.name) && entry.name !== 'icons.tsx' ? [full] : [];
  });
}

test('todo ícone bi-* usado em apps/web/src está no mapa da landing page', () => {
  const missing = new Set();
  for (const file of files(source)) {
    for (const [, name] of readFileSync(file, 'utf8').matchAll(/['"`\s]bi-([a-z0-9-]+)/g)) {
      if (!map.includes(`'bi-${name}':`)) missing.add(`bi-${name} (${path.relative(root, file)})`);
    }
  }
  assert.deepEqual([...missing], []);
});
