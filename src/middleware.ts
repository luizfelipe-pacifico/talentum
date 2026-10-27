import { NextResponse, type NextRequest } from 'next/server';
import { isLoopbackHost } from '@/server/local-host';

/* Recusa chamadas à API local feitas por um Host que não é o loopback
   (DNS rebinding, ver src/server/local-host.ts). */
export function middleware(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get('host'))) {
    return NextResponse.json(
      { error: { code: 'HOST_NOT_ALLOWED', message: 'A solicitação não pôde ser concluída.' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
