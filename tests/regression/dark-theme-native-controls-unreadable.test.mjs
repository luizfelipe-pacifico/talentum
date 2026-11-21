import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (teste manual, 20/11/2026): no tema escuro, os seletores de estado e
   de fatura de cada compromisso em /extratos/recorrencias apareciam como caixas
   brancas com texto creme, ilegíveis. Duas causas:

   1. `color-scheme: light` valia também no tema escuro, então o navegador
      desenhava controles nativos (select, lista de opções, calendário do campo
      de data, barras de rolagem) no esquema claro, herdando a cor de texto
      clara do tema.
   2. Selects dentro de uma linha de lista (`.entity-list`) não tinham estilo:
      só os de `.field` usavam os tokens de superfície, borda e tinta. */

const root = new URL('../../', import.meta.url);
const compact = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\s+/g, ' ');

test('o tema escuro pede controles nativos escuros', async () => {
  const css = (await compact('src/app/styles.css')) + (await compact('src/app/globals.css'));
  assert.match(css, /html\.dark \{[^}]*color-scheme: dark;/);
});

test('select dentro de linha de lista usa os tokens do tema', async () => {
  const css = await compact('src/app/globals.css');
  const rule = css.match(/\.entity-list select \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /background: var\(--surface\)/);
  assert.match(rule, /color: var\(--ink\)/);
  assert.match(rule, /border: 1px solid var\(--line-strong\)/);
});
