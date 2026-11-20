import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Apoia ou retira o apoio a uma sugestão. PUT e DELETE são idempotentes no
   Worker: repetir o envio não duplica o voto. */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { postId } = await ctx.params;
  if (!isOpaqueId(postId)) return backTo(request, '/comunidade', 'nao-encontrado');
  const remove = formText(await readForm(request), 'acao') === 'remover';
  const result = await forwardForm(`/api/feedback/posts/${postId}/vote`, remove ? 'DELETE' : 'PUT', null);
  return backTo(request, `/comunidade/${postId}`, result.ok ? null : result.notice, '#apoio');
}
