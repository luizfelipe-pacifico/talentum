import type { MetadataRoute } from 'next';
import { SITE_URL } from '../site';

/* Servido em /sitemap.xml. Lista somente páginas públicas e indexáveis:
   `/downloads` exige sessão e as rotas `/api/*` são do BFF, então ficam de fora. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
