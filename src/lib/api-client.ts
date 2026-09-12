/* Cliente do protocolo de código de ação.

   Toda chamada funcional do frontend pede antes um código opaco de uso único e
   o envia em `X-Action-Code`. A rota que emite o código é a única exceção
   (docs/API.md e docs/SECURITY.md).

   O protocolo mora aqui para que nenhuma tela o reimplemente pela metade. */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly code: string;
  /** Mensagem já redigida pelo backend, segura para exibir. */
  readonly publicMessage?: string;
  readonly status?: number;

  constructor(code: string, publicMessage?: string, status?: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
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
 * backend a cada requisição (docs/API.md e docs/SECURITY.md).
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
  const response = await fetch('/api/action-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path: actionCodePath(path) }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new ApiError('ACTION_CODE_FAILED');

  const { actionCode } = (await response.json()) as { actionCode?: string };
  if (!actionCode) throw new ApiError('ACTION_CODE_MISSING');
  return actionCode;
}

/** Extrai o erro no formato de `docs/API.md`, sem inventar mensagem. */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(body.error?.code ?? 'REQUEST_FAILED', body.error?.message, response.status);
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
  if (!response.ok) throw await toApiError(response);

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

export function deleteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return callApi<T>('DELETE', path, { signal });
}

/** Mantido para as telas que já usavam o cliente somente-leitura. */
export const getWithActionCode = getJson;
