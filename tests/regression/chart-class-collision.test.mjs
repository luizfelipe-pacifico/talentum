import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* A classe `.chart` era definida duas vezes em globals.css: a primeira, do
   gráfico de barras do guia de layout, monta uma grade de 8 colunas com 180px
   de altura; a segunda é o <figure> dos gráficos SVG do painel. Os gráficos do
   painel herdavam a grade e o SVG ficava espremido em 1/8 da largura. Cada
   bloco visual precisa da sua própria classe. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o gráfico do painel não herda a grade do gráfico de barras do guia', async () => {
  const css = await read('src/app/globals.css');
  const rules = css.match(/^\.chart\s*\{[^}]*\}/gm) ?? [];
  assert.equal(rules.length, 1, `.chart definido ${rules.length} vezes`);
  assert.doesNotMatch(rules[0], /display:\s*grid|grid-template-columns|height:/);
});
