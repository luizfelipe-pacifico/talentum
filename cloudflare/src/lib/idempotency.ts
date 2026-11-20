import type { Ctx } from '../context.ts';
import { now, sha, th } from './crypto.ts';
import { deny, json } from './http.ts';

/* Chave de idempotência das criações (cabeçalho `Idempotency-Key`).

   A mesma chave com o mesmo corpo devolve a resposta guardada, sem repetir o
   efeito; com outro corpo, 409. Enquanto a primeira execução não termina, a
   repetição recebe 409 REQUEST_IN_PROGRESS. Se a execução falha, a chave é
   liberada para nova tentativa. O token do Turnstile fica fora do hash: cada
   tentativa traz um novo. */

export async function idempotent(
  ctx: Ctx,
  userId: string,
  route: string,
  input: Record<string, unknown>,
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
): Promise<Response> {
  const key = ctx.r.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) return deny('IDEMPOTENCY_KEY_REQUIRED', 400);
  const { turnstileToken: _ignored, ...rest } = input;
  const requestHash = await sha(JSON.stringify(rest));
  const keyHash = await th(ctx.e, `idem:${key}`);
  const claimed = await ctx.e.DB.prepare(
    'INSERT INTO idempotency_keys(id,user_id,key_hash,route,request_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,key_hash) DO NOTHING',
  )
    .bind(crypto.randomUUID(), userId, keyHash, route, requestHash, now())
    .run();
  if (claimed.meta.changes !== 1) {
    const row = await ctx.e.DB.prepare('SELECT route,request_hash,status_code,response_json FROM idempotency_keys WHERE user_id=? AND key_hash=?')
      .bind(userId, keyHash)
      .first<{ route: string; request_hash: string; status_code: number | null; response_json: string | null }>();
    if (!row || row.route !== route || row.request_hash !== requestHash) return deny('IDEMPOTENCY_KEY_REUSED', 409);
    if (row.status_code === null || row.response_json === null) return deny('REQUEST_IN_PROGRESS', 409);
    return json(JSON.parse(row.response_json), row.status_code);
  }
  try {
    const result = await run();
    await ctx.e.DB.prepare('UPDATE idempotency_keys SET status_code=?,response_json=? WHERE user_id=? AND key_hash=?')
      .bind(result.status, JSON.stringify(result.body), userId, keyHash)
      .run();
    return json(result.body, result.status);
  } catch (error) {
    await ctx.e.DB.prepare('DELETE FROM idempotency_keys WHERE user_id=? AND key_hash=?').bind(userId, keyHash).run();
    throw error;
  }
}
