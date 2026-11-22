/* Tema e superfície sob os botões nativos do Windows (electron/window-chrome.cjs).

   O tema vem de app-state; a superfície é a barra superior enquanto o
   AppShell está montado e o fundo da página nas telas do cofre, que não têm
   barra. Cada mudança reenvia o par ao processo principal. */

type Theme = 'light' | 'dark';
type Surface = 'bar' | 'page';

let theme: Theme = 'light';
let surface: Surface = 'page';

function send() {
  if (typeof window !== 'undefined') window.talentumWindow?.setTheme?.(theme, surface);
}

export function setWindowTheme(next: Theme) {
  theme = next;
  send();
}

export function setWindowSurface(next: Surface) {
  surface = next;
  send();
}
