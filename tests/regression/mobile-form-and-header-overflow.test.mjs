import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeitos vistos na revisão visual em 390 px (20/11/2026):
   1. Em /patrimonio, o seletor de pilar com opção longa alargava a coluna de
      `.field-row` além do cartão: `1fr` é `minmax(auto, 1fr)` e o mínimo
      automático é a largura do texto mais longo do <select>.
   2. Com os botões Lançar dinheiro, Bloquear e Notificações no cabeçalho, o
      título da página virava "Dashb…" no celular. O padrão dos apps de
      celular (título grande do iOS, top app bar do Material) põe as ações numa
      linha e o título inteiro logo abaixo. */

const css = async () => (await readFile(new URL('../../src/app/globals.css', import.meta.url), 'utf8')).replace(/\s+/g, ' ');

test('no celular a coluna do formulário não cresce com o texto do campo', async () => {
  const source = await css();
  const block = source.match(/@media \(max-width: 720px\) \{ \.spec-grid, \.mapping-grid, \.field-row \{ grid-template-columns: ([^;]+);/)?.[1];
  assert.equal(block, 'minmax(0, 1fr)');
  assert.match(source, /\.field select, \.field input \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
});

test('no celular o título da página fica inteiro, abaixo das ações', async () => {
  const source = await css();
  const block = source.match(/@media \(max-width: 600px\) \{ \.topbar \{ flex-wrap: wrap; \}(.*?)\}\s*\}/)?.[1] ?? '';
  assert.match(block, /\.topbar-heading \{[^}]*order: 2;[^}]*flex: 1 1 100%;/);
  assert.match(block, /\.topbar-heading \.page-title \{[^}]*white-space: normal;/);
});
