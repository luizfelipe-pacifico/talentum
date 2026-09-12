/* Borda HTTP da API local.

   Concentra o que toda rota funcional precisa fazer antes de tocar o domínio:
   consumir o código de ação, resolver o perfil local e responder erro sem vazar
   detalhe interno. Repetir isso em cada arquivo de rota é como uma verificação
   acaba esquecida em uma delas.

   `docs/API.md`: mensagem pública não inclui caminho local, SQL, nome interno,
   token ou conteúdo do documento importado. */

import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { getLocalProfileId } from '@/server/profile';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Resposta JSON de sucesso, sempre sem cache. */
export function ok(body: unknown, status = 200) {
  return NextResponse.json(body as Record<string, unknown>, { status, headers: NO_STORE });
}

/** Resposta de erro no formato único de `docs/API.md`. */
export function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * Valida o código de ação da requisição.
 *
 * O código é vinculado ao método e ao **caminho** concreto — inclusive o
 * segmento dinâmico, lido do próprio endereço: um código emitido para um lote
 * não serve para outro.
 *
 * A query string fica deliberadamente de fora da vinculação. O código
 * identifica o contrato, não os valores do filtro; amarrar cada combinação de
 * filtro a um código próprio não acrescentaria proteção, porque filtro,
 * propriedade e escopo por perfil já são validados a cada requisição. O cliente
 * aplica a mesma regra em `actionCodePath`.
 *
 * Devolve `null` quando a requisição pode seguir.
 */
export function requireActionCode(request: Request): NextResponse | null {
  const path = new URL(request.url).pathname;
  if (consumeActionCode(request.headers.get('X-Action-Code'), request.method, path)) return null;
  return fail('INVALID_ACTION_CODE', 'A ação não pôde ser validada.', 403);
}

export type Guarded = { profileId: string } | { response: NextResponse };

/**
 * Valida o código de ação e exige um perfil local.
 *
 * Sem perfil não existe base financeira: a rota responde `hasProfile: false` e a
 * interface leva ao onboarding, em vez de devolver zeros.
 */
export async function guardWithProfile(request: Request): Promise<Guarded> {
  const denied = requireActionCode(request);
  if (denied) return { response: denied };

  const profileId = await getLocalProfileId();
  if (!profileId) return { response: ok({ hasProfile: false }) };

  return { profileId };
}

export function isDenied(guarded: Guarded): guarded is { response: NextResponse } {
  return 'response' in guarded;
}

/** Lê o corpo JSON sem deixar um payload malformado virar exceção não tratada. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
