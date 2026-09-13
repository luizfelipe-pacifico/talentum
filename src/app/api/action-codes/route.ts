import { NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { issueActionCode } from '@/server/action-codes';

const requestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/api/').max(200),
});

export async function POST(request: Request) {
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

  return NextResponse.json(issueActionCode(parsed.data.method, parsed.data.path), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
