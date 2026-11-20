import type { NextResponse } from 'next/server';
import type { LoginOutcome } from './auth-flow';
import { redirectNoStore } from './http';
import { safeReturn } from './return-to';
import { ACCESS_COOKIE, cookieOptions, MFA_COOKIE, REFRESH_COOKIE, RETURN_COOKIE } from './session';
import { siteUrl } from './site-url';

/* Resposta do BFF para o resultado do login (callback ou verificação). */

export function loginResponse(outcome: LoginOutcome, request: Request, returnTo: string | undefined): NextResponse {
  if (outcome.kind === 'mfa') {
    const out = redirectNoStore(siteUrl('/entrar/verificacao', request));
    out.cookies.set(MFA_COOKIE, outcome.mfaToken, cookieOptions(outcome.expiresInSeconds));
    return out;
  }
  if (outcome.kind === 'desktop') {
    // O navegador volta para o app desktop; nenhum cookie de sessão web nasce aqui.
    const out = redirectNoStore(outcome.url);
    out.cookies.delete(MFA_COOKIE);
    out.cookies.delete(RETURN_COOKIE);
    return out;
  }
  if (outcome.kind === 'invalid') return redirectNoStore(siteUrl('/entrar?erro=indisponivel', request));
  const out = redirectNoStore(siteUrl(safeReturn(returnTo), request));
  out.cookies.delete(MFA_COOKIE);
  out.cookies.delete(RETURN_COOKIE);
  out.cookies.set(ACCESS_COOKIE, outcome.accessToken, cookieOptions(outcome.accessExpiresInSeconds));
  out.cookies.set(REFRESH_COOKIE, outcome.refreshToken, cookieOptions(outcome.refreshExpiresInSeconds));
  return out;
}
