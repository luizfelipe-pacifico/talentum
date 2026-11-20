import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId, LIMITS } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Edita o próprio comentário. A autoria é conferida pelo Worker. */
export async function POST(request: Request, ctx: { params: Promise<{ commentId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { commentId } = await ctx.params;
  const form = await readForm(request);
  const postId = formText(form, 'publicacao');
  const page = isOpaqueId(postId) ? `/comunidade/${postId}` : '/comunidade';
  if (!isOpaqueId(commentId)) return backTo(request, page, 'nao-encontrado');
  const body = formText(form, 'texto')?.trim() ?? '';
  if (body.length < LIMITS.comment.min || body.length > LIMITS.comment.max) return backTo(request, page, 'texto');
  const result = await forwardForm(`/api/feedback/comments/${commentId}`, 'PATCH', { body });
  return backTo(request, page, result.ok ? 'editada' : result.notice, `#comentario-${commentId}`);
}
