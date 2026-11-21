import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseWindowPreferences, resolveLayout } from '../src/lib/window-layout.ts';

/* Moldura e botões da janela por sistema (docs/DESIGN-SYSTEM.md, "Window controls"). */

const chrome = createRequire(import.meta.url)('../electron/window-chrome.cjs');

test('GNOME, Cinnamon e MATE: lado do botão de fechar, na ordem configurada', () => {
  assert.deepEqual(chrome.parseGnomeLayout("'appmenu:minimize,maximize,close'"), { side: 'right', buttons: ['minimize', 'maximize', 'close'], source: 'gnome' });
  assert.deepEqual(chrome.parseGnomeLayout("'close,minimize,maximize:appmenu'"), { side: 'left', buttons: ['close', 'minimize', 'maximize'], source: 'gnome' });
  // Padrão do GNOME: só fechar, à direita.
  assert.deepEqual(chrome.parseGnomeLayout("'appmenu:close'"), { side: 'right', buttons: ['close'], source: 'gnome' });
  // Botões desconhecidos e repetidos são ignorados.
  assert.deepEqual(chrome.parseGnomeLayout("'icon,spacer:close,close,minimize'"), { side: 'right', buttons: ['close', 'minimize'], source: 'gnome' });
  assert.equal(chrome.parseGnomeLayout(''), null);
  assert.equal(chrome.parseGnomeLayout("'appmenu:'"), null);
});

test('Xfce: letras do xfwm4', () => {
  assert.deepEqual(chrome.parseXfceLayout('O|HMC'), { side: 'right', buttons: ['minimize', 'maximize', 'close'], source: 'xfce' });
  assert.deepEqual(chrome.parseXfceLayout('CHM|O'), { side: 'left', buttons: ['close', 'minimize', 'maximize'], source: 'xfce' });
  assert.equal(chrome.parseXfceLayout('HMC'), null);
});

test('KDE: kwinrc, com o padrão do Plasma quando a chave falta', () => {
  assert.deepEqual(chrome.parseKwinrc(''), { side: 'right', buttons: ['minimize', 'maximize', 'close'], source: 'kde' });
  const left = '[org.kde.kdecoration2]\nButtonsOnLeft=XIA\nButtonsOnRight=\n';
  assert.deepEqual(chrome.parseKwinrc(left), { side: 'left', buttons: ['close', 'minimize', 'maximize'], source: 'kde' });
  // Chave de outra seção não vale.
  assert.equal(chrome.parseKwinrc('[Outra]\nButtonsOnLeft=XIA\n').side, 'right');
});

test('detecta o KDE pelo kwinrc da pessoa e cai no padrão sem leitura', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'talentum-kwin-'));
  try {
    await mkdir(path.join(home, '.config'));
    await writeFile(path.join(home, '.config', 'kwinrc'), '[org.kde.kdecoration2]\nButtonsOnLeft=XAI\nButtonsOnRight=\n');
    const layout = await chrome.detectLinuxLayout({ XDG_CURRENT_DESKTOP: 'KDE' }, home);
    assert.deepEqual(layout.buttons, ['close', 'maximize', 'minimize']);
    const none = await chrome.detectLinuxLayout({ XDG_CURRENT_DESKTOP: 'KDE' }, path.join(home, 'nao-existe'));
    assert.equal(none.side, 'right');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('Windows: a sobreposição acompanha o tema com cores fixas', () => {
  assert.deepEqual(chrome.overlayFor('dark'), { color: '#2a2622', symbolColor: '#f1ece3', height: chrome.OVERLAY_HEIGHT });
  assert.deepEqual(chrome.overlayFor('light'), { color: '#fffdf8', symbolColor: '#1a110a', height: chrome.OVERLAY_HEIGHT });
  assert.deepEqual(chrome.overlayFor('<script>'), chrome.overlayFor('light'), 'valor desconhecido vira o tema claro');
});

test('preferências do Linux: seguir o sistema ou fixar um lado', () => {
  const system = { side: 'left', buttons: ['close', 'maximize'] };
  assert.deepEqual(resolveLayout(system, { side: 'sistema', style: 'discreto' }), { side: 'left', buttons: ['close', 'maximize'], style: 'discreto' });
  assert.deepEqual(resolveLayout(system, { side: 'direita', style: 'colorido' }), { side: 'right', buttons: ['minimize', 'maximize', 'close'], style: 'colorido' });
  assert.deepEqual(resolveLayout(null, { side: 'esquerda', style: 'discreto' }).buttons, ['close', 'minimize', 'maximize']);
  assert.deepEqual(resolveLayout(null, { side: 'sistema', style: 'discreto' }).side, 'right', 'sem leitura do sistema fica à direita');
  assert.deepEqual(resolveLayout({ side: 'left', buttons: [] }, { side: 'sistema', style: 'discreto' }).buttons, ['minimize', 'maximize', 'close']);
});

test('preferência salva inválida volta ao padrão', () => {
  assert.deepEqual(parseWindowPreferences(null), { side: 'sistema', style: 'discreto' });
  assert.deepEqual(parseWindowPreferences('{"side":"esquerda","style":"colorido"}'), { side: 'esquerda', style: 'colorido' });
  assert.deepEqual(parseWindowPreferences('{"side":"cima","style":"neon"}'), { side: 'sistema', style: 'discreto' });
  assert.deepEqual(parseWindowPreferences('não é json'), { side: 'sistema', style: 'discreto' });
});
