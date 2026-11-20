import type { MetadataRoute } from 'next';
import { SITE_URL } from '../site';

/* Servido em /sitemap.xml. Lista somente páginas públicas e indexáveis:
   `/downloads`, `/conta`, `/entrar`, `/comunidade/nova` e `/comunidade/moderacao`
   exigem sessão ou não têm conteúdo próprio, e as rotas `/api/*` são do BFF,
   então ficam de fora. Sugestões individuais entram pelos links da lista. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
    { url: `${SITE_URL}/comunidade`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/termos`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
