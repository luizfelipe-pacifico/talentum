import { backTo, forwardForm } from '../../../../../../server/community-bff';
import { isIdempotencyKey, isOpaqueId, LIMITS } from '../../../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../../../server/http';
import { sameOrigin } from '../../../../../../server/site-url';
import { TURNSTILE_FIELD } from '../../../../../../server/turnstile';

/* Comenta uma sugestão ou responde a um comentário (um nível de resposta). */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const { postId } = await ctx.params;
  if (!isOpaqueId(postId)) return backTo(request, '/comunidade', 'nao-encontrado');
  const page = `/comunidade/${postId}`;
  const form = await readForm(request);
  const body = formText(form, 'texto')?.trim() ?? '';
  const parent = formText(form, 'resposta');
  const key = formText(form, 'chave');
  if (!isIdempotencyKey(key)) return backTo(request, page, 'repetido');
  if (parent && !isOpaqueId(parent)) return backTo(request, page, 'nao-encontrado');
  if (body.length < LIMITS.comment.min || body.length > LIMITS.comment.max) return backTo(request, page, 'texto', '#comentar');
  const result = await forwardForm(
    `/api/feedback/posts/${postId}/comments`,
    'POST',
    { body, ...(parent ? { parentCommentId: parent } : {}), turnstileToken: formText(form, TURNSTILE_FIELD) ?? '' },
    key,
  );
  if (!result.ok) return backTo(request, page, result.notice, '#comentar');
  const comment = result.data.comment as { id?: unknown } | undefined;
  return backTo(request, page, 'comentada', isOpaqueId(comment?.id) ? `#comentario-${comment.id}` : '#comentarios');
}
