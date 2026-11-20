import { backTo, forwardForm } from '../../../../../server/community-bff';
import { bffError } from '../../../../../server/http';
import { sameOrigin } from '../../../../../server/site-url';

/* Começa a ativação do app autenticador: o Worker cria um segredo pendente e a
   página /conta/mfa o mostra como QR Code. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const result = await forwardForm('/api/me/mfa/totp/enroll', 'POST', {});
  if (!result.ok) return backTo(request, '/conta', result.notice, '#verificacao');
  return backTo(request, '/conta/mfa', null);
}
