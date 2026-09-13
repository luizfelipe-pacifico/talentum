# APIs do Talentum

## Escopo

Este documento mistura contratos atuais e planejados. As rotas marcadas como atuais existem no scaffold; rotas de negócio permanecem candidatas até sua implementação.

## Rotas locais atuais

O onboarding persistente possui os contratos atuais `GET|POST /api/onboarding`,
`PATCH /api/onboarding/:onboardingId` e
`POST /api/onboarding/:onboardingId/complete`. A atualização usa `version` para
detectar edições concorrentes, e todas as operações são escopadas pelo
`profileId` resolvido no backend. A conclusão exige confirmação de privacidade,
moeda e fuso e grava as preferências localmente.

Categorias, planejamento e compromissos possuem contratos locais atuais em
`/api/categories`, `/api/incomes`, `/api/obligations` e
`/api/merchant-rules`. Toda rota exige código efêmero e perfil local; dinheiro
trafega como centavos inteiros em `string`. Uma fonte de renda prevista nunca é
somada ao saldo antes de existir como transação efetiva.

O detalhe de lançamento usa `GET|PATCH /api/transactions/:transactionId`; seu
histórico imutável usa `GET /api/transactions/:transactionId/history`. A edição
aceita somente descrição, categoria e estado, valida propriedade e categoria no
backend e persiste antes/depois na mesma transação SQLite.

| Método | Rota | Proteção | Finalidade |
| --- | --- | --- | --- |
| `POST` | `/api/action-codes` | bootstrap e validação Zod | emitir código de ação por 60 segundos |
| `GET` | `/api/system/status` | `X-Action-Code` de uso único | verificar comunicação frontend/API |
| `GET` | `/api/dashboard` | `X-Action-Code` de uso único | indicadores do painel calculados no SQLite local |
| `GET` | `/api/dashboard/categories` | `X-Action-Code` de uso único | gastos por categoria no período |
| `GET` | `/api/dashboard/cash-flow` | `X-Action-Code` de uso único | entradas e saídas por mês, só onde há extrato |
| `GET` | `/api/dashboard/risk-free-balance` | `X-Action-Code` de uso único | decomposição do saldo livre e projeção diária |
| `GET`/`POST` | `/api/profile` | `X-Action-Code` de uso único | consultar e criar o perfil local |
| `GET`/`POST` | `/api/institutions` | `X-Action-Code` de uso único | listar e cadastrar instituições |
| `GET`/`POST` | `/api/accounts` | `X-Action-Code` de uso único | listar e cadastrar contas e saldo informado |
| `POST` | `/api/imports/inspect` | `X-Action-Code` de uso único | inspecionar um extrato sem gravar nada |
| `GET`/`POST` | `/api/imports` | `X-Action-Code` de uso único | listar lotes e gravar um lote inteiro |
| `GET`/`DELETE` | `/api/imports/:importBatchId` | `X-Action-Code` de uso único | detalhar e desfazer um lote |
| `GET` | `/api/transactions` | `X-Action-Code` de uso único | listar lançamentos com filtro e cursor |
| `GET` | `/api/csv-mappings` | `X-Action-Code` de uso único | listar mapeamentos de coluna salvos |
| `DELETE` | `/api/csv-mappings/:mappingId` | `X-Action-Code` de uso único | esquecer um mapeamento salvo |
| `GET`/`PATCH`/`DELETE` | `/api/institutions/:institutionId` | `X-Action-Code` de uso único | detalhar, renomear e excluir instituição |
| `GET`/`PATCH`/`DELETE` | `/api/accounts/:accountId` | `X-Action-Code` de uso único | detalhar, editar, desativar e excluir conta |
| `GET`/`POST` | `/api/accounts/:accountId/balance-snapshots` | `X-Action-Code` de uso único | histórico e registro de saldo informado |
| `GET`/`POST` | `/api/accounts/:accountId/pix-identifiers` | `X-Action-Code` de uso único | listar e cadastrar chaves PIX próprias |
| `GET`/`PATCH`/`DELETE` | `/api/accounts/:accountId/pix-identifiers/:pixIdentifierId` | `X-Action-Code` de uso único | detalhar, editar e remover uma chave |
| `GET` | `/api/health/live` | somente infraestrutura | healthcheck sem dados de aplicação |

Toda consulta do painel é escopada por `profileId`, resolvido no servidor por `getLocalProfileId()`. Sem perfil local, a resposta é `{ "hasProfile": false }` e a interface leva ao onboarding; nenhum zero é devolvido no lugar de um valor desconhecido.

`GET /api/dashboard` retorna o Saldo Livre de Risco, o saldo consolidado, o total comprometido no período, gastos e média diária do mês com a variação contra o mesmo intervalo do mês anterior, e as quantidades de contas com saldo conhecido e desconhecido, pendências e importações.

`GET /api/dashboard/categories` retorna as fatias de gasto do período, já ordenadas, com a cauda somada em `Outros` e os lançamentos sem categoria em uma fatia própria. A soma das fatias é sempre igual a `totalCents`.

**Valores monetários trafegam como centavos inteiros em `string`** — `BigInt` não é serializável em JSON — e são formatados apenas na renderização. O backend não devolve texto monetário formatado. Nenhum dos dois endpoints devolve transações individuais, descrições de lançamento ou conteúdo de arquivo.

As fórmulas e os critérios de cada indicador estão em [`DASHBOARD.md`](./DASHBOARD.md), Parte 5.

### Rotas de tendência

`GET /api/dashboard/risk-free-balance` devolve a decomposição do veredito —
saldo, comprometido e a diferença — mais a projeção diária até o fim do período
e as obrigações que a compõem. `shortfallDay` é o primeiro dia em que o saldo
projetado fica negativo, ou `null`.

**Renda futura prevista não entra na projeção.** Incorporá-la deixaria de ser
Saldo Livre de Risco e viraria previsão. Obrigação já vencida antes da janela é
ancorada no primeiro dia, em vez de omitida: ela continua devendo, e escondê-la
deixaria a projeção otimista.

`GET /api/dashboard/cash-flow` devolve entradas e saídas por mês civil. A regra
que governa a rota é de honestidade, não de estética:

| Situação do mês | Resposta |
| --- | --- |
| sem extrato importado | **não é devolvido** |
| com extrato cobrindo o mês inteiro | devolvido com `coverage: "full"` |
| com extrato cobrindo parte do mês | devolvido com `coverage: "partial"` |
| coberto, sem nenhum lançamento | devolvido com zeros — aí o zero é fato |

Sem nenhum lote com período conhecido, a resposta traz `months: []` e
`coverageRanges: 0`. **Série vazia é diferente de série de zeros**: a primeira
diz "não sei", a segunda afirmaria que não houve movimento.

### Importação de extrato

O fluxo tem dois passos, e só o segundo escreve.

`POST /api/imports/inspect` recebe o arquivo em `multipart/form-data` no campo
`file`, opcionalmente com `mapping` e `dialect` em JSON. Ele **não persiste
nada**: devolve formato, codificação, dialeto detectado, papel proposto de cada
coluna, período coberto, saldo de fechamento, prévia dos primeiros lançamentos,
problemas por linha, impressão digital e as contas disponíveis. É seguro chamar
quantas vezes for preciso enquanto a pessoa ajusta o mapeamento.

`POST /api/imports` recebe os mesmos campos mais `accountId` e grava o lote
inteiro em uma única transação SQLite: `ImportBatch`, `ImportFile`, as
`Transaction` novas, os `ImportIssue` e o `BalanceSnapshot` do saldo final.
Responde `201` com as contagens de lidos, gravados e duplicados.

O formato é decidido pelo **conteúdo**, nunca pela extensão ou pelo
`Content-Type` declarado. O conteúdo do extrato não é retido: `ImportFile`
guarda nome sanitizado, tamanho, tipo, codificação e o SHA-256 do texto
normalizado.

Deduplicação em dois níveis:

| Situação | Controle | Resposta |
| --- | --- | --- |
| mesmo arquivo reenviado | `ImportBatch.fingerprint` único por perfil | `409 DUPLICATE_BATCH` |
| extratos com período sobreposto | `Transaction.externalId` único por conta | `201`, com `duplicateCount` |

Sem identificador de origem no arquivo, a comparação usa dia civil, valor e
descrição, consumindo uma ocorrência por vez — dois lançamentos idênticos e
legítimos no mesmo dia continuam sendo dois.

`DELETE /api/imports/:importBatchId` desfaz o lote: remove os lançamentos que
nasceram dele e o saldo que ele registrou, sem afetar outros lotes.

#### Mapeamento de colunas reutilizável

A inspeção devolve `headerSignature`, calculada sobre os rótulos das colunas
normalizados. Ela identifica o **formato**, não o conteúdo: dois extratos do
mesmo banco em meses diferentes têm impressões digitais distintas e a mesma
assinatura.

Quando a assinatura casa com um `CsvMappingProfile` do perfil, a inspeção
reaplica o mapeamento salvo e responde `mappingSource: "salvo"` junto do nome
do mapeamento, para que a tela declare o reaproveitamento em vez de aplicá-lo
em silêncio. Os valores possíveis são `inferido`, `salvo` e `informado`.

`POST /api/imports` aceita `rememberMapping=true` no multipart e então grava ou
atualiza o mapeamento para aquele layout. A gravação acontece **fora** da
transação do lote: guardar o mapeamento é conveniência, e falhar nisso não pode
desfazer uma importação que já está correta.

O mapeamento guarda apenas separador, cabeçalho, separador decimal e o papel de
cada coluna. Nenhum valor, lançamento ou trecho do extrato é retido.

### Contas, saldos e chaves PIX

Duas exclusões são **recusadas** em vez de executadas, porque a chave estrangeira
faria estrago silencioso:

| Situação | Chave estrangeira | Resposta |
| --- | --- | --- |
| conta com lançamentos ou lotes | `Transaction` é `CASCADE` | `409 ACCOUNT_HAS_HISTORY` — desative em vez de excluir |
| instituição com contas | `Account.institutionId` é `SET NULL` | `409 INSTITUTION_HAS_ACCOUNTS` — as contas ficariam órfãs |

Desativar (`PATCH` com `isActive: false`) tira a conta dos totais do painel e
preserva todo o histórico. É a operação que substitui a exclusão quando existe
passado.

Trocar a moeda de uma conta que já tem lançamentos responde
`409 ACCOUNT_CURRENCY_LOCKED`: os centavos gravados continuariam iguais e
passariam a significar outra coisa.

Cada saldo é um **fato datado**, nunca uma sobrescrita: `POST` em
`balance-snapshots` acrescenta um registro, e o painel soma o mais recente com
os lançamentos posteriores a ele. A resposta distingue saldo informado à mão de
saldo vindo de extrato, por `fromImport`.

#### Chaves PIX

Existem só para reconhecer transferência entre contas da própria pessoa. O
contrato nunca devolve o valor em claro nem o texto cifrado numa listagem —
apenas `maskedValue`. O valor só sai em `GET` do item com `?reveal=1`, que é
pedido explícito e responde `no-store` como todas as rotas privadas.

A unicidade é por perfil e usa o índice HMAC do valor normalizado, então a mesma
chave escrita de formas diferentes — `111.444.777-35` e `11144477735` — é
reconhecida como repetida e responde `409 PIX_KEY_ALREADY_REGISTERED`. O valor
da chave não é editável: mudá-lo trocaria o índice e o histórico de pareamento
deixaria de fazer sentido; para outra chave, cadastre outra e desative a antiga,
que continua explicando extratos antigos.

A construção criptográfica e seus limites estão em
[`decisions/0003-chave-local-do-dispositivo.md`](./decisions/0003-chave-local-do-dispositivo.md).

### Vinculação do código de ação e query string

O código é vinculado a **método e caminho**, sem a query. Ele identifica o
contrato (`GET /api/transactions`), não os valores do filtro.

A razão é de correção, não de conveniência: o backend valida o código contra o
`pathname` da requisição, então amarrar o código à URL inteira faria toda
listagem filtrada falhar. E não afrouxa a proteção — o código existe contra
repetição, enquanto filtro, propriedade e escopo por `profileId` continuam
validados no backend a cada requisição. Cliente e backend aplicam a mesma regra
em `actionCodePath` e `requireActionCode`.

O armazenamento atual dos códigos é em memória e serve somente ao backend local de processo único. Antes de execução distribuída, deverá ser substituído por mecanismo atômico apropriado ao provedor.

A chamada manual validada segue: emitir código para `GET /api/system/status`, enviar em `X-Action-Code` e receber `403` ao tentar reutilizar o mesmo valor.

## Separação

### API local

Route Handlers do Next.js atendem apenas a interface executada no mesmo dispositivo. Eles orquestram casos de uso e acesso local ao Prisma.

### API de borda

Cloudflare Workers atendem autenticação, metadados de conta, releases, feedback e notícias. A API de borda não recebe extratos, transações, saldos ou carteira em claro.

### Regra frontend-backend

Toda ação e consulta originada no browser ou renderer chama um contrato de backend. Frontends não importam cliente Prisma/D1 nem usam bindings Cloudflare. Até feedback público passa pela API para manter moderação, paginação e cache controlados.

### Código efêmero de ação

Antes de cada requisição funcional, o frontend solicita um código em `POST /api/action-codes`. Essa rota de bootstrap é a única exceção à própria regra. O backend gera um valor criptograficamente aleatório, opaco, de uso único, vinculado ao método, rota e contexto de sessão/origem, com TTL inicial máximo de 60 segundos.

A requisição funcional envia o código em `X-Action-Code`. O backend consome o registro de modo atômico antes de executar o caso de uso; código ausente, expirado, reutilizado ou vinculado a outro contrato retorna erro seguro. O valor não contém `userId`, e-mail, IP ou significado de negócio, não aparece em URL/log/analytics e é removido após consumo ou expiração.

Esse mecanismo reduz replay e vincula a intenção à chamada, mas não substitui sessão, access token, autorização, CSRF, idempotency key, validação ou rate limit.

## Convenções

- JSON em UTF-8, salvo upload binário explicitamente documentado;
- validação de entrada no limite com Zod ou equivalente;
- IDs opacos, nunca sequenciais quando expostos;
- datas e instantes em ISO 8601; moeda em código ISO 4217;
- valores monetários em unidade inteira de menor valor;
- erros com código estável, mensagem segura e identificador de correlação não sensível;
- paginação por cursor para coleções extensas;
- idempotência em importações, backups e operações repetíveis;
- nenhuma resposta inclui stack trace em produção.

## Rotas locais candidatas

### Conciliação implementada

| Método | Rota | Caso de uso |
| --- | --- | --- |
| `GET` | `/api/reconciliation-items` | listar até 100 pendências do perfil |
| `GET` | `/api/reconciliation-items/:id` | consultar lançamento, categorias e decisões |
| `POST` | `/api/reconciliation-items/:id/decisions` | confirmar, categorizar, ajustar ou parear transferência |
| `POST` | `/api/reconciliation-decisions/:id/revert` | restaurar o estado anterior e reabrir a pendência |

Valores monetários entram e saem como strings de centavos inteiros. Toda rota valida o código opaco de ação e o perfil local.

### Histórico local implementado

`GET /api/timeline-events` lista eventos redigidos, com filtro opcional `kind` e cursor. `POST /api/timeline-events/:id/revert` restaura importações, revisões ou conciliações pelo caso de uso original. A resposta nunca inclui snapshots, conteúdo de arquivo, chaves, hashes ou códigos de ação.

| Método | Rota | Caso de uso |
| --- | --- | --- |
| `PATCH` | `/api/transactions/:id` | corrigir classificação ou metadados |
| `GET` | `/api/categories` | listar categorias do perfil |
| `POST` | `/api/reconciliations/:id/resolve` | concluir uma pendência |
| `POST` | `/api/portfolio/contribution-simulation` | simular aporte por pilares |
| `GET` | `/api/timeline` | consultar eventos locais |

As rotas finais devem nascer junto dos casos de uso e testes; esta tabela não autoriza scaffolding vazio.

## Rotas de borda candidatas

| Método | Rota | Dados permitidos |
| --- | --- | --- |
| `POST` | `/auth/exchange` | código OAuth e prova do cliente |
| `GET` | `/news` | filtros públicos e ativos minimizados, quando necessário |
| `POST` | `/summaries` | conteúdo público da notícia |

## Web, autenticação, download e feedback

As rotas de autenticação, perfil, releases e concessões estão implementadas no Worker e são consumidas exclusivamente pelo BFF em `apps/web`. A validação ponta a ponta permanece dependente da configuração dos segredos e do cliente OAuth no ambiente publicado.

| Método | Rota | Acesso | Proteção adicional |
| --- | --- | --- | --- |
| `POST` | `/api/action-codes` | público ou autenticado | bootstrap, rate limit e vínculo ao contrato pretendido |
| `POST` | `/api/auth/start` | público | rate limit por IP/dispositivo |
| `GET` | `/api/auth/callback` | transação OAuth | uso único e limite por transação/IP |
| `POST` | `/api/auth/refresh` | refresh válido | rotação e limite por sessão/família |
| `POST` | `/api/auth/logout` | autenticado | CSRF |
| `GET` | `/api/me` | autenticado | `no-store` |
| `GET` | `/api/releases` | autenticado | cache privado |
| `POST` | `/api/releases/:releaseId/download-grants` | autenticado | limite estrito por usuário |
| `GET` | `/api/feedback/posts` | público | paginação e limite por IP |
| `POST` | `/api/feedback/posts` | autenticado | limite baixo + antispam |
| `GET` | `/api/feedback/posts/:postId` | público | somente conteúdo publicado |
| `PATCH` | `/api/feedback/posts/:postId` | autor/moderador | propriedade validada no backend |
| `DELETE` | `/api/feedback/posts/:postId` | autor/moderador | tombstone e auditoria |
| `POST` | `/api/feedback/posts/:postId/comments` | autenticado | limite baixo + antispam |
| `PATCH` | `/api/feedback/comments/:commentId` | autor/moderador | propriedade no backend |
| `DELETE` | `/api/feedback/comments/:commentId` | autor/moderador | tombstone e auditoria |
| `PUT/DELETE` | `/api/feedback/posts/:postId/vote` | autenticado | unicidade e limite anti-bot |
| `PUT/DELETE` | `/api/feedback/comments/:commentId/vote` | autenticado | unicidade e limite anti-bot |
| `POST` | `/api/feedback/reports` | autenticado | limite muito baixo |

Valores exatos de rate limit são calibrados com telemetria e versionados. Escrita usa idempotency key quando uma repetição de rede puder duplicar dados. Listagens retornam perfil público mínimo, nunca e-mail, subject OAuth, IP ou IDs de sessão.

## Formato de erro

```json
{
  "error": {
    "code": "IMPORT_UNSUPPORTED_FORMAT",
    "message": "O formato do arquivo não é compatível.",
    "requestId": "req_exemplo"
  }
}
```

Mensagens públicas não devem incluir caminhos locais, consultas SQL, nomes internos, tokens ou conteúdo do documento importado.
