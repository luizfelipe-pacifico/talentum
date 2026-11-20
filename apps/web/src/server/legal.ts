/* Versões vigentes dos documentos aceitos no cadastro.

   O Worker só registra aceite destas mesmas versões (`LEGAL_VERSIONS` em
   `cloudflare/src/env.ts`); `tests/regression/cloud-consent.test.mjs` garante
   que as duas listas não divergem. Mudou o texto de /termos ou /privacidade de
   forma relevante: mude a versão nos dois lugares. */
export const LEGAL_VERSIONS = { terms: '2026-11-20', privacy: '2026-11-20' } as const;
