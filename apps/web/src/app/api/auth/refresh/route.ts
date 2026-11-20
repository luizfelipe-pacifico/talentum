import { cookies } from 'next/headers';
import { loginOutcome } from '../../../../server/auth-flow';
import { cloud } from '../../../../server/cloudflare';
import { bffError, formText, readForm, redirectNoStore } from '../../../../server/http';
import { loginResponse } from '../../../../server/login-response';
import { safeReturn } from '../../../../server/return-to';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../../server/session';
import { sameOrigin, siteUrl } from '../../../../server/site-url';

/* Renovação da sessão: POST com checagem de origem. Como GET, qualquer site
   podia forçar a rotação numa navegação de topo, porque o cookie SameSite=Lax
   acompanha esse tipo de navegação (docs/SECURITY.md, Open items, item 1). */

export async function GET(request: Request) {
  return redirectNoStore(siteUrl('/entrar', request), 303);
}

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('forbidden', 403);
  const form = await readForm(request);
  const returnTo = safeReturn(formText(form, 'retorno'));
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  const back = () => {
    const out = redirectNoStore(siteUrl(`/entrar?retorno=${encodeURIComponent(returnTo)}`, request));
    out.cookies.delete(ACCESS_COOKIE);
    out.cookies.delete(REFRESH_COOKIE);
    return out;
  };
  if (!refreshToken) return back();
  const result = await cloud('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  if (!result.ok) return back();
  const outcome = loginOutcome(await result.json().catch(() => null));
  if (outcome.kind !== 'session') return back();
  return loginResponse(outcome, request, returnTo);
}
