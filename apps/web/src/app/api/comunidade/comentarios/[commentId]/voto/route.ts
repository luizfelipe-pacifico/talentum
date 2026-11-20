import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Apoia ou retira o apoio a um comentário. `publicacao` só decide para onde
   voltar; validado como ID, nunca vira caminho do Worker. */
export async function POST(request: Request, ctx: { params: Promise<{ commentId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { commentId } = await ctx.params;
  const form = await readForm(request);
  const postId = formText(form, 'publicacao');
  const page = isOpaqueId(postId) ? `/comunidade/${postId}` : '/comunidade';
  if (!isOpaqueId(commentId)) return backTo(request, page, 'nao-encontrado');
  const remove = formText(form, 'acao') === 'remover';
  const result = await forwardForm(`/api/feedback/comments/${commentId}/vote`, remove ? 'DELETE' : 'PUT', null);
  return backTo(request, page, result.ok ? null : result.notice, `#comentario-${commentId}`);
}
