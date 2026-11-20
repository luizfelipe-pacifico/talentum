import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isOpaqueId, LIMITS } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';

/* Edita a própria sugestão. A autoria é conferida pelo Worker pela sessão. */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { postId } = await ctx.params;
  if (!isOpaqueId(postId)) return backTo(request, '/comunidade', 'nao-encontrado');
  const form = await readForm(request);
  const title = formText(form, 'titulo')?.trim() ?? '';
  const body = formText(form, 'texto')?.trim() ?? '';
  const page = `/comunidade/${postId}`;
  if (title.length < LIMITS.title.min || title.length > LIMITS.title.max) return backTo(request, page, 'titulo');
  if (body.length < LIMITS.body.min || body.length > LIMITS.body.max) return backTo(request, page, 'texto');
  const result = await forwardForm(`/api/feedback/posts/${postId}`, 'PATCH', { title, body });
  return backTo(request, page, result.ok ? 'editada' : result.notice);
}
