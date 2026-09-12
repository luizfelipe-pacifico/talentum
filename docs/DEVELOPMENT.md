# Desenvolvimento do Talentum

## Estado do repositório

O projeto está em pré-alpha. Já existe uma base Next.js full-stack, API REST local inicial, shell Electron, Prisma/SQLite, execução do servidor local por Docker e scaffold do Worker/D1. Os módulos financeiros e as rotas cloud de negócio ainda não foram implementados.

Painel, importação de extrato (CSV e OFX), listagem de lançamentos e cadastro de perfil, instituições e contas estão implementados sobre o SQLite local. As demais rotas sob `src/app/` continuam sendo telas de estado vazio à espera de implementação; `src/lib/demo-data.ts` guarda apenas configuração de navegação e rótulos, nunca dado financeiro.

## Requisitos

- Node.js 22.13 ou superior;
- pnpm 11.1.2;
- Git;
- Docker Desktop ou Docker Engine com Compose, para o fluxo em container;
- Windows ou Linux para os alvos iniciais.

## Instalação

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate
```

Não copie valores reais para `.env.example`. O arquivo `.env` local não deve ser versionado.

## Comandos existentes

| Comando | Comportamento atual |
| --- | --- |
| `pnpm dev` | libera a porta 3000, remove `.next` e inicia `next dev` |
| `pnpm dev:all` | inicia o servidor, aguarda a porta e abre o Electron |
| `pnpm docker:build` | constrói as imagens isoladas do app local e da LP |
| `pnpm docker:up` | constrói e inicia o app em `127.0.0.1:3000` e a LP em `127.0.0.1:3100` |
| `pnpm docker:up:detached` | inicia os dois serviços em segundo plano e aguarda os healthchecks |
| `pnpm docker:down` | encerra os containers sem apagar o volume SQLite |
| `pnpm build` | chama `next build` |
| `pnpm start` | executa a build pelo servidor Next.js na porta 3000 |
| `pnpm typecheck` | chama `tsc --noEmit` |
| `pnpm test` | roda a suíte com o executor nativo do Node |
| `pnpm prisma:generate` | chama `prisma generate` |
| `pnpm prisma:validate` | chama `prisma validate` |
| `pnpm prisma:migrate` | cria/aplica migrações locais de desenvolvimento |
| `pnpm cloudflare:dev` | inicia o Worker com o D1 local |
| `pnpm cloudflare:build` | valida e empacota o Worker sem publicar |
| `pnpm cloudflare:migrations:list:local` | lista migrations pendentes no D1 local |
| `pnpm cloudflare:migrations:apply:local` | aplica migrations no D1 local |
| `pnpm cloudflare:migrations:list:remote` | lista migrations pendentes no D1 remoto |
| `pnpm cloudflare:migrations:apply:remote` | aplica migrations revisadas no D1 remoto |
| `pnpm cloudflare:deploy` | publica o Worker autenticado |
| `pnpm cloudflare:test` | testa contratos, migration de runtime e isolamento da LP |
| `pnpm web:typecheck` | verifica os tipos da LP/BFF isolada |
| `pnpm web:build` | gera a build isolada destinada à Vercel |

`pnpm dev` e `pnpm dev:all` executam `prisma migrate deploy` antes de abrir o servidor. A URL local padrão aponta para `temp/talentum-local.db`, que é ignorado pelo Git. Crie migrations com `pnpm prisma:migrate --name <nome>`; não use `prisma db push` como fluxo do projeto.

No fluxo Docker atual, `talentum-local` contém o backend e a interface desktop local; `talentum-web` contém somente a LP/BFF de `apps/web`. A URL padrão do Worker vista pela LP em container é `http://host.docker.internal:8787` e pode ser substituída por `CLOUDFLARE_API_BASE_URL`. Valores locais de integração devem ficar em `.env` ignorado, nunca no Compose versionado.

O Electron roda no host e pode apontar tanto para `pnpm dev` quanto para o servidor iniciado pelo Compose. Ao iniciar, o container executa `prisma migrate deploy`, cria ou atualiza `/data/talentum-local.db` e só então sobe o servidor. O volume nomeado `talentum-data` preserva o SQLite entre recriações do container.

O SQLite local já possui `LocalProfile`, `UserPreference`, o núcleo financeiro, as obrigações e os detalhes de importação. O D1 possui migration própria para identidade mínima, sessão, releases e feedback. Consulte [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md) antes de criar ou aplicar migrations cloud.

A imagem usa Ubuntu 24.04, Node.js 22 copiado da imagem oficial, execução por usuário não-root e somente os pacotes de sistema necessários para TLS/Prisma. Electron não roda dentro da imagem.

## Dependências confirmadas no documento-fonte

- Next.js App Router, React, Tailwind CSS, Electron, Prisma/SQLite e PDF.js estão instalados.
- O genérico “Node-OFX” havia sido concretizado como `ofx-data-extractor`. Ao implementar a Feature 4, a biblioteca se mostrou inadequada: ela falha em OFX 1.x/SGML — o formato que os bancos brasileiros exportam — e normaliza dinheiro para `number`, o que `DATA_MODEL.md` proíbe. A dependência foi **removida** e substituída por um leitor próprio e limitado em `src/server/import/ofx.ts`. A decisão, com alternativas e consequências, está em [`decisions/0002-leitor-ofx-proprio.md`](./decisions/0002-leitor-ofx-proprio.md).
- AES-256-GCM usa `node:crypto`; não exige biblioteca adicional.
- Workers AI e Ollama são integrações HTTP futuras; não exigem SDK no scaffold.
- O empacotador de `.exe` e AppImage ainda depende de ADR e não foi escolhido antecipadamente.

`pnpm start` usa `next start` no host. A imagem Ubuntu usa diretamente a saída standalone, evitando incompatibilidades de symlink do pnpm no Windows.

## Fluxo de implementação

1. confirme o requisito na documentação de produto;
2. atualize ou crie a decisão técnica necessária;
3. implemente uma capacidade vertical pequena;
4. adicione testes proporcionais ao risco;
5. execute formatação, lint, tipos, testes e build disponíveis;
6. atualize a fonte de verdade afetada;
7. use Conventional Commits.

## Qualidade mínima

- regras financeiras com testes unitários de limites e arredondamento;
- persistência com testes de migração e rollback;
- importadores com fixtures sintéticas e testes de duplicidade;
- integrações externas simuladas em testes;
- fluxos críticos cobertos por integração antes da distribuição;
- nenhum teste depende de credencial ou serviço pessoal.

## Testes

`pnpm test` usa o executor embutido do Node (`node --test`), sem biblioteca adicional. Os arquivos ficam em `tests/` com extensão `.test.mjs`.
Os contratos do onboarding são verificados em `tests/onboarding-contracts.test.mjs`:
migration relacional, código de ação, escopo por perfil, concorrência otimista e
presença das quatro etapas.

As fórmulas financeiras vivem em `src/server/dashboard-metrics.ts`, um módulo puro sem Prisma e sem relógio implícito, e são testadas diretamente: o Node faz *type stripping* nativo e importa o `.ts` sem etapa de build. A flag `--experimental-strip-types` é passada explicitamente para manter compatibilidade a partir do Node 22.13; em Node 22.18 ou superior ela é dispensável.

Testes de contrato leem o próprio código-fonte e verificam invariantes que não podem regredir em silêncio: exigência de `X-Action-Code`, escopo por `profileId` em toda cláusula `where`, ausência de texto monetário formatado no backend, ausência de Prisma no frontend e imutabilidade das migrations já aplicadas.

O importador de extrato é testado em três camadas:

| Arquivo | Camada | Depende de servidor? |
| --- | --- | --- |
| `import-values.test.mjs` | valor monetário e data civil | não |
| `import-csv.test.mjs` | dialeto, aspas, mapeamento e codificação | não |
| `import-ofx.test.mjs` | OFX em SGML e em XML | não |
| `import-inspect.test.mjs` | inspeção completa e limites de segurança | não |
| `import-e2e.test.mjs` | fluxo HTTP real e controles de segurança | **sim** |

O teste ponta a ponta roda contra o backend em execução — `pnpm dev` ou
`pnpm docker:up` — e é **pulado automaticamente** quando não há servidor,
para que `pnpm test` continue verde offline. Ele cria seu próprio perfil e
conta sintéticos e desfaz os lotes que cria. Use `TALENTUM_E2E_URL` para apontar
para outro endereço.

Os módulos puros de `src/server/import/` usam extensão `.ts` explícita nos
imports relativos. Isso é o que permite ao executor do Node importá-los
diretamente, sem etapa de build, e por isso `allowImportingTsExtensions` está
ligado no `tsconfig.json`. Pelo mesmo motivo eles não usam *parameter
properties*: o modo `strip-only` do Node não as suporta.

## Dados de teste

Use somente nomes, instituições, documentos, contas e valores sintéticos. Não anonimize um extrato real de forma superficial; crie uma fixture artificial que represente o formato necessário.

## Antes de criar estrutura

Pesquise por equivalente e adicione apenas diretórios com responsabilidade imediata. A organização-alvo está em `ARCHITECTURE.md`, mas diretórios vazios e abstrações antecipadas não devem ser criados.
