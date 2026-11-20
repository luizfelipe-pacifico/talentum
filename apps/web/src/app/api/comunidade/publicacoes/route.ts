import { backTo, forwardForm } from '../../../../server/community-bff';
import { isIdempotencyKey, isOpaqueId, LIMITS } from '../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../server/http';
import { sameOrigin } from '../../../../server/site-url';
import { TURNSTILE_FIELD } from '../../../../server/turnstile';

/* Publica uma sugestão. A chave de idempotência nasce com o formulário: dois
   envios do mesmo formulário criam uma única sugestão. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const form = await readForm(request);
  const title = formText(form, 'titulo')?.trim() ?? '';
  const body = formText(form, 'texto')?.trim() ?? '';
  const key = formText(form, 'chave');
  if (!isIdempotencyKey(key)) return backTo(request, '/comunidade/nova', 'repetido');
  if (title.length < LIMITS.title.min || title.length > LIMITS.title.max) return backTo(request, '/comunidade/nova', 'titulo');
  if (body.length < LIMITS.body.min || body.length > LIMITS.body.max) return backTo(request, '/comunidade/nova', 'texto');
  const result = await forwardForm('/api/feedback/posts', 'POST', { title, body, turnstileToken: formText(form, TURNSTILE_FIELD) ?? '' }, key);
  if (!result.ok) return backTo(request, '/comunidade/nova', result.notice);
  const post = result.data.post as { id?: unknown } | undefined;
  return isOpaqueId(post?.id) ? backTo(request, `/comunidade/${post.id}`, 'publicada') : backTo(request, '/comunidade', 'publicada');
}
