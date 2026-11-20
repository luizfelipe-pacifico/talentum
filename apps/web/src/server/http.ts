/* Respostas do BFF.

   Toda resposta das rotas do BFF é privada: carrega cookies de sessão, decide
   redirecionamentos a partir deles ou repassa erro do Worker. Nenhuma pode ficar
   em cache de navegador ou de proxy (docs/SECURITY.md, Open items, item 7). */

import { NextResponse } from 'next/server';

export const NO_STORE = 'no-store';

/** Marca a resposta como privada e sem cache. */
export function noStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', NO_STORE);
  return response;
}

/** JSON sem cache. */
export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return noStore(NextResponse.json(body as Record<string, unknown>, { status }));
}

/** Erro do BFF no formato `{error:{code}}`, sempre sem cache e sem detalhe interno. */
export function bffError(code: string, status: number): NextResponse {
  return jsonNoStore({ error: { code } }, status);
}

/** Redirecionamento sem cache. 303 transforma o POST de formulário em GET. */
export function redirectNoStore(url: URL | string, status = 303): NextResponse {
  return noStore(NextResponse.redirect(url, status));
}

/** Lê o formulário sem deixar um corpo inválido virar exceção. */
export async function readForm(request: Request): Promise<FormData | null> {
  return request.formData().catch(() => null);
}

/** Campo de texto do formulário, ou `null` quando ausente ou não textual. */
export function formText(form: FormData | null, name: string): string | null {
  const value = form?.get(name);
  return typeof value === 'string' ? value : null;
}

/** Código de erro estável devolvido pelo Worker, ou `null`. */
export async function workerErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === 'string' ? body.error.code : null;
  } catch {
    return null;
  }
}
