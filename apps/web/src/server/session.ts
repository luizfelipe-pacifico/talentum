import { createHash, timingSafeEqual } from 'node:crypto';

/* Regras puras de sessão do BFF, separadas do Next para terem teste direto.

   Nada aqui conhece o Worker nem o D1: são decisões sobre cookies, o vínculo do
   `state` OAuth ao navegador e o IP repassado para o rate limit. */

export const ACCESS_COOKIE = '__Host-talentum-access';
export const REFRESH_COOKIE = '__Host-talentum-refresh';
export const OAUTH_STATE_COOKIE = '__Host-talentum-oauth-state';

/** Duração do vínculo do login: a mesma da transação OAuth no Worker. */
export const OAUTH_STATE_MAX_AGE = 600;

/**
 * Opções dos cookies de sessão.
 *
 * `Secure` vale em todo ambiente: o prefixo `__Host-` exige o atributo, e os
 * navegadores aceitam cookie seguro em `http://localhost`. Sem ele o login em
 * desenvolvimento voltava para a LP sem sessão.
 */
export function cookieOptions(maxAge: number, _env: string | undefined = process.env.NODE_ENV) {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge };
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Valor guardado no cookie do navegador que iniciou o login. Não revela o `state`. */
export function createStateBinding(state: string): string {
  return digest(state).toString('base64url');
}

/**
 * Confere se o callback pertence ao navegador que iniciou o login.
 *
 * Sem esse vínculo, quem iniciasse um login poderia entregar o próprio link de
 * callback a outra pessoa e fazê-la entrar na conta errada (CSRF de login).
 */
export function stateMatches(binding: string | undefined, state: string | null): boolean {
  if (!binding || !state) return false;
  const expected = Buffer.from(createStateBinding(state));
  const received = Buffer.from(binding);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * IP de quem acessou a LP, para o rate limit do Worker.
 *
 * Todas as chamadas ao Worker partem do servidor do BFF; sem esse repasse o
 * limite de login seria um único balde compartilhado por todas as pessoas.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || null;
}
