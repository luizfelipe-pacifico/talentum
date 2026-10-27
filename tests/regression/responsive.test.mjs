import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Medição em 390, 768, 1280, 1440 e 1920 px (26 de outubro de 2026):
   em 390 px a barra lateral fixa de 248 px deixava 89 px de conteúdo, o
   cabeçalho chegava a 442 px de altura e controles vazavam da tela; em 768 px
   o cabeçalho quebrava em três linhas. O app roda hoje no Electron com largura
   mínima de 1024 px, mas o layout precisa servir a qualquer tela. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const css = (await read('src/app/globals.css')).replace(/\s+/g, ' ');

/** Corpo de cada bloco @media com a condição dada, concatenado. */
function mediaBlocks(condition) {
  const out = [];
  let index = css.indexOf(`@media ${condition} {`);
  while (index !== -1) {
    let depth = 0;
    let end = index;
    for (let i = css.indexOf('{', index); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') depth -= 1;
      if (depth === 0) { end = i; break; }
    }
    out.push(css.slice(index, end + 1));
    index = css.indexOf(`@media ${condition} {`, end);
  }
  return out.join(' ');
}

test('abaixo de 900 px a barra lateral vira gaveta e o conteúdo ocupa a largura toda', () => {
  const narrow = mediaBlocks('(max-width: 900px)');
  assert.match(narrow, /\.shell \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(narrow, /\.sidebar \{[^}]*position: fixed[^}]*transform: translateX\(-100%\)/);
  assert.match(narrow, /\.shell\[data-nav='open'\] \.sidebar \{[^}]*transform: none/);
  assert.match(narrow, /\.menu-button \{[^}]*display: inline-flex/);
});

test('o botão de menu controla a gaveta e a gaveta fechada sai do teclado', async () => {
  const shell = await read('src/components/app-shell.tsx');
  assert.match(shell, /className="menu-button"[\s\S]{0,300}aria-expanded=\{navOpen\}/);
  assert.match(shell, /aria-controls="navegacao-principal"/);
  assert.match(shell, /id="navegacao-principal"/);
  assert.match(shell, /inert=\{narrow && !navOpen\}/);
  // Navegar fecha a gaveta; Esc também.
  assert.match(shell, /useEffect\(\(\) => \{\s*setNavOpen\(false\);\s*\}, \[pathname\]\)/);
});

test('o cabeçalho cabe em uma linha no celular', () => {
  const phone = mediaBlocks('(max-width: 600px)');
  assert.match(phone, /\.topbar \{[^}]*flex-wrap: nowrap/);
  assert.match(phone, /\.page-context \{[^}]*display: none/);
  assert.match(phone, /\.btn-label \{[^}]*display: none/);
  // Margem lateral de celular definida em docs/BRANDING.md.
  assert.match(phone, /\.content \{[^}]*padding: 20px 16px 48px/);
});

test('o cabeçalho também cabe em uma linha no tablet', () => {
  // Em 768 px as ações desciam para uma segunda linha (cabeçalho de 127 px).
  const narrow = mediaBlocks('(max-width: 900px)');
  assert.match(narrow, /\.topbar \{[^}]*flex-wrap: nowrap/);
  assert.match(narrow, /\.topbar \.row-tight \{[^}]*flex-wrap: nowrap/);
  assert.match(narrow, /\.topbar-heading \{[^}]*flex: 1 1 0/);
  assert.match(narrow, /\.btn-label \{[^}]*display: none/);
});

test('o cabeçalho cabe em uma linha também com a barra lateral fixa (901 a 1180 px)', () => {
  // Em 956 px, com 248 px de barra lateral, título e ações quebravam em duas linhas.
  const desktopSmall = mediaBlocks('(max-width: 1180px)');
  assert.match(desktopSmall, /\.topbar \{[^}]*flex-wrap: nowrap/);
  assert.match(desktopSmall, /\.topbar-heading \{[^}]*flex: 1 1 0/);
  assert.match(desktopSmall, /\.btn-label \{[^}]*display: none/);
});

test('fora do Electron e em tela estreita, os controles de janela somem', () => {
  assert.match(mediaBlocks('(max-width: 900px)'), /html:not\(\.electron\) \.window-controls \{[^}]*display: none/);
});

test('em tela de toque os alvos têm 44 px', () => {
  const touch = mediaBlocks('(pointer: coarse)');
  assert.match(touch, /min-height: 44px/);
  for (const selector of ['.btn', '.icon-button', '.nav-item', '.menu-button']) assert.ok(touch.includes(selector), selector);
});

test('nenhum texto da barra lateral fica abaixo de 12 px', () => {
  const rules = [...css.matchAll(/\.sidebar-account-label \{([^}]*)\}/g)].map((m) => m[1]);
  const sizes = rules.flatMap((rule) => [...rule.matchAll(/font-size: (\d+)px/g)].map((m) => Number(m[1])));
  assert.ok(sizes.length > 0);
  assert.ok(sizes.at(-1) >= 12, `tamanho final ${sizes.at(-1)}px`);
});

test('a lista de destinos do Início não exige 320 px em tela pequena', () => {
  assert.match(css, /\.area-list \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(min\(320px, 100%\), 1fr\)\)/);
});
