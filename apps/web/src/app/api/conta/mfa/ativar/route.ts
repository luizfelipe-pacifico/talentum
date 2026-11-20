import { backTo, forwardForm } from '../../../../../server/community-bff';
import { normalizeTotpCode } from '../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../server/http';
import { sameOrigin } from '../../../../../server/site-url';

/* Confirma o app autenticador com o primeiro código. Ativada, a verificação
   gera os códigos de recuperação, mostrados uma única vez em /conta/mfa/codigos. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const code = normalizeTotpCode(formText(await readForm(request), 'code'));
  if (!code) return backTo(request, '/conta/mfa', 'codigo-invalido');
  const result = await forwardForm('/api/me/mfa/totp/activate', 'POST', { code });
  if (!result.ok) {
    return backTo(request, result.notice === 'mfa-expirada' ? '/conta' : '/conta/mfa', result.notice);
  }
  return backTo(request, '/conta/mfa/codigos', 'mfa-ativa');
}
