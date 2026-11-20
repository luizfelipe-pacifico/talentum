/* Destinos de volta depois do login ou da renovação de sessão.

   Sem import de Node: roda no middleware (borda) e nas rotas. O destino vem da
   URL, então só valores desta lista são aceitos; qualquer outro vira
   `/downloads`. Assim `retorno` nunca leva a pessoa para fora do site (open
   redirect). */

/** Páginas que exigem sessão. */
export const PRIVATE_PAGES = ['/downloads', '/conta', '/comunidade/nova'] as const;
export type PrivatePage = (typeof PRIVATE_PAGES)[number];

/** Destinos aceitos em `retorno`: as páginas privadas e a comunidade. */
const RETURN_TARGETS: readonly string[] = [...PRIVATE_PAGES, '/comunidade'];

export function safeReturn(value: string | null | undefined): string {
  return value && RETURN_TARGETS.includes(value) ? value : '/downloads';
}

export function privatePageFor(pathname: string): PrivatePage | null {
  return PRIVATE_PAGES.find((page) => pathname === page || pathname.startsWith(`${page}/`)) ?? null;
}
