import { NextResponse, type NextRequest } from 'next/server';
import { bodyVerdict } from '@/server/body-limits';
import { localContentSecurityPolicy } from '@/server/csp';
import { isLoopbackHost } from '@/server/local-host';

/* Borda de todas as requisições do app local.

   - API: recusa chamadas feitas por um Host que não é o loopback (DNS
     rebinding, ver src/server/local-host.ts) e corpo acima do teto pelo
     `Content-Length` declarado (src/server/body-limits.ts).
   - Páginas: envia a Content-Security-Policy com um nonce por requisição
     (src/server/csp.ts). O Next lê o nonce do cabeçalho da requisição e o
     aplica aos próprios scripts; o layout o aplica ao script de tema. */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (!isLoopbackHost(request.headers.get('host'))) {
      return NextResponse.json(
        { error: { code: 'HOST_NOT_ALLOWED', message: 'A solicitação não pôde ser concluída.' } },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // O tamanho declarado decide antes de o Next terminar de receber o corpo.
    const verdict = bodyVerdict(request.method, request.nextUrl.pathname, request.headers.get('content-length'));
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: verdict.code, message: verdict.status === 413 ? 'O envio excede o tamanho máximo aceito.' : 'O envio não informou o tamanho do conteúdo.' } },
        { status: verdict.status, headers: { 'Cache-Control': 'no-store', Connection: 'close' } },
      );
    }
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = localContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    {
      // Arquivos estáticos não precisam de nonce; prefetch do roteador também não.
      source: '/((?!api|_next/static|_next/image|favicon.ico|marca|estados|lut|telas).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
