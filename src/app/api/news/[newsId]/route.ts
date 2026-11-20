import { fail, ok, requireActionCode } from '@/server/http';
import { getNewsItem, NEWS_ID } from '@/server/cloud-news';

/* Uma notícia pública. O identificador é opaco e validado antes de sair do
   computador: nada fora do formato vira caminho de requisição ao Worker. */

type Context = { params: Promise<{ newsId: string }> };

export async function GET(request: Request, context: Context) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  const { newsId } = await context.params;
  if (!NEWS_ID.test(newsId)) return fail('NEWS_NOT_FOUND', 'A notícia não foi encontrada.', 404);

  const result = await getNewsItem(newsId);
  if (result.status === 'not_found') return fail('NEWS_NOT_FOUND', 'A notícia não foi encontrada.', 404);
  return ok(result);
}
