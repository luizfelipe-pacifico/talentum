/* Content-Security-Policy do app local e do renderer do Electron.

   O app é servido só no loopback e não carrega nada de fora: script, estilo,
   fonte e imagem vêm da própria origem. O script exige o nonce da requisição
   (`'strict-dynamic'` estende a confiança aos pedaços que o Next carrega a
   partir dele), e nenhum `'unsafe-inline'` vale para script. Estilo inline
   continua permitido porque a interface usa `style={{…}}` do React, que não
   executa código.

   Em desenvolvimento, o React avalia código com `eval` para os stack traces e o
   recarregamento do Next usa WebSocket; só ali entram `'unsafe-eval'` e `ws:`.
   Mesma decisão da landing page (apps/web/src/middleware.ts). Puro, para o teste
   do Node importar direto. */

export function localContentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws:' : ''}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
  ].join('; ');
}
