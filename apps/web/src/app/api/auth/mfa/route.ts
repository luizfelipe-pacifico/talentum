import { cookies } from 'next/headers';
import { loginOutcome, mfaErrorNotice } from '../../../../server/auth-flow';
import { cloud } from '../../../../server/cloudflare';
import { bffError, formText, readForm, redirectNoStore, workerErrorCode } from '../../../../server/http';
import { loginResponse } from '../../../../server/login-response';
import { MFA_COOKIE, RETURN_COOKIE } from '../../../../server/session';
import { sameOrigin, siteUrl } from '../../../../server/site-url';

/* Código do app autenticador (ou de recuperação) depois do callback. A sessão
   só nasce quando o Worker aceita o código e consome o estado pendente. */

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('forbidden', 403);
  const jar = await cookies();
  const mfaToken = jar.get(MFA_COOKIE)?.value;
  if (!mfaToken) return redirectNoStore(siteUrl('/entrar/verificacao?erro=expirado', request));
  const form = await readForm(request);
  const code = formText(form, 'code')?.replace(/\s+/g, '') ?? '';
  const recoveryCode = formText(form, 'recoveryCode')?.trim() ?? '';
  const result = await cloud('/api/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify(recoveryCode ? { mfaToken, recoveryCode } : { mfaToken, code }),
  });
  if (!result.ok) {
    const notice = mfaErrorNotice(await workerErrorCode(result));
    const out = redirectNoStore(siteUrl(`/entrar/verificacao?erro=${notice}${recoveryCode ? '&modo=recuperacao' : ''}`, request));
    if (notice === 'expirado') out.cookies.delete(MFA_COOKIE);
    return out;
  }
  return loginResponse(loginOutcome(await result.json().catch(() => null)), request, jar.get(RETURN_COOKIE)?.value);
}
