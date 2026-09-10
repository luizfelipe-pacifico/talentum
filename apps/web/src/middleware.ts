import { NextResponse } from 'next/server'; import type { NextRequest } from 'next/server';
export function middleware(request:NextRequest){if(request.cookies.has('__Host-talentum-access'))return NextResponse.next();return NextResponse.redirect(new URL(request.cookies.has('__Host-talentum-refresh')?'/api/auth/refresh':'/api/auth/start',request.url))}
export const config={matcher:['/downloads/:path*']};
