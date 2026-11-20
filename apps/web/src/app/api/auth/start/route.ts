import type { NextResponse } from 'next/server';
import { startErrorNotice } from '../../../../server/auth-flow';
import { cloud } from '../../../../server/cloudflare';
import { bffError, formText, readForm, redirectNoStore, workerErrorCode } from '../../../../server/http';
import { LEGAL_VERSIONS } from '../../../../server/legal';
import { safeReturn } from '../../../../server/return-to';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE, RETURN_COOKIE, cookieOptions, createStateBinding } from '../../../../server/session';
import { sameOrigin, siteUrl } from '../../../../server/site-url';
import { TURNSTILE_FIELD } from '../../../../server/turnstile';

/* Início do login.

   GET só leva à página /entrar: o login começa por um POST do formulário que
   mostra o aceite dos documentos e o desafio do Turnstile. O envio desse
   formulário é o aceite registrado no cadastro (docs/SECURITY.md). */

export async function GET(request: Request) {
  return redirectNoStore(siteUrl('/entrar', request), 303);
}

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('forbidden', 403);
  const form = await readForm(request);
  const returnTo = safeReturn(formText(form, 'retorno'));
  const result = await cloud('/api/auth/start', {
    method: 'POST',
    body: JSON.stringify({ consent: LEGAL_VERSIONS, turnstileToken: formText(form, TURNSTILE_FIELD) ?? '' }),
  });
  if (!result.ok) {
    const notice = startErrorNotice(result.status, await workerErrorCode(result));
    return redirectNoStore(siteUrl(`/entrar?erro=${notice}&retorno=${encodeURIComponent(returnTo)}`, request));
  }
  const { authorizationUrl } = (await result.json()) as { authorizationUrl?: string };
  let state: string | null = null;
  try {
    const url = new URL(authorizationUrl ?? '');
    state = url.origin === 'https://accounts.google.com' ? url.searchParams.get('state') : null;
  } catch {
    state = null;
  }
  if (!state || !authorizationUrl) return redirectNoStore(siteUrl('/entrar?erro=indisponivel', request));
  const out: NextResponse = redirectNoStore(authorizationUrl);
  out.cookies.set(OAUTH_STATE_COOKIE, createStateBinding(state), cookieOptions(OAUTH_STATE_MAX_AGE));
  out.cookies.set(RETURN_COOKIE, returnTo, cookieOptions(OAUTH_STATE_MAX_AGE));
  return out;
}
