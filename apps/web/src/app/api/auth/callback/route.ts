import { cookies } from 'next/headers';
import { loginOutcome } from '../../../../server/auth-flow';
import { cloud } from '../../../../server/cloudflare';
import { redirectNoStore } from '../../../../server/http';
import { loginResponse } from '../../../../server/login-response';
import { OAUTH_STATE_COOKIE, RETURN_COOKIE, stateMatches } from '../../../../server/session';
import { siteUrl } from '../../../../server/site-url';

/* Volta do Google. O `state` precisa pertencer a este navegador (CSRF de
   login). O Worker devolve a sessão web, o desafio de verificação em duas
   etapas ou, num login do app desktop, o endereço de loopback do app. */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = await cookies();
  if (!code || !state) return redirectNoStore(siteUrl('/?auth=cancelado', request));
  if (!stateMatches(jar.get(OAUTH_STATE_COOKIE)?.value, state)) {
    const out = redirectNoStore(siteUrl('/?auth=erro', request));
    out.cookies.delete(OAUTH_STATE_COOKIE);
    return out;
  }
  const result = await cloud('/api/auth/callback', { method: 'POST', body: JSON.stringify({ code, state }) });
  if (!result.ok) {
    const out = redirectNoStore(siteUrl('/?auth=erro', request));
    out.cookies.delete(OAUTH_STATE_COOKIE);
    return out;
  }
  const outcome = loginOutcome(await result.json().catch(() => null));
  const out = loginResponse(outcome, request, jar.get(RETURN_COOKIE)?.value);
  out.cookies.delete(OAUTH_STATE_COOKIE);
  return out;
}
