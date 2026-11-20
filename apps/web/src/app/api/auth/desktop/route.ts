import { cloud } from '../../../../server/cloudflare';
import { redirectNoStore } from '../../../../server/http';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE, cookieOptions, createStateBinding } from '../../../../server/session';
import { siteUrl } from '../../../../server/site-url';

/* Login do app desktop (RFC 8252), aberto pelo app no navegador do sistema.

   O app recebeu do Worker um endereço desta rota com um valor de uso único
   (`handoff`). O BFF troca esse valor pela URL do Google e grava o cookie que
   amarra o `state` a este navegador, como no login web; o callback depois
   devolve o navegador ao loopback do app, com um código que só o PKCE do app
   resgata. É um GET porque o app só consegue abrir uma URL; um terceiro que
   force esta navegação não ganha nada: o resultado vai para o loopback
   registrado por quem iniciou. */

const HANDOFF = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(request: Request) {
  const handoff = new URL(request.url).searchParams.get('handoff');
  if (!handoff || !HANDOFF.test(handoff)) return redirectNoStore(siteUrl('/entrar?erro=desktop', request));
  const result = await cloud('/api/auth/desktop/handoff', { method: 'POST', body: JSON.stringify({ handoff }) });
  if (!result.ok) return redirectNoStore(siteUrl('/entrar?erro=desktop', request));
  const { authorizationUrl } = (await result.json()) as { authorizationUrl?: string };
  let state: string | null = null;
  try {
    const url = new URL(authorizationUrl ?? '');
    state = url.origin === 'https://accounts.google.com' ? url.searchParams.get('state') : null;
  } catch {
    state = null;
  }
  if (!state || !authorizationUrl) return redirectNoStore(siteUrl('/entrar?erro=desktop', request));
  const out = redirectNoStore(authorizationUrl);
  out.cookies.set(OAUTH_STATE_COOKIE, createStateBinding(state), cookieOptions(OAUTH_STATE_MAX_AGE));
  return out;
}
