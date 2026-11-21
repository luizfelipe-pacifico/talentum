import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.TALENTUM_STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  /* O rastreamento de arquivos do standalone seguia leituras dinâmicas de
     `prisma/` pela raiz inteira e copiava cópias de trabalho de agentes,
     pacotes antigos e dados de teste para o pacote. Nada disso é do app.
     tests/regression/packaged-app-cannot-open-database.test.mjs */
  outputFileTracingExcludes: {
    '*': ['.claude/**', 'release/**', 'temp/**', '.next-*/**', 'playwright-report/**', 'test-results/**', 'design/**'],
  },
  // O pdf.js roda como módulo do Node, sem passar pelo bundler: o worker local é
  // importado do pacote instalado e nada é baixado em tempo de execução (ADR 0006).
  serverExternalPackages: ['pdfjs-dist'],
  // The end-to-end server builds into its own directory so it never clashes with `pnpm dev`.
  distDir: process.env.TALENTUM_NEXT_DIST_DIR || '.next',
  /* A leitura de PDF roda num worker_thread (src/server/import/pdf/extract.ts).
     O webpack empacota `new Worker(new URL(...))` como chunk próprio em
     `server/chunks/`, mas monta o endereço com o publicPath do servidor
     (`/_next/`), que não é caminho de disco. `./` resolve o chunk ao lado dos
     demais, em `next dev`, `next build` e no pacote standalone do Electron. */
  webpack(config, { isServer, nextRuntime }) {
    if (isServer && nextRuntime === 'nodejs') config.output = { ...config.output, workerPublicPath: './' };
    return config;
  },
};

export default nextConfig;
