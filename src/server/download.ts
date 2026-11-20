/* Resposta de download da API local.

   Arquivo gerado no servidor e entregue como anexo: sem cache, sem
   interpretação pelo navegador (`nosniff`) e com nome montado aqui, nunca
   vindo da requisição. */

const SAFE_NAME = /^[a-z0-9][a-z0-9.-]{0,80}$/;

export function download(body: string | Uint8Array, fileName: string, contentType: string) {
  if (!SAFE_NAME.test(fileName)) throw new Error('UNSAFE_FILE_NAME');
  const payload = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return new Response(payload as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(payload.byteLength),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
