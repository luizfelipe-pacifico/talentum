import { backTo, forwardForm } from '../../../../../server/community-bff';
import { normalizeTotpCode } from '../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../server/http';
import { sameOrigin } from '../../../../../server/site-url';

/* Gera novos códigos de recuperação (os anteriores deixam de valer). Exige um
   código atual do app; os novos aparecem uma vez em /conta/mfa/codigos. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const code = normalizeTotpCode(formText(await readForm(request), 'code'));
  if (!code) return backTo(request, '/conta', 'codigo-invalido', '#verificacao');
  const result = await forwardForm('/api/me/mfa/recovery-codes', 'POST', { code });
  if (!result.ok) return backTo(request, '/conta', result.notice, '#verificacao');
  return backTo(request, '/conta/mfa/codigos', 'codigos-novos');
}
