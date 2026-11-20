<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-talentum-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./icon-talentum-light.svg">
    <img src="./icon-talentum-light.svg" width="190" alt="Símbolo do Talentum: uma balança atravessada por um traço âmbar">
  </picture>

  # Talentum

  **Seu piloto automático financeiro, local-first e open-source.**
https://talentum-tech.vercel.app

  [![Status: planejamento ativo](https://img.shields.io/badge/status-planejamento%20ativo-B8773D)](#estado-do-projeto)
  [![Plataformas: Windows e Linux](https://img.shields.io/badge/plataformas-Windows%20%7C%20Linux-1A110A)](#arquitetura)
  [![Dados: local-first](https://img.shields.io/badge/dados-local--first-5C4033)](#privacidade-por-princípio)
  [![Contribuições: bem-vindas](https://img.shields.io/badge/contribuições-bem--vindas-4A4A4A)](#como-contribuir)
  [![Licença: MIT](https://img.shields.io/badge/licença-MIT-B8773D)](./LICENSE)
</div>

> *Talentum* vem do latim: uma unidade de grande valor e, por extensão, aquilo que nos foi confiado para administrar e multiplicar.

O Talentum nasce para quem quer cuidar melhor do dinheiro, mas não tem tempo para alimentar planilhas ou classificar cada compra manualmente. O aplicativo pretende importar extratos, organizar transações, antecipar compromissos e transformar dados financeiros em próximos passos claros — mantendo os dados sensíveis no dispositivo do usuário.

> [!IMPORTANT]
> O projeto está em fase inicial. As telas e capacidades descritas abaixo representam a visão do produto; o que já está implementado e verificável está listado em [Estado do projeto](#estado-do-projeto). Tudo o que não aparece lá ainda não existe.

## O problema que queremos resolver

O saldo exibido pelo banco raramente conta a história inteira. Faturas, assinaturas, débitos automáticos e metas futuras competem pelo mesmo dinheiro; ao mesmo tempo, registrar tudo à mão cria uma rotina que poucas pessoas conseguem sustentar.

O Talentum propõe um fluxo de baixa fricção:

```mermaid
flowchart LR
    A[Importar<br/>PDF ou OFX] --> B[Organizar e<br/>categorizar]
    B --> C{Há dúvida?}
    C -- Sim --> D[Conciliar<br/>com um toque]
    C -- Não --> E[Calcular o<br/>saldo livre]
    D --> E
    E --> F[Planejar metas<br/>e aportes]
```

## O que compõe o Talentum

| | Área | Para que serve |
| :---: | --- | --- |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/speedometer2.svg" width="22" alt=""> | **Início** | Resume saldo livre, média de gastos, alertas, progresso e situação da carteira em poucos segundos. |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/credit-card.svg" width="22" alt=""> | **Extratos, cartões e benefícios** | Importa PDF/OFX, organiza lançamentos, acompanha faturas, recorrências, anuidade, cashback, milhas e pontos. |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/check2-square.svg" width="22" alt=""> | **Conciliação financeira** | Resolve classificações incertas, confere faturas e registra juros, descontos ou gastos em dinheiro. |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/pie-chart.svg" width="22" alt=""> | **Patrimônio e metas** | Acompanha objetivos, sugere a destinação do superávit e orienta novos aportes pelos quatro pilares. |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/newspaper.svg" width="22" alt=""> | **Invest** | Reúne notícias econômicas, prioriza ativos da carteira, produz resumos e preserva o crédito da fonte. |
| <img src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/clock-history.svg" width="22" alt=""> | **Histórico e perfil** | Mantém a timeline, pontos de restauração, exportações, backups, missões, XP, níveis e conquistas. |

Funções globais complementam essas áreas: notificações acionáveis, importação rápida, seleção de conta e lançamento expresso de despesas em espécie.

## Saldo livre, não apenas saldo bancário

Uma das métricas centrais é o **Saldo Livre de Risco**: o valor disponível depois de considerar faturas abertas, contas recorrentes e débitos previstos até o fim do período. A intenção é substituir a falsa sensação de disponibilidade por uma leitura realista do que pode ser gasto.

Quando houver dívidas caras ou saldo negativo, o produto deverá entrar em **modo de sobrevivência**: pausar sugestões de investimento, priorizar a quitação dos juros mais altos e reconstruir a liquidez antes de retomar o planejamento patrimonial.

## Metodologia ARCA

O módulo patrimonial usa como referência a metodologia ARCA, idealizada por **Thiago Nigro (Primo Rico)**. Ela organiza o patrimônio em quatro pilares com meta-base de 25% cada:

| Pilar | Papel na carteira | Exemplos |
| --- | --- | --- |
| **A — Ações** | Crescimento e participação em empresas brasileiras | Ações negociadas na B3 |
| **R — Real Estate** | Exposição imobiliária e geração de renda | Fundos imobiliários e ativos imobiliários |
| **C — Caixa** | Segurança, reserva e liquidez | Tesouro Selic e CDBs com liquidez diária |
| **A — Ativos internacionais** | Diversificação global e proteção cambial | ETFs, BDRs e ativos no exterior |

```mermaid
pie showData
    title Distribuição-base dos quatro pilares
    "Ações" : 25
    "Real Estate" : 25
    "Caixa" : 25
    "Ativos internacionais" : 25
```

Para evitar movimentações motivadas por pequenas oscilações, um pilar é considerado equilibrado entre **22,5% e 27,5%**. O motor deverá priorizar novos aportes no pilar mais defasado, sem incentivar vendas desnecessárias.

> [!NOTE]
> O Talentum é uma ferramenta de organização e educação financeira. Ele não oferece recomendação individual de investimento. ARCA e Primo Rico são referências creditadas aos seus respectivos titulares e não indicam afiliação ou endosso ao projeto.

## Privacidade por princípio

Os dados financeiros pertencem ao usuário. A arquitetura planejada separa o que precisa permanecer local do mínimo necessário na nuvem.

```mermaid
flowchart TB
    subgraph Dispositivo[Dispositivo do usuário]
        E[Electron]
        N[Next.js + API local]
        P[Prisma ORM]
        S[(SQLite local)]
        E --> N --> P --> S
    end

    subgraph Nuvem[Serviços de borda]
        O[Google OAuth]
        W[Cloudflare Workers]
        D[(Cloudflare D1)]
        AI[Workers AI]
        O --> W --> D
        W --> AI
    end

    N -. autenticação e resumos .-> W
    S -. backup cifrado<br/>AES-256-GCM .-> D
```

- Extratos, transações, estabelecimentos, saldos e carteira ficam no SQLite local.
- A nuvem mantém apenas identidade, metadados essenciais e, quando habilitado, um snapshot já criptografado no dispositivo.
- O backup previsto usa AES-256-GCM e deve seguir um modelo de conhecimento zero.
- O usuário poderá exportar os próprios dados em formatos abertos, como JSON e CSV.

## Arquitetura

O aplicativo desktop será uma experiência full-stack local. O Electron abre e gerencia a janela; o Next.js entrega a interface e os Route Handlers; o Prisma acessa o SQLite no próprio computador.

| Camada | Tecnologia | Responsabilidade planejada |
| --- | --- | --- |
| Desktop | Electron | Empacotamento e janela nativa para Windows e Linux |
| Aplicação | Next.js, React e TypeScript | Interface, renderização e API local |
| Estilo | Tailwind CSS | Sistema visual responsivo |
| Dados | Prisma ORM e SQLite | Persistência local tipada |
| Importação | PDF.js e parser OFX | Extração local de extratos e faturas |
| Identidade | Google OAuth 2.0 | Conta única para landing page e aplicativo |
| Borda | Cloudflare Workers e D1 | Sessão, metadados mínimos, proxy e backup cifrado |
| IA | Cloudflare Workers AI | Resumos objetivos de notícias sem exigir modelos pesados no computador |

## Identidade visual

A marca combina a sobriedade de uma balança com um corte ascendente em âmbar. O repositório mantém duas imagens SVG com transparência real:

| Uso | Arquivo | Cores principais |
| --- | --- | --- |
| Fundos claros | [`icon-talentum-light.svg`](./icon-talentum-light.svg) | Ébano `#1A110A` e âmbar |
| Fundos escuros | [`icon-talentum-dark.svg`](./icon-talentum-dark.svg) | Alabastro e âmbar |

Paleta-base: **Alabastro** `#F4F1EA`, **Ébano** `#1A110A`, **Âmbar clássico** `#B8773D`, **Grafite** `#4A4A4A` e **Nogueira** `#5C4033`.

Os ícones usados neste README pertencem ao [Bootstrap Icons](https://icons.getbootstrap.com/), distribuído sob licença MIT. Novos elementos iconográficos públicos devem manter essa mesma família para preservar consistência.

## Estado do projeto

O repositório está em **pré-alpha**. Hoje ele contém a visão consolidada, documentação, identidade visual, base Next.js full-stack, API REST local, Prisma/SQLite, Docker e shell Electron.

Já funcionam de ponta a ponta, sobre o banco local:

- importação de extrato em **CSV e OFX**, com prévia antes de gravar, conferência do papel de cada coluna, deduplicação por arquivo e por lançamento, gravação atômica e reversão do lote;
- listagem de lançamentos;
- cadastro de perfil local, instituições e contas com saldo informado;
- painel com Saldo Livre de Risco, saldo consolidado, gastos do mês, média diária, comprometido no período e gastos por categoria.

Ainda não implementados por pertencerem a etapas posteriores: importação de PDF, cartões e faturas, patrimônio e ARCA, metas, notícias, gamificação e backup cloud cifrado. A conciliação e a timeline local do MVP estão implementadas. A trilha Cloudflare de cadastro e download está preparada no código, mas ainda depende de segredos, OAuth, artefatos assinados e validação no ambiente publicado.

### Roadmap inicial

O plano completo, com MVP, macrofeatures posteriores, dependências e critérios de conclusão, está em [`docs/ROADMAP.md`](./docs/ROADMAP.md). O primeiro release concentra-se em cadastro/download, Electron seguro, persistência local, importação OFX, conciliação e Saldo Livre de Risco.

## Desenvolvimento local

### Pré-requisitos

- Node.js 22.13 ou superior;
- pnpm `11.1.2`;
- Git.

### Preparação

```bash
git clone https://github.com/luizfelipe-pacifico/talentum.git
cd talentum
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate
pnpm hooks:install
```

`pnpm hooks:install` é obrigatório para contribuir: ativa os hooks que bloqueiam commit e push quando o typecheck ou algum teste, inclusive os de regressão, falha. Confira com `git config --get core.hooksPath`, que deve imprimir `.githooks`.

### Comandos disponíveis

| Comando | Ação |
| --- | --- |
| `pnpm dev` | Limpa o cache do Next.js, libera a porta 3000 e inicia o servidor local |
| `pnpm dev:all` | Abre o Electron em `http://localhost:3000`; reaproveita um servidor já no ar, seja do Docker ou de um `pnpm dev` em outro terminal |
| `pnpm docker:up` | Constrói e inicia o app local em `localhost:3000` e a LP em `localhost:3100` |
| `pnpm docker:up:detached` | Inicia os dois serviços em segundo plano e aguarda os healthchecks |
| `pnpm docker:down` | Encerra os dois serviços sem remover o volume SQLite |
| `pnpm build` | Gera a build de produção do Next.js |
| `pnpm start` | Executa a build de produção na porta 3000 |
| `pnpm typecheck` | Verifica os tipos TypeScript |
| `pnpm test` | Roda a suíte, inclusive os testes de regressão |
| `pnpm hooks:install` | Ativa os hooks que rodam typecheck e testes antes de commit e push e garante que sejam executáveis |
| `pnpm prisma:generate` | Gera o Prisma Client |
| `pnpm prisma:validate` | Valida o schema Prisma |
| `pnpm prisma:migrate` | Cria e aplica migrações SQLite locais |

Para que `localhost:3000` use o banco SQLite dentro do Docker, suba o app com `pnpm docker:up:detached` e abra a janela com `pnpm dev:all`, que se anexa ao container. Skills de design para o Claude Code ficam em `.claude/skills/`; origem, licença e revisão estão em [`docs/BEST_PRACTICES.md`](./docs/BEST_PRACTICES.md).

Os containers executam os servidores Next.js como usuários não-root; a janela Electron é iniciada no host. O app local usa um volume nomeado para o SQLite, que não entra na imagem. A LP é servida separadamente em `http://localhost:3100`, preservando o limite arquitetural entre o site público e o produto local.

## Documentação

A documentação técnica fica em `docs/`, em inglês, concentrada em poucos documentos extensos e indexada em [`docs/README.md`](./docs/README.md).

- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md): visão geral, fluxos, contratos de API e as duas camadas, Web (LP, BFF, Worker e D1) e Electron (desktop, app local, SQLite).
- [`SECURITY.md`](./docs/SECURITY.md): autenticação, refresh tokens, controles obrigatórios e gestão de segredos.
- [`DATABASE.md`](./docs/DATABASE.md): regras de modelagem, schema local (Prisma/SQLite), schema cloud (D1) e migrations.
- [`PRODUCT.md`](./docs/PRODUCT.md): visão do produto, funcionalidades e rotas do MVP, onboarding, dashboard e aviso de nova versão.
- [`DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md): marca, tokens dos dois temas, tipografia, ilustrações de estado e QA visual.
- [`ROADMAP.md`](./docs/ROADMAP.md): MVP e sequência planejada de todas as macrofeatures.
- [`BEST_PRACTICES.md`](./docs/BEST_PRACTICES.md): organização do repositório, práticas de engenharia e guia completo de desenvolvimento.
- [`decisions/`](./docs/decisions/): registros de decisões de arquitetura (ADRs).

## Como contribuir

Contribuições são bem-vindas desde esta fase inicial. Antes de começar:

1. Leia a documentação relacionada à área que pretende alterar.
2. Abra uma issue descrevendo o problema, a proposta e os critérios de aceite.
3. Crie uma branch curta, como `feat/importacao-ofx` ou `docs/privacidade`.
4. Faça mudanças pequenas, sem dados financeiros reais ou credenciais.
5. Ative os hooks com `pnpm hooks:install`. Toda correção de bug começa por um teste em `tests/regression/` que falha antes da correção. Execute as verificações disponíveis e descreva o resultado no pull request.
6. Use commits no padrão [Conventional Commits](https://www.conventionalcommits.org/).

Parsers comunitários devem usar amostras sintéticas e anonimizadas. Nunca envie extratos, nomes, documentos, tokens, chaves ou bancos SQLite reais ao repositório.

## Licença e transparência

O Talentum é distribuído sob a [licença MIT](./LICENSE). Dependências e recursos de terceiros permanecem sob suas respectivas licenças. Consulte também as políticas de contribuição, conduta e segurança em [`.github/`](./.github/).

---

<div align="center">
  <strong>Clareza para o presente. Disciplina para o futuro.</strong>
</div>
