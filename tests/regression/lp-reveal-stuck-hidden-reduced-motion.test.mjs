import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Com movimento reduzido, no celular, blocos inteiros da LP ficavam invisíveis
   (opacidade 0). useReducedMotion começa falso: o primeiro efeito do Reveal
   armava os blocos fora da tela; quando a preferência chegava, o efeito saía
   cedo, desligava o observador e o bloco ficava "armado" para sempre. A regra
   de movimento reduzido também perdia para .lp-reveal.lp-armed em
   especificidade. Duas defesas: o efeito volta à fase estática quando o
   movimento é reduzido, e o CSS anula o estado armado. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o Reveal desarma o bloco quando o movimento é reduzido', async () => {
  const fonte = await read('apps/web/src/components/lp/motion.tsx');
  const efeito = fonte.slice(fonte.indexOf('export function Reveal'), fonte.indexOf('const phaseClass'));
  assert.match(efeito, /if \(reduced\) \{\s*setPhase\('static'\);\s*return;\s*\}/);
});

test('com movimento reduzido o estado armado não esconde nada', async () => {
  const css = (await read('apps/web/src/styles/lp.css')).replace(/\s+/g, ' ');
  const bloco = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{(.*?)\} \}/g)].map((m) => m[1]).join(' ');
  assert.match(bloco, /\.lp-reveal, \.lp-reveal\.lp-armed[^{]*\{[^}]*opacity: 1/);
});
