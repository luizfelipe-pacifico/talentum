import type { Env } from '../env.ts';

/* Borda HTTP do Worker: cabeçalhos de segurança, formato único de erro e CORS
   com lista exata (docs/SECURITY.md, CORS). */

export type Obj = Record<string, unknown>;

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export const json = (body: Obj, status = 200) => Response.json(body, { status, headers: SECURITY_HEADERS });

export const fail = (code: string, status: number) =>
  json({ error: { code, message: 'A solicitação não pôde ser concluída.' } }, status);

/** Erro esperado de uma rota: vira `{error:{code}}` com o status indicado. */
export class HttpError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const deny = (code: string, status: number): never => {
  throw new HttpError(code, status);
};

/** Corpo JSON limitado a `maxBytes`; corpo ausente, inválido ou grande demais vira 400/413. */
export async function body<T = Obj>(r: Request, maxBytes = 16_384): Promise<T> {
  const length = Number(r.headers.get('Content-Length') ?? '0');
  if (length > maxBytes) deny('PAYLOAD_TOO_LARGE', 413);
  const text = await r.text().catch(() => '');
  if (text.length > maxBytes) deny('PAYLOAD_TOO_LARGE', 413);
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) deny('INVALID_BODY', 400);
    return parsed as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return deny('INVALID_BODY', 400);
  }
}

/* CORS. O Worker é chamado servidor a servidor (BFF e backend local), que não
   enviam Origin. Um navegador sempre envia: só a origem exata de ALLOWED_ORIGIN
   passa, sem credenciais, e o cabeçalho do BFF nunca é permitido — então nem
   essa origem consegue chamar uma rota do BFF pelo navegador. */
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';
const ALLOWED_HEADERS = 'Content-Type, X-Action-Code';

export function allowedOrigin(e: Env): string | null {
  try {
    return new URL(e.ALLOWED_ORIGIN).origin;
  } catch {
    return null;
  }
}

/** Resposta ao preflight, ou `null` quando a requisição não é OPTIONS. */
export function preflight(r: Request, e: Env): Response | null {
  if (r.method !== 'OPTIONS') return null;
  const origin = r.headers.get('Origin');
  const allowed = allowedOrigin(e);
  if (!origin || !allowed || origin !== allowed) return fail('ORIGIN_NOT_ALLOWED', 403);
  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS,
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

/** Origem estrangeira em requisição comum é recusada antes de qualquer trabalho. */
export function foreignOrigin(r: Request, e: Env): boolean {
  const origin = r.headers.get('Origin');
  return origin !== null && origin !== allowedOrigin(e);
}

export function withCors(r: Request, e: Env, response: Response): Response {
  const origin = r.headers.get('Origin');
  const allowed = allowedOrigin(e);
  if (!origin || origin !== allowed) return response;
  const out = new Response(response.body, response);
  out.headers.set('Access-Control-Allow-Origin', allowed);
  out.headers.append('Vary', 'Origin');
  return out;
}
