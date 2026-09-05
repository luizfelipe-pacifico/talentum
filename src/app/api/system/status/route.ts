import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';

const path = '/api/system/status';

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path)) {
    return NextResponse.json({ error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } }, { status: 403 });
  }

  return NextResponse.json(
    { status: 'ok', service: 'talentum-local-api', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
