/* Cliente do protocolo de código de ação.

   Toda chamada funcional do frontend pede antes um código opaco de uso único e
   o envia em `X-Action-Code`. A rota que emite o código é a única exceção
   (docs/API.md e docs/SECURITY.md).

   O protocolo mora aqui para que nenhuma tela o reimplemente pela metade. */

export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

export async function getWithActionCode<T>(path: string, signal?: AbortSignal): Promise<T> {
  const codeResponse = await fetch('/api/action-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'GET', path }),
    cache: 'no-store',
    signal,
  });
  if (!codeResponse.ok) throw new ApiError('ACTION_CODE_FAILED');

  const { actionCode } = (await codeResponse.json()) as { actionCode?: string };
  if (!actionCode) throw new ApiError('ACTION_CODE_MISSING');

  const response = await fetch(path, {
    headers: { 'X-Action-Code': actionCode },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new ApiError('REQUEST_FAILED');

  return (await response.json()) as T;
}
