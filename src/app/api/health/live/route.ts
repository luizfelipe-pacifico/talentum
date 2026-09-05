import { NextResponse } from 'next/server';

// Infrastructure probe: it is not a frontend action and exposes no application data.
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
