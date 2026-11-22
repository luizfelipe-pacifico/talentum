import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (revisão da página de downloads no celular, 21/11/2026): nas páginas
   internas da LP (downloads, conta, comunidade), o botão "Menu" do cabeçalho
   ficava invisível. O cabeçalho é ébano, e o botão herdava a tinta ébano da
   página, com só um contorno escuro de 1 px.

   Correção: o botão usa a tinta clara das seções escuras e se separa do fundo
   por um degrau de tom, não por contorno (docs/DESIGN-SYSTEM.md, Landing page
   surfaces). */

const css = await readFile(new URL('../../apps/web/src/styles/pages.css', import.meta.url), 'utf8');
const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

test('o botão Menu do cabeçalho escuro tem tinta clara e degrau de tom', () => {
  const summary = rule('.lp-shell-menu summary');
  assert.match(summary, /color: #fffdf8;/, 'tinta clara sobre o ébano');
  assert.match(summary, /background: rgb\(241 236 227 \/ 10%\);/, 'degrau de tom das seções escuras');
  assert.doesNotMatch(summary, /border: 1px solid/, 'sem contorno de 1 px');
});
