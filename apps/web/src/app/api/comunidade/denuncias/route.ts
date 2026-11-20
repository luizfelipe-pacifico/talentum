import { backTo, forwardForm } from '../../../../server/community-bff';
import { isIdempotencyKey, isOpaqueId, LIMITS } from '../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../server/http';
import { sameOrigin } from '../../../../server/site-url';
import { TURNSTILE_FIELD } from '../../../../server/turnstile';

/* Denuncia uma sugestão ou um comentário. Uma segunda denúncia da mesma pessoa
   sobre o mesmo conteúdo não cria outra (o Worker devolve a existente). */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const form = await readForm(request);
  const postId = formText(form, 'publicacao');
  const commentId = formText(form, 'comentario');
  const key = formText(form, 'chave');
  if (!isOpaqueId(postId)) return backTo(request, '/comunidade', 'nao-encontrado');
  const page = `/comunidade/${postId}`;
  if (commentId && !isOpaqueId(commentId)) return backTo(request, page, 'nao-encontrado');
  if (!isIdempotencyKey(key)) return backTo(request, page, 'repetido');
  const reason = formText(form, 'motivo')?.trim() ?? '';
  if (reason.length < LIMITS.reason.min || reason.length > LIMITS.reason.max) return backTo(request, page, 'motivo');
  const target = commentId ? { commentId } : { postId };
  const result = await forwardForm('/api/feedback/reports', 'POST', { ...target, reason, turnstileToken: formText(form, TURNSTILE_FIELD) ?? '' }, key);
  return backTo(request, page, result.ok ? 'denunciada' : result.notice);
}
