import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Depois que o roteiro inteiro entrou no código (PR #10), a landing page ficou
   contraditória: a legenda da tela de importação dizia "Aceita CSV e OFX" com o
   PDF pronto, as seções de patrimônio e de modo de sobrevivência tinham o selo
   "Pronto" e o texto no futuro ("vai usar", "vai mudar"), o passo Planejar
   chamava orçamento, metas e patrimônio de "próximas etapas", a lista de áreas
   não tinha Planejamento e a linha do tempo dava como pronta a etapa de
   downloads, cujos instaladores assinados ainda são planejados. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function block(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `${start} existe`);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to === -1 ? undefined : to);
}
const current = (roadmap, heading) => /\*\*Current(:|\*\*)/.test(block(roadmap, heading, '\n### '));

test('com o PDF pronto, toda frase que lista CSV e OFX também lista PDF', async () => {
  const [lp, roadmap] = await Promise.all([read('apps/web/src/components/lp/landing-page.tsx'), read('docs/ROADMAP.md')]);
  if (!current(roadmap, '### Stage 7 — PDF import')) return;
  for (const [frase] of lp.matchAll(/[^.\n'`]*\bCSV\b[^.\n'`]*/g)) {
    if (!/\bOFX\b/.test(frase) || /Importação de (OFX e CSV|CSV e OFX)$/.test(frase.trim())) continue;
    assert.match(frase, /\bPDF\b/, `formatos sem o PDF: "${frase.trim()}"`);
  }
});

test('seção marcada como pronta não descreve o recurso no futuro', async () => {
  const lp = await read('apps/web/src/components/lp/landing-page.tsx');
  for (const id of ['arca', 'sobrevivencia']) {
    const secao = block(lp, `id="${id}"`, '</section>');
    if (!/Pronto no aplicativo/.test(secao)) continue;
    assert.doesNotMatch(secao, /\bvai (usar|mudar|pausar|priorizar|concentrar)\b/, `#${id} tem selo de pronto e texto no futuro`);
  }
});

test('o passo Planejar não chama de próximas etapas o que já está no código', async () => {
  const [lp, roadmap] = await Promise.all([read('apps/web/src/components/lp/landing-page.tsx'), read('docs/ROADMAP.md')]);
  const prontas = ['### Stage 9 — Budget and monthly planning', '### Stage 12 — Goals and savings pots', '### Stage 14 — Net worth and the ARCA methodology'].every((h) => current(roadmap, h));
  if (prontas) assert.doesNotMatch(lp, /próximas etapas/i);
});

test('a lista de áreas cobre cada item da navegação do aplicativo e conta certo', async () => {
  const [lp, nav] = await Promise.all([read('apps/web/src/components/lp/landing-page.tsx'), read('src/lib/demo-data.ts')]);
  const areas = block(lp, 'const AREAS', '\n];');
  const titulos = [...areas.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  for (const [, label] of block(nav, 'export const NAV', '\n];').matchAll(/label: '([^']+)'/g)) {
    assert.ok(titulos.some((t) => t.includes(label)), `a área ${label} não aparece na LP`);
  }
  const numeros = ['Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];
  const dito = lp.match(/(Duas|Três|Quatro|Cinco|Seis|Sete|Oito|Nove|Dez) áreas/);
  if (dito) assert.equal(numeros.indexOf(dito[1]) + 2, titulos.length, `o texto diz "${dito[0]}" e a lista tem ${titulos.length}`);
});

test('a linha do tempo não dá downloads como prontos sem instalador assinado', async () => {
  const [lp, roadmap] = await Promise.all([read('apps/web/src/components/lp/landing-page.tsx'), read('docs/ROADMAP.md')]);
  const mvp1 = block(roadmap, '### MVP 1 — Landing page, sign-up and downloads', '\n### ');
  if (!/\*\*Planned:\*\*[^\n]*signed installers/.test(mvp1)) return;
  const linha = lp.match(/title: '([^']*downloads[^']*)', state: '([^']+)'/);
  assert.ok(linha, 'a linha do tempo lista a etapa de downloads');
  assert.notEqual(linha[2], 'pronto');
});
