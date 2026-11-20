import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Exclui o próprio comentário (ou, para moderação, qualquer um). */
export async function POST(request: Request, ctx: { params: Promise<{ commentId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { commentId } = await ctx.params;
  const postId = formText(await readForm(request), 'publicacao');
  const page = isOpaqueId(postId) ? `/comunidade/${postId}` : '/comunidade';
  if (!isOpaqueId(commentId)) return backTo(request, page, 'nao-encontrado');
  const result = await forwardForm(`/api/feedback/comments/${commentId}`, 'DELETE', null);
  return backTo(request, page, result.ok ? 'comentario-excluido' : result.notice, `#comentario-${commentId}`);
}
