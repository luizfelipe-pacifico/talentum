import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId } from '../../../../../../server/community-forms';
import { bffError } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Exclui a própria sugestão (ou, para moderação, qualquer uma). O Worker
   decide quem pode e guarda um marcador no lugar do texto. */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { postId } = await ctx.params;
  if (!isOpaqueId(postId)) return backTo(request, '/comunidade', 'nao-encontrado');
  const result = await forwardForm(`/api/feedback/posts/${postId}`, 'DELETE', null);
  return result.ok ? backTo(request, '/comunidade', 'excluida') : backTo(request, `/comunidade/${postId}`, result.notice);
}
