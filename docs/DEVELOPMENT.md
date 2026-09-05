# Desenvolvimento do Talentum

## Estado do repositório

O projeto está em pré-alpha. Há um `package.json`, lockfile pnpm, scripts de inicialização e um shell Electron. Ainda não existem `src/`, configuração Next.js, `tsconfig.json`, schema Prisma ou testes; portanto, build, typecheck e comandos Prisma não são esperados como verdes neste momento.

## Requisitos

- Node.js 20 ou superior;
- pnpm 11.1.2;
- Git;
- Windows ou Linux para os alvos iniciais.

## Instalação

```bash
pnpm install
```

Não copie valores reais para `.env.example`. O arquivo `.env` local não deve ser versionado.

## Comandos existentes

| Comando | Comportamento atual |
| --- | --- |
| `pnpm dev` | libera a porta 3000, remove `.next` e inicia `next dev` |
| `pnpm dev:all` | inicia o servidor, aguarda a porta e abre o Electron |
| `pnpm build` | chama `next build` |
| `pnpm start` | chama `next start -p 3000` |
| `pnpm typecheck` | chama `tsc --noEmit` |
| `pnpm prisma:generate` | chama `prisma generate` |
| `pnpm prisma:validate` | chama `prisma validate` |

Os quatro últimos grupos dependem de arquivos que ainda serão introduzidos.

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
