import { NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { issueActionCode } from '@/server/action-codes';
import { sameOriginAsHost } from '@/server/local-host';
import { readSessionToken } from '@/server/vault/session';

const requestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/api/').max(200),
});

export async function POST(request: Request) {
  // Só a própria janela emite código: corpo JSON (força preflight em outra
  // origem) e, quando o navegador informa a origem, ela precisa ser a do app.
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'A solicitação não pôde ser concluída.' } }, { status: 415, headers: { 'Cache-Control': 'no-store' } });
  }
  const origin = request.headers.get('Origin');
  if (origin && !sameOriginAsHost(request.headers)) {
    return NextResponse.json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'A solicitação não foi autorizada.' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const expected = process.env.TALENTUM_LOCAL_BOOTSTRAP_SECRET;
  const supplied = request.headers.get('X-Talentum-Bootstrap');
  if (expected) {
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: { code: 'BOOTSTRAP_DENIED', message: 'A solicitação não foi autorizada.' } }, { status: 403 });
    }
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.path === '/api/action-codes') {
    return NextResponse.json({ error: { code: 'INVALID_ACTION_TARGET', message: 'A ação solicitada é inválida.' } }, { status: 400 });
  }

  // Fora das rotas que abrem o cofre, só quem tem sessão local recebe código (src/server/action-codes.ts).
  const issued = issueActionCode(parsed.data.method, parsed.data.path, readSessionToken(request));
  if (!issued) {
    return NextResponse.json({ error: { code: 'VAULT_LOCKED', message: 'O Talentum está bloqueado. Desbloqueie para continuar.' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(issued, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
