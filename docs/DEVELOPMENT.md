# Desenvolvimento do Talentum

## Estado do repositório

O projeto está em pré-alpha. Já existe uma base Next.js full-stack, API REST local inicial, shell Electron, Prisma/SQLite e execução do servidor local por Docker. Os módulos financeiros e serviços Cloudflare ainda não foram implementados.

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
| `pnpm docker:build` | constrói a imagem do servidor Next.js local |
| `pnpm docker:up` | constrói e inicia o servidor em `127.0.0.1:3000` |
| `pnpm docker:down` | encerra o servidor em container sem apagar o volume |
| `pnpm build` | chama `next build` |
| `pnpm start` | executa a build pelo servidor Next.js na porta 3000 |
| `pnpm typecheck` | chama `tsc --noEmit` |
| `pnpm prisma:generate` | chama `prisma generate` |
| `pnpm prisma:validate` | chama `prisma validate` |
| `pnpm prisma:migrate` | cria/aplica migrações locais de desenvolvimento |

O Electron roda no host e pode apontar tanto para `pnpm dev` quanto para o servidor iniciado pelo Compose. O volume nomeado `talentum-data` preserva o SQLite entre recriações do container.

A imagem usa Ubuntu 24.04, Node.js 22 copiado da imagem oficial, execução por usuário não-root e somente os pacotes de sistema necessários para TLS/Prisma. Electron não roda dentro da imagem.

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

## Dados de teste

Use somente nomes, instituições, documentos, contas e valores sintéticos. Não anonimize um extrato real de forma superficial; crie uma fixture artificial que represente o formato necessário.

## Antes de criar estrutura

Pesquise por equivalente e adicione apenas diretórios com responsabilidade imediata. A organização-alvo está em `ARCHITECTURE.md`, mas diretórios vazios e abstrações antecipadas não devem ser criados.
