import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeitos (revisão do empacotamento para Windows e macOS, 21/11/2026):

   1. O ícone da janela era `icon-badge.ico` em todos os sistemas. O Electron só
      lê .ico no Windows: no Linux a janela ficava sem ícone na barra de tarefas.
   2. O pacote não tinha `desktopName`. O Electron usa esse campo como WM_CLASS e
      app_id no Linux; sem ele o GNOME e o KDE não ligam a janela ao atalho
      .desktop e mostram um ícone genérico.
   3. A janela era `frame: false` em todos os sistemas, com os botões desenhados
      à direita. No macOS isso apagava os botões nativos coloridos da esquerda; no
      Windows perdia o menu de layouts de encaixe do botão maximizar.

   Correção: electron/window-chrome.cjs escolhe ícone e moldura por sistema, e o
   package.json declara `desktopName` com `linux.syncDesktopName`. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const require = (await import('node:module')).createRequire(import.meta.url);
const chrome = require('../../electron/window-chrome.cjs');

test('o ícone da janela é .ico só no Windows e .png no Linux', async () => {
  assert.match(chrome.windowIconPath('win32', '/app'), /icon-badge\.ico$/);
  assert.match(chrome.windowIconPath('linux', '/app'), /icon-badge\.png$/);
  assert.equal(chrome.windowIconPath('darwin', '/app'), null, 'o macOS usa o .icns do pacote');
  const main = await read('electron/main.cjs');
  assert.doesNotMatch(main, /createFromPath\(path\.join\(__dirname, '\.\.', 'icon-badge\.ico'\)\)/);
  assert.match(main, /chrome\.windowIconPath\(process\.platform/);
});

test('o Linux liga a janela ao atalho .desktop pelo desktopName', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.desktopName, 'talentum.desktop');
  assert.equal(pkg.build.linux.syncDesktopName, true);
  assert.equal(pkg.build.linux.executableName, 'talentum');
  assert.ok(pkg.build.files.includes('icon-badge.png'), 'o .png do ícone da janela vai no pacote');
});

test('cada sistema usa os botões que as pessoas já conhecem', async () => {
  assert.deepEqual(chrome.chromeOptions('darwin'), { titleBarStyle: 'hidden', trafficLightPosition: chrome.TRAFFIC_LIGHTS });
  const windows = chrome.chromeOptions('win32');
  assert.equal(windows.titleBarStyle, 'hidden');
  assert.ok(windows.titleBarOverlay, 'Windows usa a sobreposição nativa');
  assert.deepEqual(chrome.chromeOptions('linux'), { frame: false });
  const main = await read('electron/main.cjs');
  assert.doesNotMatch(main, /^\s*frame: false,/m, 'a moldura não é mais fixa para todos');
  assert.match(main, /\.\.\.chrome\.chromeOptions\(process\.platform\)/);
});
