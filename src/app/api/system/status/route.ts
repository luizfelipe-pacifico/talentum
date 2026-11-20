import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { readSessionToken } from '@/server/vault/session';

const path = '/api/system/status';

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path, readSessionToken(request))) {
    return NextResponse.json({ error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } }, { status: 403 });
  }

  return NextResponse.json(
    { status: 'ok', service: 'talentum-local-api', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
