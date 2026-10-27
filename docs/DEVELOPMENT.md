# Desenvolvimento do Talentum

## Estado do repositório

O projeto está em pré-alpha. Já existe uma base Next.js full-stack, API REST local inicial, shell Electron, Prisma/SQLite, execução do servidor local por Docker e scaffold do Worker/D1. Os módulos financeiros e as rotas cloud de negócio ainda não foram implementados.

A interface desktop atual recria o layout de referência como protótipo navegável. As rotas sob `src/app/` usam dados sintéticos de `src/lib/demo-data.ts`; botões e estados demonstrativos não implicam persistência ou integração pronta.

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

### O que cada arquivo de configuração responde

| Arquivo | Responsabilidade | Versionado |
| --- | --- | --- |
| `.env` | banco local SQLite, caminho do SQLite no Docker e acesso da LP/BFF ao Worker | não |
| `.env.example` | os mesmos nomes com placeholders sintéticos | sim |
| `cloudflare/.dev.vars` | segredos do próprio Worker em desenvolvimento | não |
| `cloudflare/wrangler.jsonc` | binding `DB`, `database_id` do D1 e variáveis públicas | sim |

`CLOUDFLARE_API_BASE_URL` é o Worker visto do host (`http://127.0.0.1:8787` com `pnpm cloudflare:dev`) e `DOCKER_CLOUDFLARE_API_BASE_URL` é o mesmo Worker visto de dentro do container (`http://host.docker.internal:8787`), pela mesma razão das duas URLs do SQLite. A LP lê o `.env` da raiz também quando roda de dentro de `apps/web` (`process.loadEnvFile` em `apps/web/next.config.ts`); variáveis já definidas no ambiente têm precedência. Em `cloudflare/.dev.vars`, `PUBLIC_WEB_URL` e `ALLOWED_ORIGIN` apontam para a LP local e sobrescrevem os valores de produção durante `wrangler dev`.

`DATABASE_URL` é o SQLite do host, resolvido a partir de `prisma/`. `DOCKER_DATABASE_URL` é o caminho dentro do container `talentum-local` e precisa apontar para o volume `talentum-data`; os dois existem porque `temp/` do host não existe dentro da imagem. `CLOUDFLARE_API_BASE_URL` e `CLOUDFLARE_BFF_SHARED_SECRET` são o único acesso da LP à borda, e o segundo precisa ser idêntico ao `BFF_SHARED_SECRET` do Worker. Nenhum dado financeiro é configurado ou trafega pela borda: o D1 é acessado somente pelo Worker.

## Comandos existentes

| Comando | Comportamento atual |
| --- | --- |
| `pnpm dev` | libera a porta 3000, remove `.next` e inicia `next dev` |
| `pnpm dev:all` | abre o Electron em `http://localhost:3000`; anexa-se a um servidor já no ar ou sobe um próprio |
| `pnpm docker:build` | constrói as imagens isoladas do app local e da LP |
| `pnpm docker:up` | constrói e inicia o app em `127.0.0.1:3000` e a LP em `127.0.0.1:3100` |
| `pnpm docker:up:detached` | inicia os dois serviços em segundo plano e aguarda os healthchecks |
| `pnpm docker:down` | encerra os containers sem apagar o volume SQLite |
| `pnpm build` | chama `next build` |
| `pnpm start` | executa a build pelo servidor Next.js na porta 3000 |
| `pnpm typecheck` | gera o Prisma Client só quando o schema mudou e chama `tsc --noEmit` |
| `pnpm hooks:install` | ativa os hooks versionados em `.githooks/` (typecheck e testes antes de commit e push) |
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
| `pnpm marca:gerar` | gera a marca vetorial (SVG claro, escuro e selo) e os `.ico` do app, da LP e da janela |
| `pnpm estados:gerar` | gera as ilustrações de estado por tema a partir dos mestres em `design/estados-vetor/` |
| `pnpm lp:icones` | gera o mapa de ícones SVG da LP a partir de `bootstrap-icons` |
| `pnpm lp:telas` | gera as variantes de 640 px das capturas exibidas na LP |

`pnpm dev` e `pnpm dev:all` executam `prisma migrate deploy` antes de abrir o servidor. A URL local padrão aponta para `temp/talentum-local.db`, que é ignorado pelo Git. Crie migrations com `pnpm prisma:migrate --name <nome>`; não use `prisma db push` como fluxo do projeto.

No fluxo Docker atual, `talentum-local` contém o backend e a interface desktop local; `talentum-web` contém somente a LP/BFF de `apps/web`. A URL padrão do Worker vista pela LP em container é `http://host.docker.internal:8787` e pode ser substituída por `CLOUDFLARE_API_BASE_URL`. Valores locais de integração devem ficar em `.env` ignorado, nunca no Compose versionado.

O Electron roda no host e aponta para `http://localhost:3000`, tanto o de `pnpm dev` quanto o iniciado pelo Compose. `pnpm dev:all` consulta `GET /api/health/live` antes de agir: quando o backend local já responde, a janela é anexada a ele e nenhum servidor novo é iniciado; fechar a janela nesse modo não encerra o container nem o terminal alheio. Quando nada responde, o script sobe o servidor e o encerra junto da janela. `TALENTUM_URL` sobrescreve o endereço quando necessário. Ao iniciar, o container executa `prisma migrate deploy`, cria ou atualiza `/data/talentum-local.db` e só então sobe o servidor. O volume nomeado `talentum-data` preserva o SQLite entre recriações do container.

O SQLite local já possui `LocalProfile`, `UserPreference` e o núcleo financeiro inicial. O D1 possui migration própria para identidade mínima, sessão, releases e feedback. Consulte [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md) antes de criar ou aplicar migrations cloud.

A imagem usa Ubuntu 24.04, Node.js 22 copiado da imagem oficial, execução por usuário não-root e somente os pacotes de sistema necessários para TLS/Prisma. Electron não roda dentro da imagem.

### Banco local dentro do Docker

Para que `http://localhost:3000` use o banco dentro do Docker, suba o app pelo Compose (`pnpm docker:up:detached`). O SQLite fica em `/data/talentum-local.db`, no volume nomeado `talentum-data`, e não no host. Depois, `pnpm dev:all` detecta o container pelo healthcheck e só abre a janela Electron sobre ele. Não rode `pnpm dev` com o container no ar: o script libera a porta 3000 encerrando o processo que a ocupa, o que inclui o encaminhamento de porta do Docker, e passaria a usar o `temp/talentum-local.db` do host. O banco continua SQLite; trocá-lo por um servidor de banco contrariaria o modelo local-first de `ARCHITECTURE-ELECTRON.md`.

### Portas compartilhadas com outros projetos

Os servidores do Talentum escutam somente no loopback IPv4 (`127.0.0.1`). Outro servidor local iniciado com `--hostname localhost` pode ocupar a mesma porta no IPv6 (`[::1]`), e o navegador, que tenta o IPv6 primeiro ao resolver `localhost`, abre esse outro projeto. Quando `http://localhost:<porta>` mostrar uma página que não é do Talentum, use `http://127.0.0.1:<porta>` ou encerre o outro servidor. Para conferir quem escuta, use `Get-NetTCPConnection -LocalPort 3000,3001,3100 -State Listen` no Windows ou `lsof -iTCP -sTCP:LISTEN` no Linux.

## Skills de agente

`.claude/skills/` e `.claude/agents/` versionam skills de design de terceiros, usadas pelo Claude Code neste repositório. Elas são ferramentas de apoio e não fontes normativas: em qualquer conflito, `BRANDING.md`, `DASHBOARD.md` e as demais regras deste diretório prevalecem. São uma exceção deliberada à regra de manter Markdown somente em `docs/`, porque o Claude Code só as descobre nesse caminho.

| Origem | Licença | Revisão | Conteúdo instalado |
| --- | --- | --- | --- |
| [`emilkowalski/skills`](https://github.com/emilkowalski/skills) | MIT | `2d22863` | as 15 skills de `skills/` (animação, design engineering, UI) |
| [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Apache-2.0 | `658b4ce` | `.claude/skills/impeccable` e os quatro agents `impeccable-*` |
| [`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill) | MIT | `12af471` | `skills/taste-skill` |

Cada skill traz o `LICENSE` da origem. Decisões da instalação:

- os hooks do Impeccable (`.claude/settings.json` do repositório de origem) **não** foram instalados. Eles executariam um binário baixado a cada edição e ao fim de cada sessão. Para ativá-los, registre a decisão antes;
- `scripts/impeccable` baixa seu binário do GitHub Releases na primeira execução e só o roda depois de conferir o SHA-256 publicado;
- os scripts da taste-skill consultam APIs públicas de imagens (Openverse, Wikimedia, Met, AIC, Internet Archive, NASA) e gravam histórico em `~/.taste-skill`. Nenhum dado financeiro ou do repositório é enviado.

Para atualizar, clone a origem em diretório temporário, revise o diff (sobretudo scripts, hooks e acesso à rede), substitua a pasta e atualize a revisão nesta tabela.

## Dependências confirmadas no documento-fonte

- Next.js App Router, React, Tailwind CSS, Electron, Prisma/SQLite e PDF.js estão instalados.
- O nome genérico “Node-OFX” foi concretizado como `ofx-data-extractor`, com tipos, normalização e validação. A escolha substitui o pacote legado `ofx`, cujo repositório é conhecido como `node-ofx`.
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

### Testes de regressão — atual

Todo bug é corrigido em ordem fixa: primeiro um teste em `tests/regression/` que reproduz o defeito e falha pelo motivo descrito, depois a correção, depois a suíte completa. A regra está em `CLAUDE.md` e `CODEX.md`. `.githooks/pre-commit` e `.githooks/pre-push` rodam `pnpm typecheck` e `pnpm test`; ative-os uma vez com `pnpm hooks:install` e nunca use `--no-verify`.

Os testes do Worker não leem o código-fonte: `tests/regression/helpers/worker.mjs` monta um D1 em memória com `node:sqlite` e as migrations reais de `cloudflare/migrations`, e importa `cloudflare/src/index.ts` diretamente. Exige Node com `node:sqlite` (22.13 ou superior).

`pnpm typecheck` compara `prisma/schema.prisma` com a cópia guardada no cliente gerado e só roda `prisma generate` quando houve mudança. No Windows o servidor de desenvolvimento trava a DLL do Prisma, e regenerar com ele aberto falhava com EPERM; se o schema mudou, feche o servidor antes do typecheck.

As fórmulas financeiras vivem em `src/server/dashboard-metrics.ts`, um módulo puro sem Prisma e sem relógio implícito, e são testadas diretamente: o Node faz *type stripping* nativo e importa o `.ts` sem etapa de build. A flag `--experimental-strip-types` é passada explicitamente para manter compatibilidade a partir do Node 22.13; em Node 22.18 ou superior ela é dispensável.

Testes de contrato leem o próprio código-fonte e verificam invariantes que não podem regredir em silêncio: exigência de `X-Action-Code`, escopo por `profileId` em toda cláusula `where`, ausência de texto monetário formatado no backend, ausência de Prisma no frontend e imutabilidade das migrations já aplicadas.

## Dados de teste

Use somente nomes, instituições, documentos, contas e valores sintéticos. Não anonimize um extrato real de forma superficial; crie uma fixture artificial que represente o formato necessário.

## Antes de criar estrutura

Pesquise por equivalente e adicione apenas diretórios com responsabilidade imediata. A organização-alvo está em `ARCHITECTURE.md`, mas diretórios vazios e abstrações antecipadas não devem ser criados.
