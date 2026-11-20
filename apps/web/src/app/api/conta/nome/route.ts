import { backTo, forwardForm } from '../../../../server/community-bff';
import { LIMITS } from '../../../../server/community-forms';
import { bffError, formText, readForm } from '../../../../server/http';
import { sameOrigin } from '../../../../server/site-url';

/* Altera o nome público (PATCH /api/me no Worker). O Worker normaliza e valida
   de novo; aqui só se evita uma ida inútil com texto fora do tamanho. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const publicName = formText(await readForm(request), 'nome')?.trim() ?? '';
  if (publicName.length < LIMITS.publicName.min || publicName.length > LIMITS.publicName.max) {
    return backTo(request, '/conta', 'nome-invalido');
  }
  const result = await forwardForm('/api/me', 'PATCH', { publicName });
  return backTo(request, '/conta', result.ok ? 'nome' : result.notice);
}
