/* Teto do corpo das requisições da API local (docs/SECURITY.md, itens 16 e 23).

   Com o middleware ativo em `/api`, o Next copia o corpo para entregá-lo ao
   middleware e só chama a rota depois de receber o corpo inteiro. Conferir o
   tamanho dentro da rota chegaria tarde: o upload já estaria na memória. A
   decisão fica aqui, pura, e o middleware a aplica pelo `Content-Length`
   declarado, antes de qualquer byte do corpo ser lido.

   - extrato (`/api/imports` e `/api/imports/inspect`): o teto do arquivo mais o
     envelope multipart, e o tamanho precisa ser declarado;
   - restauração de backup cifrado (`/api/encrypted-backups/restore`): o teto
     do backup (200 MB) mais o envelope multipart, com tamanho declarado;
   - qualquer outra rota: 1 MiB de JSON, folga grande para os formulários. */

import { MAX_BACKUP_BYTES } from './backup/limits.ts';
import { MAX_UPLOAD_BYTES } from './import/limits.ts';

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MULTIPART_OVERHEAD = 64 * 1024;

/** Rotas de upload: teto próprio e `Content-Length` obrigatório. */
const UPLOAD_ROUTES = new Map<string, number>([
  ['/api/imports', MAX_UPLOAD_BYTES],
  ['/api/imports/inspect', MAX_UPLOAD_BYTES],
  ['/api/encrypted-backups/restore', MAX_BACKUP_BYTES + MULTIPART_OVERHEAD],
]);

export type BodyVerdict = { ok: true } | { ok: false; status: 411 | 413; code: 'LENGTH_REQUIRED' | 'BODY_TOO_LARGE' };

export function bodyVerdict(method: string, pathname: string, contentLength: string | null): BodyVerdict {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { ok: true };
  const upload = UPLOAD_ROUTES.get(pathname);
  if (contentLength === null) return upload ? { ok: false, status: 411, code: 'LENGTH_REQUIRED' } : { ok: true };
  if (!/^\d{1,15}$/.test(contentLength)) return { ok: false, status: 411, code: 'LENGTH_REQUIRED' };
  const limit = upload ?? MAX_JSON_BODY_BYTES;
  return Number(contentLength) > limit ? { ok: false, status: 413, code: 'BODY_TOO_LARGE' } : { ok: true };
}
