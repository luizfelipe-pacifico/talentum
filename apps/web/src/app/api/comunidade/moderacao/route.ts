import { backTo, forwardForm } from '../../../../server/community-bff';
import { isIdempotencyKey, isModerationAction, isOpaqueId, LIMITS } from '../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../server/http';
import { sameOrigin } from '../../../../server/site-url';

/* Decisão de moderação. A permissão é do Worker (papel de moderação na conta);
   esta rota só valida a forma do pedido e escolhe a página de volta. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const form = await readForm(request);
  const action = formText(form, 'acao');
  const postId = formText(form, 'publicacao');
  const commentId = formText(form, 'comentario');
  const reportId = formText(form, 'denuncia');
  const key = formText(form, 'chave');
  const page = formText(form, 'voltar') === 'fila' || !isOpaqueId(postId) ? '/comunidade/moderacao' : `/comunidade/${postId}`;
  if (!isModerationAction(action) || !isIdempotencyKey(key)) return backTo(request, page, 'erro');
  for (const id of [postId, commentId, reportId]) if (id && !isOpaqueId(id)) return backTo(request, page, 'nao-encontrado');
  const reason = formText(form, 'motivo')?.trim() ?? '';
  if (reason.length < LIMITS.reason.min || reason.length > LIMITS.reason.max) return backTo(request, page, 'motivo');
  // O alvo mais específico decide: comentário, senão publicação; a denúncia acompanha para ser resolvida.
  const target = commentId ? { commentId } : postId ? { postId } : {};
  const result = await forwardForm('/api/feedback/moderation/actions', 'POST', { action, ...target, ...(reportId ? { reportId } : {}), reason }, key);
  return backTo(request, page, result.ok ? 'moderada' : result.notice);
}
