import { cookies } from 'next/headers';
import { cloud } from '../../../../server/cloudflare';
import { bffError, redirectNoStore } from '../../../../server/http';
import { ACCESS_COOKIE, MFA_COOKIE, REFRESH_COOKIE } from '../../../../server/session';
import { sameOrigin, siteUrl } from '../../../../server/site-url';

/* A revogação no Worker é tentada com o access token e também com o refresh
   token: com o access já expirado, a família ainda é revogada (docs/SECURITY.md,
   Open items, item 3). Sair do navegador não depende do Worker: os cookies saem sempre. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('forbidden', 403);
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  try {
    await cloud('/api/auth/logout', { method: 'POST', body: JSON.stringify(refreshToken ? { refreshToken } : {}) }, true);
  } catch {
    /* Worker ou configuração indisponível: a sessão local termina mesmo assim. */
  }
  const out = redirectNoStore(siteUrl('/', request), 303);
  out.cookies.delete(ACCESS_COOKIE);
  out.cookies.delete(REFRESH_COOKIE);
  out.cookies.delete(MFA_COOKIE);
  return out;
}
