import type { MetadataRoute } from 'next';
import { SITE_URL } from '../site';

/* Servido em /robots.txt. Downloads, conta, entrada (com a etapa de
   verificação), nova sugestão e moderação exigem sessão; o BFF só responde ao
   próprio site. Nenhum deles é conteúdo público. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/downloads', '/conta', '/entrar', '/comunidade/nova', '/comunidade/moderacao'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
