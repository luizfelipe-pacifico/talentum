/* Cliente do protocolo de código de ação.

   Toda chamada funcional do frontend pede antes um código opaco de uso único e
   o envia em `X-Action-Code`. A rota que emite o código é a única exceção
   (docs/ARCHITECTURE.md e docs/SECURITY.md).

   O protocolo mora aqui para que nenhuma tela o reimplemente pela metade. */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly code: string;
  /** Mensagem já redigida pelo backend, segura para exibir. */
  readonly publicMessage?: string;
  readonly status?: number;
  /** Segundos de espera informados pelo backend (atraso entre tentativas de desbloqueio). */
  readonly retryAfterSeconds?: number;

  constructor(code: string, publicMessage?: string, status?: number, retryAfterSeconds?: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Rota à qual o código de ação é vinculado.
 *
 * A vinculação usa o caminho, sem a query: o código identifica o **contrato**
 * (`GET /api/transactions`), não os valores do filtro. Fosse o contrário, cada
 * combinação de filtro precisaria de um código próprio e o backend — que só
 * conhece o `pathname` da requisição — nunca conseguiria casar os dois.
 *
 * Isso não afrouxa nada: o código é proteção contra repetição, e não
 * autorização. Filtro, propriedade e escopo por perfil continuam validados no
 * backend a cada requisição (docs/ARCHITECTURE.md e docs/SECURITY.md).
 */
export function actionCodePath(path: string): string {
  const separator = path.indexOf('?');
  return separator === -1 ? path : path.slice(0, separator);
}

/**
 * Obtém um código de ação para o par método/rota pretendido.
 *
 * O código é vinculado ao contrato: um código emitido para `GET /api/dashboard`
 * não serve para `POST /api/imports`.
 */
async function issueActionCode(method: HttpMethod, path: string, signal?: AbortSignal): Promise<string> {
  const bootstrapSecret = typeof window !== 'undefined' ? await window.talentumWindow?.bootstrapSecret?.() : null;
  const response = await fetch('/api/action-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bootstrapSecret ? { 'X-Talentum-Bootstrap': bootstrapSecret } : {}) },
    body: JSON.stringify({ method, path: actionCodePath(path) }),
    cache: 'no-store',
    signal,
  });
  if (response.status === 401) {
    // Sem sessão local: o cofre está bloqueado. A tela de bloqueio assume (src/components/vault-gate.tsx).
    announceVaultLocked();
    throw new ApiError('VAULT_LOCKED', 'O Talentum está bloqueado. Desbloqueie para continuar.', 401);
  }
  if (!response.ok) throw new ApiError('ACTION_CODE_FAILED');

  const { actionCode } = (await response.json()) as { actionCode?: string };
  if (!actionCode) throw new ApiError('ACTION_CODE_MISSING');
  return actionCode;
}

/** Evento que a tela de bloqueio escuta: qualquer chamada que descubra o cofre fechado o dispara. */
export const VAULT_LOCKED_EVENT = 'talentum:vault-locked';

function announceVaultLocked() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VAULT_LOCKED_EVENT));
}

/** Extrai o erro no formato de `docs/ARCHITECTURE.md`, sem inventar mensagem. */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; retryAfterSeconds?: number } };
    return new ApiError(body.error?.code ?? 'REQUEST_FAILED', body.error?.message, response.status, body.error?.retryAfterSeconds);
  } catch {
    return new ApiError('REQUEST_FAILED', undefined, response.status);
  }
}

export type RequestOptions = {
  /** Corpo JSON. Excludente com `form`. */
  json?: unknown;
  /** Corpo multipart, usado no upload de extrato. Excludente com `json`. */
  form?: FormData;
  signal?: AbortSignal;
};

/** Chamada funcional completa: emite o código, consome e devolve o JSON. */
export async function callApi<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const actionCode = await issueActionCode(method, path, options.signal);

  const headers: Record<string, string> = { 'X-Action-Code': actionCode };
  let body: BodyInit | undefined;

  if (options.form) {
    // O `Content-Type` do multipart traz o boundary e é definido pelo navegador.
    body = options.form;
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  const response = await fetch(path, { method, headers, body, cache: 'no-store', signal: options.signal });
  if (!response.ok) {
    const error = await toApiError(response);
    if (error.code === 'VAULT_LOCKED') announceVaultLocked();
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return callApi<T>('GET', path, { signal });
}

export function postJson<T>(path: string, json: unknown, signal?: AbortSignal): Promise<T> {
  return callApi<T>('POST', path, { json, signal });
}

export function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  return callApi<T>('POST', path, { form, signal });
}

export function patchJson<T>(path: string, json: unknown, signal?: AbortSignal): Promise<T> {
  return callApi<T>('PATCH', path, { json, signal });
}

export function deleteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return callApi<T>('DELETE', path, { signal });
}

/** Mantido para as telas que já usavam o cliente somente-leitura. */
export const getWithActionCode = getJson;

/**
 * Chamada cuja resposta é um arquivo (exportação, backup cifrado). Segue o
 * mesmo protocolo de código de ação; o nome vem do `Content-Disposition`
 * montado pelo backend.
 */
export async function callApiFile(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<{ blob: Blob; fileName: string }> {
  const actionCode = await issueActionCode(method, path, options.signal);
  const headers: Record<string, string> = { 'X-Action-Code': actionCode };
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { method, headers, body, cache: 'no-store', signal: options.signal });
  if (!response.ok) throw await toApiError(response);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([a-z0-9][a-z0-9.-]{0,80})"/.exec(disposition)?.[1] ?? 'talentum-arquivo';
  return { blob: await response.blob(), fileName };
}

/** Entrega o arquivo ao navegador como download, sem abrir nova janela. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
