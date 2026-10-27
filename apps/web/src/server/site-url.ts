/* Origem e endereço público da requisição. Sem imports de Node: roda no
   middleware (borda), nas rotas do BFF e nos testes. */

/** Host público da requisição: o encaminhado pela Vercel ou o próprio. */
function publicHost(headers: Headers): string | null {
  return headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
}

/**
 * A mutação veio de uma página do próprio site?
 *
 * Compara o Origin com o Host acessado. Comparar com `request.url` falhava em
 * `next dev`, que monta a URL como localhost mesmo quando a pessoa usa
 * 127.0.0.1. Sem Origin, a proteção fica com o cookie `SameSite=Lax`.
 */
export function sameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (origin === null) return true;
  try {
    return new URL(origin).host === publicHost(headers);
  } catch {
    return false;
  }
}

/** URL absoluta no mesmo host e protocolo que a pessoa acessou, para redirecionar. */
export function siteUrl(path: string, request: Request): URL {
  const fallback = new URL(request.url);
  const host = publicHost(request.headers) ?? fallback.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || fallback.protocol.replace(':', '');
  return new URL(path, `${proto}://${host}`);
}
