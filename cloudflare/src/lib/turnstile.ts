import { type Env, isProduction } from '../env.ts';
import { deny } from './http.ts';

/* Verificação do Cloudflare Turnstile no servidor (Siteverify).

   Decisão (docs/SECURITY.md, Turnstile): o desafio é exigido SEMPRE no início
   do login web e em toda criação de conteúdo da comunidade (publicação,
   comentário, denúncia). Votos, edições e exclusões ficam com sessão + rate
   limit. Só `success: true` com o `hostname` da LP e a `action` esperada vale;
   cada token é de uso único por definição do Siteverify.

   Sem TURNSTILE_SECRET_KEY: fora de produção o desafio é dispensado (para
   desenvolvimento e testes); em produção a ação é recusada com 503, nunca
   liberada em silêncio. */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileAction = 'login' | 'community';

export async function requireTurnstile(e: Env, token: unknown, action: TurnstileAction, ip: string): Promise<void> {
  const secret = e.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (isProduction(e)) deny('CHALLENGE_UNAVAILABLE', 503);
    return;
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) deny('CHALLENGE_FAILED', 403);
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token as string);
  if (ip !== 'local') form.set('remoteip', ip);
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    result = (await response.json()) as typeof result;
  } catch {
    return deny('CHALLENGE_UNAVAILABLE', 503);
  }
  let expectedHost: string | null = null;
  try {
    expectedHost = new URL(e.ALLOWED_ORIGIN).hostname;
  } catch {
    expectedHost = null;
  }
  if (result.success !== true || result.action !== action || !expectedHost || result.hostname !== expectedHost) {
    deny('CHALLENGE_FAILED', 403);
  }
}
