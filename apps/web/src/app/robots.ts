import type { MetadataRoute } from 'next';
import { SITE_URL } from '../site';

/* Servido em /robots.txt. A página de downloads e o BFF não são conteúdo
   público: a primeira exige sessão e o segundo só responde ao próprio site. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/downloads'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
