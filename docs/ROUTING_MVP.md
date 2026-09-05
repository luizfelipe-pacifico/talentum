# Routing funcional do MVP

## Objetivo

Este documento é o mapa de implementação das funcionalidades do MVP do Talentum. Para cada módulo ele define:

- o que a funcionalidade faz;
- o fluxo esperado para a pessoa usuária;
- as rotas do Electron/Next.js;
- as APIs do backend local;
- as tabelas e relações por ID;
- as migrations necessárias;
- o critério verificável de conclusão.

O MVP estará completo quando uma pessoa conseguir criar sua base financeira, importar CSV ou OFX, revisar os lançamentos e consultar um Dashboard confiável, com todos os dados financeiros mantidos no SQLite local.

## Regras obrigatórias

1. O frontend não acessa SQLite, Prisma ou arquivos financeiros diretamente.
2. O frontend solicita um código temporário, opaco e de uso único antes de cada chamada funcional ao backend.
3. O backend valida o código, entrada, autorização e contexto antes de consultar ou alterar dados.
4. Toda tabela possui `id`; toda relação usa foreign key terminada em `Id`.
5. Estruturas persistentes existem em migrations versionadas. Não se cria tabela manualmente durante a execução.
6. Prisma representa o schema aplicado pelas migrations; produção e Docker usam `prisma migrate deploy`.
7. Migrations aplicadas nunca são reescritas. Mudanças geram uma migration posterior.
8. Nenhum dado financeiro fictício fica no frontend. Sem registros no banco, a interface exibe estado vazio.
9. Valores monetários usam centavos inteiros/`BigInt`; nunca `Float`.
10. CSV e OFX reais de teste ficam em `temp/`, fora do Git.

## Fluxo principal do MVP

```mermaid
flowchart LR
    O[Onboarding] --> A[Contas e saldos]
    A --> I[Importar CSV ou OFX]
    I --> E[Extrato normalizado]
    E --> C[Conciliação]
    C --> D[Dashboard]
    D --> H[Histórico e correções]
```

## Feature 1 — Onboarding financeiro

### O que faz

Cria a fotografia financeira inicial sem obrigar a pessoa a preencher tudo de uma vez. Permite cadastrar perfil, bancos, contas, saldos, renda, obrigações e investimentos, ou começar pela importação do extrato disponível.

### Fluxo

1. Explicar que dados financeiros ficam somente no dispositivo.
2. Criar ou retomar rascunho do onboarding.
3. Informar moeda e fuso.
4. Cadastrar instituições e contas.
5. Informar saldo atual ou anexar extrato.
6. Cadastrar renda e obrigações essenciais, quando conhecidas.
7. Revisar resumo e concluir.

### Rotas de interface

- `/onboarding`
- `/onboarding/perfil`
- `/onboarding/contas`
- `/onboarding/posicao-atual`
- `/onboarding/revisao`

### APIs locais

- `GET /api/onboarding`
- `POST /api/onboarding`
- `PATCH /api/onboarding/[onboardingId]`
- `POST /api/onboarding/[onboardingId]/complete`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `LocalProfile` | `id` | identidade local sem dados bancários sensíveis |
| `UserPreference` | `id`, `profileId` | tema, moeda, idioma e fuso |
| `OnboardingSession` | `id`, `profileId` | etapa atual, status e retomada |
| `OnboardingAnswer` | `id`, `onboardingSessionId` | resposta validada por pergunta |

### Migration

- Criar `OnboardingSession` e `OnboardingAnswer` em migration própria.

### Concluída quando

- O onboarding pode ser interrompido e retomado, e o Dashboard continua vazio até o backend confirmar a existência de dados financeiros.

## Feature 2 — Instituições, contas e saldos

### O que faz

Representa os locais onde a pessoa possui dinheiro. Não exige agência ou número da conta. Chaves PIX próprias são opcionais, cifradas e usadas somente para reconhecer transferências entre contas da mesma pessoa.

### Fluxo

1. Cadastrar instituição pelo nome.
2. Criar uma ou mais contas ligadas por `institutionId`.
3. Informar tipo e moeda da conta.
4. Registrar o saldo conhecido com data de referência.
5. Opcionalmente cadastrar identificadores PIX locais cifrados.

### Rotas de interface

- `/contas`
- `/contas/nova`
- `/contas/[accountId]`

### APIs locais

- `GET|POST /api/institutions`
- `GET|PATCH|DELETE /api/institutions/[institutionId]`
- `GET|POST /api/accounts`
- `GET|PATCH|DELETE /api/accounts/[accountId]`
- `POST /api/accounts/[accountId]/balance-snapshots`
- `GET|POST /api/accounts/[accountId]/pix-identifiers`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `Institution` | `id`, `profileId` | instituição financeira |
| `Account` | `id`, `profileId`, `institutionId` | conta, tipo, moeda e estado |
| `BalanceSnapshot` | `id`, `accountId` | saldo conhecido em uma data |
| `PixIdentifier` | `id`, `accountId` | hash para comparação e valor cifrado local |

### Migration

- `mvp_financial_core` já cria `Institution`, `Account` e `BalanceSnapshot`.
- Migration posterior cria `PixIdentifier` e seus índices.

### Concluída quando

- Criar, editar ou desativar uma conta atualiza o seletor e o saldo consolidado por consulta ao backend.

## Feature 3 — Categorias, rendas e obrigações

### O que faz

Cria a estrutura usada para interpretar receitas, despesas, transferências e valores comprometidos no mês.

### Rotas de interface

- `/configuracoes/categorias`
- `/planejamento/rendas`
- `/extratos/recorrencias`

### APIs locais

- `GET|POST /api/categories`
- `GET|PATCH|DELETE /api/categories/[categoryId]`
- `GET|POST /api/incomes`
- `GET|POST /api/obligations`
- `GET|PATCH|DELETE /api/obligations/[obligationId]`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `Category` | `id`, `profileId` | classificação de receita, despesa ou transferência |
| `IncomeSource` | `id`, `profileId`, `accountId?` | renda prevista ou recorrente |
| `ScheduledObligation` | `id`, `profileId`, `accountId?`, `categoryId?` | compromisso com valor e vencimento |
| `MerchantRule` | `id`, `profileId`, `categoryId` | regra determinística de categorização |

### Migration

- `mvp_financial_core` já cria `Category`.
- Migration posterior cria renda, obrigação e regras.

### Concluída quando

- O frontend lista somente categorias e obrigações retornadas pelo backend, e o total comprometido possui teste unitário.

## Feature 4 — Importação CSV e OFX

### O que faz

Transforma um arquivo bancário em um lote rastreável de transações locais. CSV exige mapeamento de colunas porque bancos podem usar cabeçalhos, separadores, datas e sinais diferentes.

### Fluxo

1. Selecionar `.csv` ou `.ofx`.
2. Backend validar tamanho, tipo real, encoding e conteúdo.
3. Calcular fingerprint antes de importar.
4. No CSV, detectar separador e solicitar mapeamento de colunas.
5. Mostrar prévia sem gravar transações.
6. Confirmar conta, datas, sinal de débito/crédito e saldo.
7. Gravar lote e transações em uma transação SQLite.
8. Enviar itens incertos para conciliação.

### Rotas de interface

- `/extratos/importar`
- `/extratos/importar/[importBatchId]`
- `/extratos/importar/[importBatchId]/mapeamento`
- `/extratos/importar/[importBatchId]/revisao`

### APIs locais

- `POST /api/imports/inspect`
- `POST /api/imports`
- `GET /api/imports/[importBatchId]`
- `PATCH /api/imports/[importBatchId]/mapping`
- `POST /api/imports/[importBatchId]/confirm`
- `DELETE /api/imports/[importBatchId]`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `ImportBatch` | `id`, `profileId` | formato, fingerprint, estado e totais do lote |
| `ImportFile` | `id`, `importBatchId` | metadados mínimos; conteúdo bruto não é retido por padrão |
| `CsvMappingProfile` | `id`, `profileId`, `institutionId?` | mapeamento reutilizável de colunas |
| `ImportIssue` | `id`, `importBatchId`, `transactionId?` | erro ou aviso por linha/campo |
| `Transaction` | `id`, `profileId`, `accountId`, `importBatchId`, `categoryId?` | lançamento normalizado |

### Migration

- `mvp_financial_core` já cria `ImportBatch` e `Transaction`.
- Migration posterior cria `ImportFile`, `CsvMappingProfile` e `ImportIssue`.

### Concluída quando

- CSV e OFX sintéticos importam corretamente; reenviar o mesmo arquivo não duplica dados; erro em uma linha não produz lote parcialmente confirmado.

## Feature 5 — Extratos e transações

### O que faz

Exibe os lançamentos persistidos com paginação, filtros, origem do lote e estado de conciliação.

### Rotas de interface

- `/extratos`
- `/extratos/[transactionId]`

### APIs locais

- `GET /api/transactions`
- `GET|PATCH /api/transactions/[transactionId]`
- `GET /api/transactions/[transactionId]/history`

### Consulta

- Filtros e ordenação são validados no backend.
- A API retorna IDs opacos e DTOs mínimos.
- O frontend não calcula saldo nem reclassifica dados sozinho.

### Concluída quando

- Sem transações, a rota apresenta estado vazio; com registros, cada linha corresponde a uma `Transaction.id` retornada pelo backend.

## Feature 6 — Conciliação

### O que faz

Permite confirmar ou corrigir transações incertas sem apagar o dado original. Reconhece categoria, transferência entre contas próprias, obrigação e ajuste financeiro.

### Fluxo

1. Backend cria pendência com motivo e confiança.
2. Frontend solicita o próximo item.
3. Pessoa confirma ou corrige.
4. Backend registra decisão, antes/depois e autor local.
5. Cálculos e Dashboard são atualizados.
6. Decisão pode ser revertida.

### Rotas de interface

- `/conciliacao`
- `/conciliacao/[reconciliationItemId]`

### APIs locais

- `GET /api/reconciliation-items`
- `GET /api/reconciliation-items/[reconciliationItemId]`
- `POST /api/reconciliation-items/[reconciliationItemId]/decisions`
- `POST /api/reconciliation-decisions/[decisionId]/revert`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `ReconciliationItem` | `id`, `transactionId` | pendência, motivo e confiança |
| `ReconciliationDecision` | `id`, `reconciliationItemId`, `profileId` | decisão e antes/depois |
| `FinancialAdjustment` | `id`, `transactionId`, `decisionId?` | juros, multa, desconto ou correção |
| `OwnAccountTransfer` | `id`, `outgoingTransactionId`, `incomingTransactionId` | pareamento entre contas próprias |

### Concluída quando

- Nenhuma correção destrói o valor original e toda decisão relevante pode ser auditada e revertida.

## Feature 7 — Dashboard

### O que faz

Resume a posição atual usando somente consultas do backend. Não é uma tela separada de “Início”: a rota `/` é o Dashboard.

### Indicadores do MVP

- saldo atual consolidado pelo snapshot mais recente de cada conta ativa;
- despesas do mês;
- média diária do mês;
- quantidade de contas, importações e pendências;
- obrigações previstas;
- Saldo Livre de Risco, com fórmula e período explicáveis;
- gastos por categoria e fluxo mensal.

### Rotas de interface

- `/`

### APIs locais

- `GET /api/dashboard`
- `GET /api/dashboard/categories`
- `GET /api/dashboard/cash-flow`
- `GET /api/dashboard/risk-free-balance`

### Tabelas consultadas

- `Account`, `BalanceSnapshot`, `Transaction`, `Category`, `ImportBatch`, `ScheduledObligation` e `ReconciliationItem`.

### Estado atual

`GET /api/dashboard` já consulta o SQLite por meio do backend e exige `X-Action-Code`. O frontend mostra zeros apenas quando as consultas retornam zero registros; os demais cálculos ainda serão completados.

### Concluída quando

- Nenhum indicador vem de constante do frontend; alterar uma transação ou obrigação altera o Dashboard; fórmulas possuem testes unitários e teste ponta a ponta.

## Feature 8 — Histórico, reversão e segurança local

### O que faz

Registra importações e alterações relevantes sem guardar o código temporário, segredos ou conteúdo bruto do extrato.

### Rotas

- `/historico`
- `GET /api/timeline-events`
- `POST /api/timeline-events/[timelineEventId]/revert`

### Tabelas

| Tabela | IDs e relações | Responsabilidade |
| --- | --- | --- |
| `TimelineEvent` | `id`, `profileId`, `importBatchId?`, `transactionId?` | evento redigido e reversível |
| `DatabaseBackup` | `id`, `profileId` | metadados do backup local anterior a migration destrutiva |

### Concluída quando

- Eventos podem ser consultados sem expor segredos e migrations destrutivas exigem backup local validado.

## Ordem de migrations do MVP

| Ordem | Migration | Tabelas principais | Estado |
| --- | --- | --- | --- |
| 1 | `init` | `LocalProfile`, `UserPreference` | criada |
| 2 | `mvp_financial_core` | `Institution`, `Account`, `BalanceSnapshot`, `Category`, `ImportBatch`, `Transaction` | criada |
| 3 | `mvp_onboarding` | `OnboardingSession`, `OnboardingAnswer` | planejada |
| 4 | `mvp_financial_planning` | `IncomeSource`, `ScheduledObligation`, `MerchantRule`, `PixIdentifier` | planejada |
| 5 | `mvp_import_details` | `ImportFile`, `CsvMappingProfile`, `ImportIssue` | planejada |
| 6 | `mvp_reconciliation` | `ReconciliationItem`, `ReconciliationDecision`, `FinancialAdjustment`, `OwnAccountTransfer` | planejada |
| 7 | `mvp_timeline_backup` | `TimelineEvent`, `DatabaseBackup` | planejada |

## Ordem de implementação das features

1. Onboarding persistente.
2. Instituições, contas e snapshots.
3. Categorias, rendas e obrigações.
4. Inspeção e mapeamento de CSV.
5. Parser e importação transacional de CSV/OFX.
6. Listagem real de extratos.
7. Conciliação e reversão.
8. Dashboard e Saldo Livre de Risco completos.
9. Histórico, backup de migrations e testes ponta a ponta.
10. Empacotamento assinado para Windows e Linux.

## Definition of Done do MVP

- Todas as features acima atendem seus critérios de conclusão.
- Todas as tabelas existem por migrations e possuem IDs e foreign keys documentados.
- Todas as telas financeiras consultam o backend e possuem estados vazio, carregando, erro e com dados.
- Nenhum valor, transação, conta, categoria ou pessoa fictícia permanece no frontend.
- Toda chamada funcional usa código temporário de uso único e proteção contra replay.
- CSV e OFX sintéticos passam nos testes; arquivos reais ficam fora do Git.
- O SQLite é criado e atualizado com `prisma migrate deploy` no desenvolvimento, Docker e aplicativo empacotado.
- Builds Windows e Linux são reproduzíveis, assinados e verificáveis.
