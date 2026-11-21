import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Defeito (revisão visual, 20/11/2026): `.entity-list` usava `--space-2`,
   `--space-3`, `--space-4` e `--border`, tokens que nunca existiram. O
   navegador descarta a declaração inteira, então as linhas de faturas, itens,
   benefícios e compromissos ficavam coladas, sem respiro e sem divisória.

   Regra: toda `var(--x)` sem valor reserva nas folhas do app precisa de um
   `--x:` definido em alguma delas (ou inline, no caso de --sidebar-w). */

const dir = new URL('../../src/app/', import.meta.url);
const sheets = (await readdir(dir)).filter((name) => name.endsWith('.css'));
const sources = await Promise.all(sheets.map((name) => readFile(new URL(name, dir), 'utf8')));
const all = sources.join('\n');

// Definidas em estilo inline por componentes React.
const INLINE = new Set(['--sidebar-w']);

test('nenhuma folha do app usa token que não existe', () => {
  const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing = new Set();
  for (const [, name, fallback] of all.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
    if (!fallback && !defined.has(name) && !INLINE.has(name)) missing.add(name);
  }
  assert.deepEqual([...missing].sort(), []);
});
