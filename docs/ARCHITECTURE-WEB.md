# Arquitetura web

## Escopo

A web entrega a landing page pública, autentica/cadastra o usuário e, após validação no backend, libera downloads para Windows e Linux. Usuários autenticados também participam da comunidade pública de feedback.

## Fluxo de cadastro e download

```mermaid
sequenceDiagram
    actor U as Usuário
    participant F as Frontend
    participant B as Backend Cloudflare
    participant O as OAuth/OIDC
    participant D as D1
    participant R as GitHub Releases
    U->>F: acessa LP
    F->>B: inicia cadastro/login
    B->>O: Authorization Code + PKCE
    O-->>B: callback
    B->>B: valida state, nonce, PKCE e identidade
    B->>D: usuário e sessão relacionados por ID
    B-->>F: cookie seguro
    F->>B: solicita downloads
    B->>D: autoriza usuário e release
    B->>R: gera link curto e assinado
    B-->>F: Windows e Linux
```

## Fluxo de feedback

```mermaid
flowchart LR
    UI[Aba Feedback] -->|HTTPS| API[Worker API]
    API --> AUTH[Autenticação e autorização]
    API --> LIMIT[Rate limit e antispam]
    API --> D1[(D1)]
    API --> MOD[Moderação e auditoria]
```

Todos podem ler conteúdo com estado `PUBLISHED`. Criar post, comentar, curtir e denunciar exige sessão. O backend aplica propriedade, moderação, limites e sanitização; o frontend nunca escreve no D1 diretamente.

## Componentes

- **Vercel (`talentum.vercel.app`):** somente código da LP, página de downloads e BFF mínimo de sessão; nenhum módulo financeiro ou código do aplicativo Electron.
- **Worker:** OAuth/OIDC, sessão, comunidade, rate limit, auditoria e emissão de downloads.
- **D1:** identidade mínima, sessões, feedback e metadados.
- **GitHub Releases:** instaladores assinados de Windows e Linux produzidos pelo pipeline de release.
- **Borda:** TLS, WAF, Turnstile e cabeçalhos de segurança.

Em desenvolvimento local, a LP possui imagem Docker própria e é publicada apenas em `127.0.0.1:3100`. Ela não reutiliza a imagem do app local nem inclui Prisma, SQLite, Electron ou domínio financeiro. A Content Security Policy usa nonce novo por resposta, propagado pelo middleware ao renderizador do Next.js, para permitir somente os scripts emitidos pela própria renderização sem liberar scripts inline indiscriminadamente.

## Indexação — atual

`apps/web/src/app/robots.ts` e `apps/web/src/app/sitemap.ts` são rotas de metadados do Next.js servidas em `/robots.txt` e `/sitemap.xml`. O sitemap lista somente a LP (`/`). O robots libera o site e bloqueia `/api/` (BFF) e `/downloads` (exige sessão), além de apontar o sitemap. O domínio anunciado vem de `apps/web/src/site.ts` e é `https://talentum-tech.vercel.app`, onde a LP está publicada. O teste `tests/web-seo.test.mjs` impede que rotas privadas entrem no sitemap.

O layout declara `robots` com `index` e `follow`, canonical, Open Graph e cartão do X a partir de `metadataBase`. Como o layout é dinâmico (lê o nonce da CSP), o Next 15 transmitiria os metadados no corpo da página para quem não estivesse na sua lista de robôs; `htmlLimitedBots: /.*/` em `apps/web/next.config.ts` mantém título, descrição e canonical sempre no `<head>`. O CSS da LP é embutido no HTML (`experimental.inlineCss`), o que a CSP já permite com `style-src 'unsafe-inline'`. Medições e decisões estão em `DESIGN-QA.md`.

## Implantação

> **Em aberto.** Em 25 de outubro de 2026, `https://talentum.vercel.app` respondia com o login de outro projeto, enquanto a LP estava em `https://talentum-tech.vercel.app`. Este documento, `CLOUDFLARE_SETUP.md` e `ALLOWED_ORIGIN`/`PUBLIC_WEB_URL` em `cloudflare/wrangler.jsonc` ainda citam o primeiro domínio. O redirect OAuth e a allowlist de origem dependem dessa decisão, então corrija os três no mesmo change set, junto com o cliente OAuth.

A interface web será publicada em `https://talentum.vercel.app`. O backend permanece em Cloudflare Workers; o D1 nunca é acessado diretamente pelo navegador.

Como `vercel.app` e `workers.dev` são sites diferentes, o navegador não deve depender de refresh cookie third-party. Um BFF mínimo na Vercel mantém o cookie first-party `Secure`, `HttpOnly` e encaminha chamadas autenticadas ao Worker. Esse BFF não possui regra financeira, banco próprio ou acesso a dados locais; ele existe apenas para sessão, código efêmero e proxy controlado.

O projeto Vercel recebe somente os arquivos necessários à LP/BFF. O shell Electron, backend local, Prisma, SQLite, parsers, módulos financeiros, testes desktop e arquivos internos de empacotamento são excluídos do contexto de deploy. Preferir projeto/repositório de deploy isolado ou artefato de origem allowlisted; não conectar a raiz completa do sistema à Vercel.

Os instaladores assinados de Windows e Linux são produzidos pelo pipeline e publicados em GitHub Releases. Após validar a sessão, o backend registra uma concessão curta no D1 e retorna o endereço do artefato. Como releases de um repositório open-source são públicos, a concessão controla a experiência da LP e a auditoria, mas não transforma o binário em conteúdo privado. A LP não contém nem executa o sistema desktop.

## Critérios de aceite

- `/downloads` não abre sem sessão válida;
- frontend não contém segredos nem token persistente acessível a JavaScript;
- manifesto do deploy comprova que nenhum arquivo do sistema desktop foi enviado à Vercel;
- concessões de download expiram e são auditadas; artefatos públicos mantêm checksum e assinatura;
- conteúdo público de feedback nunca revela e-mail, token, IP ou identificador OAuth;
- ações da comunidade são autorizadas e limitadas no backend;
- respostas privadas usam `Cache-Control: no-store`.
