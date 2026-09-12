import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response: NextResponse;
  if (request.nextUrl.pathname.startsWith('/downloads') && !request.cookies.has('__Host-talentum-access')) {
    const target = request.cookies.has('__Host-talentum-refresh') ? '/api/auth/refresh' : '/api/auth/start';
    response = NextResponse.redirect(new URL(target, request.url));
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|marca|telas|lut).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
