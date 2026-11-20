import { backTo, forwardForm } from '../../../../server/community-bff';
import { bffError, formText, readForm, redirectNoStore } from '../../../../server/http';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../../server/session';
import { sameOrigin, siteUrl } from '../../../../server/site-url';

/* Exclui a conta (DELETE /api/me). A confirmação digitada é conferida aqui e
   de novo no Worker. Só depois do sucesso os cookies saem: se a exclusão
   falhar, a pessoa continua dentro e vê o motivo. */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return bffError('FORBIDDEN', 403);
  const confirm = formText(await readForm(request), 'confirmacao')?.trim();
  if (confirm !== 'EXCLUIR') return backTo(request, '/conta', 'confirmacao', '#excluir');
  const result = await forwardForm('/api/me', 'DELETE', { confirm: 'EXCLUIR' });
  if (!result.ok) return backTo(request, '/conta', result.notice, '#excluir');
  const out = redirectNoStore(siteUrl('/entrar?conta=excluida', request));
  out.cookies.delete(ACCESS_COOKIE);
  out.cookies.delete(REFRESH_COOKIE);
  return out;
}
