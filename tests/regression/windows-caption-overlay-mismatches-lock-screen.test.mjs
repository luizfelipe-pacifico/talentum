import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

/* Defeito (captura do app instalado no Windows, workflow Desktop, 21/11/2026):
   na tela de criação do cofre, que não tem barra superior, a área dos botões
   nativos ficava com a cor da barra (#fffdf8) sobre o fundo da página
   (#f4f1ea): um retângulo mais claro no canto superior direito.

   Correção: a sobreposição acompanha a superfície sob os botões, a barra
   superior com o app aberto e o fundo da página nas telas do cofre; a janela
   abre com a cor do fundo, porque começa na tela de bloqueio. */

const root = new URL('../../', import.meta.url);
const chrome = createRequire(import.meta.url)('../../electron/window-chrome.cjs');
const css = await readFile(new URL('src/app/globals.css', root), 'utf8');
const token = (block, name) => block.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1];
const light = css.slice(0, css.indexOf('html.dark {'));
const dark = css.slice(css.indexOf('html.dark {'));

test('a sobreposição usa a cor do fundo da página nas telas sem barra', () => {
  assert.equal(chrome.overlayFor('light', 'page').color, '#f4f1ea');
  assert.equal(token(dark, 'bg'), chrome.overlayFor('dark', 'page').color);
  assert.equal(token(light, 'surface'), chrome.overlayFor('light', 'bar').color);
  assert.equal(token(dark, 'surface'), chrome.overlayFor('dark', 'bar').color);
});

test('a janela abre com a cor do fundo e a barra assume quando o app abre', async () => {
  assert.equal(chrome.chromeOptions('win32').titleBarOverlay.color, chrome.overlayFor('light', 'page').color);
  const controls = await readFile(new URL('src/components/window-controls.tsx', root), 'utf8');
  assert.match(controls, /setWindowSurface\('bar'\);\s*return \(\) => setWindowSurface\('page'\);/);
  const main = await readFile(new URL('electron/main.cjs', root), 'utf8');
  assert.match(main, /surface !== 'bar' && surface !== 'page'/, 'superfície desconhecida é ignorada');
});
