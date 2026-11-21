import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* No celular (390px) o lema do herói ocupava quatro linhas: cada frase,
   "Clareza para o presente." e "Disciplina para o futuro.", quebrava em duas
   a 34px. Medida em Playfair Display 700, a frase mais longa ocupa cerca de
   10,9em; abaixo de 560px o título passa a acompanhar a largura útil da tela
   (100vw menos os 20px de cada lado) para cada frase caber numa linha só. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const LARGURA_EM = 10.9;

test('abaixo de 560px cada frase do lema cabe numa linha', async () => {
  const css = (await read('apps/web/src/styles/lp.css')).replace(/\s+/g, ' ');
  const blocos = [...css.matchAll(/@media \(max-width: 559px\) \{(.*?)\} \}/g)].map((m) => m[1]).join(' ');
  const regra = blocos.match(/\.lp-hero-title \{([^}]*)\}/)?.[1] ?? '';
  const fonte = regra.match(/font-size: max\((\d+)px, calc\(\(100vw - (\d+)px\) \/ ([\d.]+)\)\)/);
  assert.ok(fonte, 'o título do herói não acompanha a largura útil no celular');
  const [, minimo, gutter, divisor] = fonte.map(Number);
  assert.ok(gutter >= 40, 'a conta precisa descontar os 20px de cada lado');
  assert.ok(Number(divisor) >= LARGURA_EM, `com divisor ${divisor} a frase de ${LARGURA_EM}em transborda`);
  assert.ok(minimo * LARGURA_EM <= 320 - 40, `o mínimo de ${minimo}px não cabe a 320px`);
  assert.match(blocos, /\.lp-hero-title \.lp-amber-line,? [^{]*\{[^}]*white-space: nowrap|\.lp-hero-title \{[^}]*white-space: nowrap/);
});
