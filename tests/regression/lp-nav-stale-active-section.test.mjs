import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* O menu da LP marcava "O método" com a página parada em "O que já funciona",
   bem abaixo de "O sistema". O estado só mudava quando uma seção do menu
   cruzava a faixa central da tela (IntersectionObserver); um salto por âncora
   ou uma rolagem rápida que terminasse numa seção fora do menu deixava o item
   antigo marcado. Agora a seção ativa é a última do menu cujo topo já passou
   do meio da tela, recalculada a cada rolagem. */

const source = () => readFile(new URL('../../apps/web/src/components/lp/motion.tsx', import.meta.url), 'utf8');

function sectionNav(code) {
  const start = code.indexOf('export function SectionNav');
  assert.notEqual(start, -1);
  return code.slice(start, code.indexOf('\nexport function', start + 10));
}

test('a seção ativa não depende de um cruzamento observado', async () => {
  const nav = sectionNav(await source());
  assert.doesNotMatch(nav, /IntersectionObserver/);
  assert.match(nav, /addEventListener\('scroll'/);
  assert.match(nav, /getBoundingClientRect\(\)\.top/);
});
