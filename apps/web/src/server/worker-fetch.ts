/* Chamada ao Worker que nunca lança.

   Com o Worker fora do ar, `fetch` lança e as rotas do BFF respondiam 500 sem
   explicação. Aqui a falha de rede vira uma resposta 503 com código estável,
   que cada rota trata como "serviço indisponível". */

export async function fetchWorker(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch {
    return Response.json({ error: { code: 'WORKER_UNAVAILABLE' } }, { status: 503 });
  }
}

/** Endereço do Worker sem barra final, ou `null` quando não foi configurado. */
export function workerBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}
