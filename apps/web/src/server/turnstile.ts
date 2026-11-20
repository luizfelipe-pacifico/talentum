/* Configuração pública do Cloudflare Turnstile na LP.

   A chave de site é pública por definição (vai no HTML), mas é lida no servidor,
   sem prefixo NEXT_PUBLIC_: nenhuma variável de ambiente entra no bundle do
   navegador. Sem ela o widget não aparece e o Worker, em produção, recusa o
   login e as publicações (docs/SECURITY.md, Turnstile). */

/** Nome do campo que o widget grava no formulário que o contém. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export function turnstileSiteKey(value: string | undefined = process.env.TURNSTILE_SITE_KEY): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
