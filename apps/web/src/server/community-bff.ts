/* Chamadas da comunidade e da conta ao Worker, do lado do servidor da LP.

   As páginas leem por `readWorker`; as rotas de formulário escrevem por
   `forwardForm`. As duas passam por `cloud()`, que pede o código de ação e
   repassa o token de acesso do cookie: o navegador nunca fala com o Worker. */

import { cloud } from './cloudflare';
import { noticeForWorkerError, type NoticeKey } from './community-forms';
import { redirectNoStore, workerErrorCode } from './http';
import { safeReturn } from './return-to';
import { siteUrl } from './site-url';

/**
 * Volta à página do formulário com o aviso do resultado. Sessão vencida leva à
 * página Entrar, que retoma a sessão e devolve a pessoa à área de origem.
 * `path` é sempre um caminho fixo montado pela rota, nunca um valor do formulário.
 */
export function backTo(request: Request, path: string, notice: NoticeKey | null, anchor = ''): Response {
  if (notice === 'sessao') {
    const area = path.startsWith('/conta') ? '/conta' : '/comunidade';
    return redirectNoStore(siteUrl(`/entrar?retorno=${encodeURIComponent(safeReturn(area))}&erro=sessao`, request));
  }
  const separator = path.includes('?') ? '&' : '?';
  const query = notice ? `${separator}aviso=${notice}` : '';
  return redirectNoStore(siteUrl(`${path}${query}${anchor}`, request));
}

export type WorkerRead<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

/** GET ao Worker com a sessão, quando existe. Nunca lança. */
export async function readWorker<T>(path: string): Promise<WorkerRead<T>> {
  try {
    const response = await cloud(path, {}, true);
    if (!response.ok) return { ok: false, status: response.status, code: await workerErrorCode(response) };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 503, code: 'WORKER_UNAVAILABLE' };
  }
}

export type WorkerWrite = { ok: true; data: Record<string, unknown> } | { ok: false; notice: NoticeKey; status: number };

/**
 * Envia uma escrita ao Worker. A chave de idempotência, quando existe, vai no
 * cabeçalho `Idempotency-Key`: o mesmo formulário enviado duas vezes produz um
 * único efeito.
 */
export async function forwardForm(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: Record<string, unknown> | null,
  idempotencyKey?: string,
): Promise<WorkerWrite> {
  try {
    const response = await cloud(
      path,
      {
        method,
        body: JSON.stringify(body ?? {}),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      },
      true,
    );
    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: true, data };
    }
    return { ok: false, notice: noticeForWorkerError(await workerErrorCode(response), response.status), status: response.status };
  } catch {
    return { ok: false, notice: 'indisponivel', status: 503 };
  }
}
