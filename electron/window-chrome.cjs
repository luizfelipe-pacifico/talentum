/* Moldura da janela por sistema (docs/DESIGN-SYSTEM.md, "Window controls").

   Cada sistema mantém os controles que as pessoas já conhecem:
   - macOS: os botões nativos (fechar, minimizar, zoom) à esquerda, coloridos,
     sobre a barra lateral, como no Finder e no Music;
   - Windows: os botões nativos à direita, pela sobreposição da barra de título,
     que preserva o menu de layouts de encaixe do Windows 11 ao passar o mouse
     sobre maximizar;
   - Linux: botões desenhados pelo app, no lado e na ordem que a área de
     trabalho define (GNOME, Cinnamon, MATE, Xfce, KDE), com a escolha da pessoa
     por cima, inclusive o estilo colorido do macOS.

   Funções puras ficam separadas da leitura do sistema para serem testadas
   (tests/window-chrome.test.mjs). */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const BUTTONS = ['close', 'minimize', 'maximize'];
const DEFAULT_LAYOUT = Object.freeze({ side: 'right', buttons: ['minimize', 'maximize', 'close'], source: 'default' });

/* Cores da sobreposição do Windows, iguais à superfície sob os botões em
   src/app/globals.css: a barra superior (--surface) com o app aberto, o fundo
   da página (--bg) nas telas de bloqueio e de primeiro acesso, que não têm
   barra. A janela escolhe só o tema e a superfície; a cor nunca vem dela. */
const OVERLAY = Object.freeze({
  bar: { light: '#fffdf8', dark: '#2a2622' },
  page: { light: '#f4f1ea', dark: '#211e1a' },
});
const SYMBOL = Object.freeze({ light: '#1a110a', dark: '#f1ece3' });
const OVERLAY_HEIGHT = 40;
// Centro dos botões nativos do macOS na faixa superior da barra lateral.
const TRAFFIC_LIGHTS = Object.freeze({ x: 18, y: 22 });

function overlayFor(theme, surface = 'bar') {
  const mode = theme === 'dark' ? 'dark' : 'light';
  const colors = surface === 'page' ? OVERLAY.page : OVERLAY.bar;
  return { color: colors[mode], symbolColor: SYMBOL[mode], height: OVERLAY_HEIGHT };
}

/** Opções do BrowserWindow que dependem do sistema. */
function chromeOptions(platform, theme = 'light') {
  if (platform === 'darwin') return { titleBarStyle: 'hidden', trafficLightPosition: { ...TRAFFIC_LIGHTS } };
  // A janela abre na tela de bloqueio, sem barra superior: começa com o fundo da página.
  if (platform === 'win32') return { titleBarStyle: 'hidden', titleBarOverlay: overlayFor(theme, 'page') };
  return { frame: false };
}

function keepKnown(names) {
  const seen = new Set();
  return names.filter((name) => BUTTONS.includes(name) && !seen.has(name) && seen.add(name));
}

/** Escolhe o lado que tem o botão de fechar; sem ele, o lado com mais botões. */
function pickSide(left, right, source) {
  if (left.includes('close')) return { side: 'left', buttons: left, source };
  if (right.includes('close')) return { side: 'right', buttons: right, source };
  if (left.length > right.length) return { side: 'left', buttons: left, source };
  if (right.length > 0) return { side: 'right', buttons: right, source };
  return null;
}

/** `button-layout` do GNOME, Cinnamon e MATE: "appmenu:minimize,maximize,close". */
function parseGnomeLayout(value) {
  const text = String(value ?? '').trim().replace(/^'|'$/g, '');
  if (!text.includes(':')) return null;
  const [left, right] = text.split(':').map((part) => keepKnown(part.split(',').map((name) => name.trim())));
  return pickSide(left, right, 'gnome');
}

/* Xfce (`/general/button_layout`): O menu, H minimizar, M maximizar, C fechar,
   S fixar, | título. KDE (kwinrc): X fechar, I minimizar, A maximizar. */
const XFCE_LETTERS = { C: 'close', H: 'minimize', M: 'maximize' };
const KDE_LETTERS = { X: 'close', I: 'minimize', A: 'maximize' };
const fromLetters = (text, letters) => keepKnown([...String(text ?? '')].map((letter) => letters[letter]).filter(Boolean));

function parseXfceLayout(value) {
  const text = String(value ?? '').trim();
  if (!text.includes('|')) return null;
  const [left, right] = text.split('|');
  return pickSide(fromLetters(left, XFCE_LETTERS), fromLetters(right, XFCE_LETTERS), 'xfce');
}

/** Lê ButtonsOnLeft e ButtonsOnRight de um kwinrc; padrão do KDE: "MS" e "HIAX". */
function parseKwinrc(text) {
  let section = '';
  const values = { ButtonsOnLeft: 'MS', ButtonsOnRight: 'HIAX' };
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^\[(.+)\]$/);
    if (header) section = header[1];
    else if (section === 'org.kde.kdecoration2') {
      const pair = line.match(/^(ButtonsOnLeft|ButtonsOnRight)=(.*)$/);
      if (pair) values[pair[1]] = pair[2];
    }
  }
  return pickSide(fromLetters(values.ButtonsOnLeft, KDE_LETTERS), fromLetters(values.ButtonsOnRight, KDE_LETTERS), 'kde');
}

function readCommand(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 2000, windowsHide: true }, (error, stdout) => resolve(error ? null : String(stdout)));
  });
}

/** Disposição dos botões configurada na área de trabalho Linux em uso. */
async function detectLinuxLayout(env = process.env, home = os.homedir()) {
  const desktop = String(env.XDG_CURRENT_DESKTOP ?? '').toUpperCase();
  try {
    if (desktop.includes('KDE')) {
      const config = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'kwinrc');
      const text = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
      return parseKwinrc(text) ?? DEFAULT_LAYOUT;
    }
    if (desktop.includes('XFCE')) {
      return parseXfceLayout(await readCommand('xfconf-query', ['-c', 'xfwm4', '-p', '/general/button_layout'])) ?? DEFAULT_LAYOUT;
    }
    const schema = desktop.includes('CINNAMON')
      ? ['org.cinnamon.desktop.wm.preferences', 'button-layout']
      : desktop.includes('MATE')
        ? ['org.mate.Marco.general', 'button-layout']
        : ['org.gnome.desktop.wm.preferences', 'button-layout'];
    return parseGnomeLayout(await readCommand('gsettings', ['get', ...schema])) ?? DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** Ícone da janela e da barra de tarefas: .ico só no Windows; o macOS usa o .icns do pacote. */
function windowIconPath(platform, appRoot) {
  if (platform === 'win32') return path.join(appRoot, 'icon-badge.ico');
  if (platform === 'darwin') return null;
  return path.join(appRoot, 'icon-badge.png');
}

module.exports = {
  DEFAULT_LAYOUT,
  OVERLAY_HEIGHT,
  TRAFFIC_LIGHTS,
  chromeOptions,
  detectLinuxLayout,
  overlayFor,
  parseGnomeLayout,
  parseKwinrc,
  parseXfceLayout,
  windowIconPath,
};
