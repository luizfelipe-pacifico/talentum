import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { privatePageFor } from './server/return-to';
import { siteUrl } from './server/site-url';

function contentSecurityPolicy(nonce: string) {
  // Em desenvolvimento o React avalia código com eval para os stack traces,
  // sem o que a página não hidrata, e o recarregamento do Next usa WebSocket.
  // Produção continua sem 'unsafe-eval' e sem ws:.
  const dev = process.env.NODE_ENV === 'development';
  const devEval = dev ? " 'unsafe-eval'" : '';
  const devSocket = dev ? ' ws:' : '';
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // 'strict-dynamic' autoriza o script do Turnstile inserido pelo widget;
    // o host fica listado para navegadores sem suporte a 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${devEval}`,
    // O desafio do Turnstile roda num iframe desse host (docs/SECURITY.md).
    'frame-src https://challenges.cloudflare.com',
    `connect-src 'self'${devSocket}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // O Chrome aplica form-action também ao redirecionamento que responde ao
    // envio: o login (POST /api/auth/start) termina no Google e o download
    // (POST .../download-grants) no GitHub Releases. Só esses destinos fixos.
    "form-action 'self' https://accounts.google.com https://github.com https://*.githubusercontent.com",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response: NextResponse;
  const privatePage = privatePageFor(request.nextUrl.pathname);
  if (privatePage && !request.cookies.has('__Host-talentum-access')) {
    // A renovação é um POST com checagem de origem (docs/SECURITY.md, Open
    // items, item 1): a página /entrar a dispara quando existe cookie de
    // renovação e, sem ele, pede o login.
    response = NextResponse.redirect(siteUrl(`/entrar?retorno=${encodeURIComponent(privatePage)}`, request));
    response.headers.set('Cache-Control', 'no-store');
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|marca|telas|lut|estados).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
