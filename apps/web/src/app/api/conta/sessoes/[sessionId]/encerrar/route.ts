import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId } from '../../../../../../server/community-forms';
import { bffError } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Encerra outra sessão da mesma conta. O Worker só aceita sessões da pessoa
   autenticada; o ID da URL nunca é autorização. */
export async function POST(request: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { sessionId } = await ctx.params;
  if (!isOpaqueId(sessionId)) return backTo(request, '/conta', 'nao-encontrado');
  const result = await forwardForm(`/api/me/sessions/${sessionId}`, 'DELETE', null);
  return backTo(request, '/conta', result.ok ? 'sessao-encerrada' : result.notice, '#sessoes');
}
