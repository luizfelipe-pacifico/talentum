import { fail, ok, requireActionCode } from '@/server/http';
import { NEWS_ID, summarizeNews } from '@/server/cloud-news';

/* Resumo sob demanda de uma notícia pública (Etapa 16).

   O Worker resume somente o texto público da notícia; este backend envia o
   identificador da notícia e nada mais. O corpo da requisição é ignorado de
   propósito: não existe campo pelo qual um dado local chegue ao resumo. */

type Context = { params: Promise<{ newsId: string }> };

export async function POST(request: Request, context: Context) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  const { newsId } = await context.params;
  if (!NEWS_ID.test(newsId)) return fail('NEWS_NOT_FOUND', 'A notícia não foi encontrada.', 404);

  const result = await summarizeNews(newsId);
  if (result.status === 'not_found') return fail('NEWS_NOT_FOUND', 'A notícia não foi encontrada.', 404);
  return ok(result);
}
