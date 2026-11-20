import { backTo, forwardForm } from '../../../../../server/community-bff';
import { normalizeRecoveryCode, normalizeTotpCode } from '../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../server/http';
import { sameOrigin } from '../../../../../server/site-url';

/* Desativa a verificação em duas etapas. Exige um código atual do app ou um
   código de recuperação: uma sessão roubada sozinha não basta. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const raw = formText(await readForm(request), 'code');
  const code = normalizeTotpCode(raw) ?? normalizeRecoveryCode(raw);
  if (!code) return backTo(request, '/conta', 'codigo-invalido', '#verificacao');
  const result = await forwardForm('/api/me/mfa/totp/disable', 'POST', { code });
  return backTo(request, '/conta', result.ok ? 'mfa-desativada' : result.notice, '#verificacao');
}
