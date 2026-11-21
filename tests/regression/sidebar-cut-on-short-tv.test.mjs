import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (revisão visual, 20/11/2026): na TV pequena (960 × 540) o menu
   lateral mostrava só cinco das sete áreas; "Invest" saía cortado pela metade
   e "Histórico" só aparecia rolando um menu que não indica que rola. A pilha
   (marca, conta ativa, sete itens de 42 px, importação, configurações e
   recolher) somava cerca de 610 px numa janela de 540.

   Correção: em janelas baixas o menu passa para a densidade compacta, como a
   barra lateral do Finder, do Gmail e do Material (densidade -2) fazem quando
   falta altura: mesmos itens, mesma ordem, menos respiro vertical. A soma cai
   para cerca de 470 px. A verificação ao vivo, por viewport, está em
   tests/e2e/viewports.spec.ts ("todas as áreas do menu aparecem inteiras"). */

const css = (await readFile(new URL('../../src/app/globals.css', import.meta.url), 'utf8')).replace(/\s+/g, ' ');

function rule(block, selector) {
  return block.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
}

const px = (value) => Number.parseFloat(value);

test('janela baixa ganha um menu compacto que cabe em 540 px', () => {
  const start = css.indexOf('@media (min-width: 601px) and (max-height: 640px) {');
  assert.notEqual(start, -1, 'bloco de densidade compacta');
  const block = css.slice(start, css.indexOf('} }', start) + 3);

  const padding = (selector) => px(/padding: (\d+)px/.exec(rule(block, selector))?.[1] ?? 'NaN');
  const item = 20 + 2 * padding('.nav-item');
  const sidebarPadding = 2 * padding('.sidebar');
  const gap = px(/gap: (\d+)px/.exec(rule(block, '.sidebar'))?.[1] ?? 'NaN');
  const brand = px(/min-height: (\d+)px/.exec(rule(block, '.sidebar-brand'))?.[1] ?? 'NaN');
  const account = 18 + 12 + 2 * padding('.sidebar-account') + 2;
  const nav = 7 * item + 6 * 2;
  const importButton = 20 + 2 * padding('.sidebar-import') + 2;
  const quiet = 20 + 2 * padding('.sidebar-quiet');
  const collapse = 20 + 8 + 1;
  const total = sidebarPadding + brand + account + nav + importButton + quiet + collapse + 5 * gap;

  for (const value of [item, sidebarPadding, gap, brand, account, importButton, quiet]) assert.ok(Number.isFinite(value), block);
  assert.ok(total <= 540 - 24, `o menu soma ${total} px em 540`);
  // Alvo de clique ainda acima do mínimo de 24 px do WCAG 2.5.8.
  assert.ok(item >= 32, `item com ${item} px`);
});
