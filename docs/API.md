# APIs do Talentum

## Escopo

Este documento mistura contratos atuais e planejados. As rotas marcadas como atuais existem no scaffold; rotas de negócio permanecem candidatas até sua implementação.

## Rotas locais atuais

| Método | Rota | Proteção | Finalidade |
| --- | --- | --- | --- |
| `POST` | `/api/action-codes` | bootstrap e validação Zod | emitir código de ação por 60 segundos |
| `GET` | `/api/system/status` | `X-Action-Code` de uso único | verificar comunicação frontend/API |
| `GET` | `/api/dashboard` | `X-Action-Code` de uso único | consultar indicadores calculados no SQLite local |

`GET /api/dashboard` retorna saldo consolidado, gastos e média diária do mês e quantidades de contas, transações, importações e pendências. A chamada solicita primeiro um código para o mesmo método e caminho em `POST /api/action-codes`. Valores monetários são calculados com `BigInt` em centavos e formatados no backend; o endpoint não devolve transações individuais nem conteúdo de arquivos.
| `GET` | `/api/health/live` | somente infraestrutura | healthcheck sem dados de aplicação |

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

| Método | Rota | Caso de uso |
| --- | --- | --- |
| `POST` | `/api/imports` | validar e iniciar importação local |
| `GET` | `/api/imports/:id` | consultar progresso e problemas |
| `GET` | `/api/transactions` | listar e filtrar transações |
| `PATCH` | `/api/transactions/:id` | corrigir classificação ou metadados |
| `POST` | `/api/reconciliations/:id/resolve` | concluir uma pendência |
| `GET` | `/api/dashboard` | obter projeções e saldo livre |
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
