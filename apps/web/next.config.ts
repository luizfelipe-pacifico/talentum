import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.TALENTUM_STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  /* O layout é dinâmico (lê o nonce da CSP), e o Next 15 então transmite os
     metadados no corpo para quem não está na sua lista de robôs. A LP é
     pública e indexável: título, descrição e canonical vão sempre no <head>. */
  htmlLimitedBots: /.*/,
  experimental: {
    /* Embute o CSS no HTML: a página é uma só, e as folhas externas bloqueavam
       a primeira pintura. A CSP já permite estilo inline. */
    inlineCss: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
