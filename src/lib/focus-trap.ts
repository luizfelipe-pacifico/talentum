/* Foco preso dentro de um diálogo aberto.

   Antes, abrir um diálogo deixava o foco no botão de trás: quem navega por
   teclado ou leitor de tela seguia andando pela página coberta pelo diálogo. */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Próximo índice de foco ao pressionar Tab, dando a volta nas pontas. */
export function nextFocusIndex(current: number, total: number, backwards: boolean): number {
  if (total <= 0) return -1;
  if (current < 0) return backwards ? total - 1 : 0;
  return backwards ? (current - 1 + total) % total : (current + 1) % total;
}

/**
 * Prende o foco em `container`: foca o primeiro controle ao abrir, circula no
 * Tab e devolve o foco a quem abriu ao desmontar. Devolve a função de limpeza.
 */
export function trapFocus(container: HTMLElement): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusables = () => [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);

  (focusables()[0] ?? container).focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    event.preventDefault();
    const next = nextFocusIndex(items.indexOf(document.activeElement as HTMLElement), items.length, event.shiftKey);
    items[next]?.focus();
  };

  container.addEventListener('keydown', onKeyDown);
  return () => {
    container.removeEventListener('keydown', onKeyDown);
    if (opener?.isConnected) opener.focus();
  };
}
