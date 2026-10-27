import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Rota inexistente caía na página 404 padrão do Next, dentro de um cabeçalho
   "Início", e uma falha de renderização mostrava a tela crua do framework. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

for (const app of ['src/app', 'apps/web/src/app']) {
  test(`${app}: rota inexistente tem página própria com caminho de volta`, async () => {
    const page = await read(`${app}/not-found.tsx`);
    assert.match(page, /Página não encontrada/);
    assert.match(page, /href="\/"/);
  });

  test(`${app}: falha de renderização mostra recuperação sem diagnóstico`, async () => {
    const page = await read(`${app}/error.tsx`);
    assert.match(page, /^'use client';/);
    assert.match(page, /reset\(\)/, 'oferece tentar de novo');
    // CLAUDE.md: nunca renderizar diagnóstico na interface pública.
    assert.doesNotMatch(page, /error\.(message|stack)|digest\}/);
    assert.match(page, /role="alert"/);
  });
}
