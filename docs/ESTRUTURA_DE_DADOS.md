# Estrutura de dados para escala

## 1. Finalidade e autoridade

Aplicar este documento ao criar ou alterar persistência, migrations, consultas, filas, caches, backups e contratos de dados do Talentum.

Tratar `1.000.000 de usuários` como capacidade de cadastro, não como estimativa de simultaneidade. Dimensionar infraestrutura somente depois de registrar usuários ativos, pico de requisições por segundo, proporção de leitura/escrita, volume por entidade, latência-alvo e retenção.

Não adotar sharding, NoSQL, replicação, cache distribuído ou microsserviços apenas por causa do número de cadastros. Aplicar cada mecanismo somente após medição demonstrar o gargalo correspondente.

## 2. Fixar os limites de dados

### 2.1 Dados locais

Manter exclusivamente no SQLite do dispositivo:

- instituições, contas e identificadores PIX;
- saldos e snapshots;
- extratos, arquivos importados e diagnósticos;
- transações, categorias e regras;
- rendas, obrigações, cartões e faturas;
- patrimônio, ativos, metas e aportes;
- histórico financeiro e backups locais.

Não criar uma linha cloud por transação financeira. Um milhão de usuários deve resultar em um milhão de bancos locais independentes, e não em um banco financeiro central com todos os extratos.

### 2.2 Dados cloud

Manter no D1 somente:

- identidade mínima e perfil público;
- provedores OAuth e consentimentos;
- sessões e famílias de refresh token armazenadas como hash;
- releases, artefatos, checksums e concessões de download;
- feedback, comentários, curtidas, denúncias e moderação;
- eventos de auditoria redigidos;
- metadados estritamente necessários de recursos futuros aprovados.

Proibir saldos, extratos, transações, carteira, chaves de decifragem e identificadores bancários no D1.

## 3. Registrar o perfil de carga antes do schema

Criar `docs/capacity/<data>.md` antes de aprovar uma macrofeature persistente. Registrar:

| Campo obrigatório | Unidade |
| --- | --- |
| usuários cadastrados | total |
| usuários ativos mensais e diários | MAU/DAU |
| concorrência de pico | requisições simultâneas |
| tráfego de pico por operação | RPS de leitura e escrita |
| crescimento por tabela | linhas/dia e bytes/dia |
| latência-alvo | p50, p95 e p99 |
| disponibilidade e perda aceitável | SLO, RTO e RPO |
| retenção | dias/anos por classe |

Usar teste de carga com distribuição realista. Não extrapolar capacidade a partir de uma consulta isolada.

## 4. Definir propriedade e isolamento

Classificar cada tabela como `local`, `cloud-global`, `cloud-user` ou `cloud-public`.

Para toda tabela cloud pertencente a uma pessoa:

1. incluir `userId` ou relação equivalente verificável;
2. derivar o usuário da identidade validada no servidor;
3. incluir o escopo do usuário na consulta;
4. rejeitar IDs pertencentes a outro usuário;
5. incluir o escopo em chaves de cache, jobs e rate limits;
6. testar acessos cruzados negativos.

Não tratar ID opaco como autorização. A OWASP exige isolamento verificável por tenant/usuário e alerta que IDs difíceis de enumerar são apenas defesa adicional ([OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)).

## 5. Modelar por domínio e relação

Criar uma tabela por responsabilidade durável. Não acumular autenticação, perfil, sessão, feedback e auditoria em uma tabela genérica.

Aplicar:

- `id` opaco em toda tabela, inclusive associativas;
- foreign keys `...Id` para todas as relações;
- `createdAt` e `updatedAt` quando houver ciclo de vida;
- `deletedAt` somente quando exclusão lógica for exigida;
- `version` para optimistic concurrency em registros sujeitos a edição concorrente;
- constraints `NOT NULL`, `UNIQUE`, `CHECK` e foreign keys no banco;
- centavos inteiros para dinheiro;
- instantes em UTC e datas civis separadas quando o domínio exigir;
- estados finitos validados no backend e restringidos no banco quando seguro.

Normalizar até eliminar duplicação que possa produzir inconsistência. Desnormalizar somente quando uma medição mostrar que a consulta normalizada viola o SLO e houver processo definido de reconstrução.

## 6. Padronizar identificadores

Gerar IDs no backend. Usar formato opaco, não sequencial publicamente e independente do provedor.

Preferir UUIDv7 ou ULID quando ordenação temporal e localidade de índice forem úteis. Não expor `ROWID`, contador global ou significado de negócio no ID.

Manter identificadores externos em colunas próprias com constraint composta, por exemplo `(provider, providerSubject)`. Nunca substituir o `id` interno pelo identificador mutável de um provedor.

## 7. Executar mudanças somente por migrations

Guardar DDL em migrations SQL versionadas. Cloudflare D1 também define migrations como arquivos SQL sequenciais versionados ([D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)).

Aplicar a ordem:

1. gerar migration com nome e escopo únicos;
2. revisar DDL, constraints, índices e impacto de locks;
3. aplicar em banco vazio;
4. aplicar sobre uma cópia representativa da versão anterior;
5. executar testes de integridade e consultas críticas;
6. registrar tempo, linhas tocadas e espaço adicional;
7. criar backup antes de migration destrutiva;
8. aplicar com `migrate deploy`;
9. verificar saúde e compatibilidade da aplicação;
10. manter rollback operacional ou procedimento de restauração.

Usar o padrão expand/contract para mudanças incompatíveis:

1. adicionar estrutura nova compatível;
2. publicar código que escreve nos formatos antigo e novo quando necessário;
3. migrar dados em lotes limitados;
4. mudar leituras para a estrutura nova;
5. confirmar métricas e consistência;
6. remover estrutura antiga em migration posterior.

Não executar `CREATE TABLE`, `ALTER TABLE` ou `CREATE INDEX` no hot path. A documentação do D1 determina que alterações de schema sejam executadas uma vez por migrations ([D1: Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)).

## 8. Projetar índices a partir das consultas

Para cada endpoint, documentar antes da migration:

- predicados `WHERE`;
- colunas de join;
- ordenação;
- paginação;
- cardinalidade estimada;
- linhas lidas e retornadas esperadas.

Criar índices para:

- foreign keys usadas em joins;
- lookup por identidade;
- unicidade de negócio;
- consultas frequentes por `(ownerId, createdAt)`;
- filas por `(status, createdAt)`;
- relações associativas nos dois sentidos quando ambos forem consultados.

Ordenar índices compostos conforme os predicados reais e a regra do prefixo à esquerda. Não criar um índice por coluna indiscriminadamente. Índices aceleram leituras, mas aumentam escrita e armazenamento ([PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html), [D1: Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)).

Executar `EXPLAIN QUERY PLAN` no SQLite/D1 e `EXPLAIN (ANALYZE, BUFFERS)` caso um workload seja migrado para PostgreSQL. Bloquear release quando consulta crítica fizer full scan sem justificativa.

## 9. Padronizar consultas do backend

Aplicar em toda consulta:

1. validar entrada com schema;
2. validar identidade, propriedade e permissão;
3. exigir código temporário vinculado ao método e rota;
4. selecionar apenas colunas necessárias;
5. limitar quantidade de linhas;
6. usar cursor opaco, não `OFFSET`, em coleções grandes;
7. definir ordenação determinística com desempate por `id`;
8. impor timeout e tamanho máximo de resposta;
9. executar alterações relacionadas em transação;
10. retornar DTO, nunca o modelo integral do ORM.

Proibir N+1. Carregar relações em lote ou com joins controlados. Não permitir filtro arbitrário, nome de coluna ou ordenação enviados diretamente pelo cliente.

## 10. Controlar concorrência e idempotência

Exigir chave de idempotência para importações, concessões de download, criação de posts e demais comandos repetíveis por falha de rede.

Aplicar:

- constraint única para a chave no escopo correto;
- transação curta;
- optimistic concurrency por `version` ou `updatedAt` quando houver edição concorrente;
- outbox transacional antes de publicar evento assíncrono;
- consumidor idempotente com registro de processamento;
- retry somente para erros transitórios e com backoff/jitter.

Não manter transação aberta enquanto chama rede, IA, e-mail ou armazenamento externo.

## 11. Separar o plano local do plano cloud

### 11.1 SQLite local

Aplicar migrations ao abrir uma versão nova do backend local. Ativar e validar foreign keys. Usar transação para importar lote completo. Manter um writer por banco e limitar concorrência de escrita.

Usar WAL somente após teste de compatibilidade com empacotamento, backup e recuperação. O próprio Fábio Akita destaca que banco de dados exige entender índices, B-trees, log transacional e persistência, e não apenas decorar comandos ([Akitando #118](https://master--akitaonrails-official.netlify.app/2022/05/09/akitando-118-fiz-um-servidor-de-sql-entendendo-banco-de-dados/)).

### 11.2 D1 cloud

Começar com banco compartilhado e tabelas normalizadas para identidade, releases e feedback. Indexar todas as consultas por `userId`, estado e tempo conforme o acesso.

Considerar os limites atuais do D1:

- cada banco possui limite de 10 GB;
- cada banco processa consultas de forma serial;
- throughput depende diretamente da duração das consultas;
- alterações massivas devem ser divididas em lotes;
- o serviço foi desenhado para escalar horizontalmente com bancos menores por tenant ou entidade quando necessário.

Esses limites são definidos pela documentação oficial ([D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/)). Não colocar todos os eventos de alto volume em um único banco sem teste de carga.

Separar bancos D1 por domínio somente quando medição justificar:

- `identity`: usuários, OAuth, sessões e consentimentos;
- `distribution`: releases, artefatos e concessões;
- `community`: feedback, comentários, curtidas e moderação;
- `audit`: eventos redigidos, se volume e retenção exigirem separação.

Não executar join entre bancos. Duplicar somente identificadores mínimos e aceitar consistência eventual documentada entre domínios.

## 12. Escalar em ordem, nunca por antecipação

Aplicar esta sequência:

1. corrigir consulta e reduzir colunas/linhas;
2. criar ou ajustar índice comprovado por plano;
3. eliminar N+1 e trabalho duplicado;
4. agrupar escritas compatíveis;
5. impor paginação e limites;
6. adicionar cache somente a leitura estável e frequente;
7. mover trabalho não interativo para fila;
8. adicionar réplica de leitura quando o provedor e a consistência permitirem;
9. separar banco por domínio;
10. particionar ou fazer shard somente com chave, roteamento e operação comprovados.

Fábio Akita recomenda compreender primeiro SQL, índices e o workload e apresenta cache, jobs assíncronos e réplicas como respostas a gargalos concretos, não como ponto de partida ([Akitando #133](https://akitaonrails.com/2022/12/12/akitando-133-tornando-sua-app-web-mais-rapida-4-tecnicas-de-otimizacao/)). Em sua discussão sobre SQL, SQLite, NoSQL e Big Data, a escolha do banco depende do problema e das garantias requeridas ([Akitando #143](https://akitaonrails.com/2023/07/22/akitando-143-discutindo-sobre-banco-de-dados-dos-primordios-a-big-data)).

PostgreSQL deve ser considerado como alternativa futura quando o workload cloud relacional superar os limites operacionais do D1. Replicação, failover e leitura em standby possuem custos de consistência e desempenho documentados pelo PostgreSQL ([High Availability](https://www.postgresql.org/docs/current/high-availability.html)). Particionamento só deve ser aplicado a tabelas comprovadamente grandes e com chave de acesso compatível ([Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)).

## 13. Aplicar cache com isolamento

Criar cache apenas depois de medir taxa de acerto potencial e custo da consulta.

Toda chave deve incluir:

- versão do contrato;
- usuário/tenant quando o resultado for privado;
- recurso e ID;
- filtros normalizados;
- versão ou janela temporal.

Definir TTL, invalidação, tamanho máximo e comportamento de falha. Nunca armazenar access token, refresh token, arquivo financeiro ou resposta sensível em cache compartilhado.

## 14. Definir retenção, exclusão e auditoria

Para cada tabela, registrar:

- finalidade;
- base legal/consentimento quando aplicável;
- prazo de retenção;
- evento de exclusão;
- dependências e cascatas;
- campos permitidos em auditoria;
- procedimento de exportação.

Separar dado operacional de evento de auditoria. Não copiar payload completo para logs. Usar tombstone somente quando for necessário preservar integridade ou moderação.

## 15. Garantir backup e restauração

Definir RPO e RTO por classe de dados. Backup sem teste de restauração não conta como controle.

Executar:

1. backup automático antes de migration destrutiva;
2. checksum e versão do schema;
3. cifragem com chave fora do arquivo;
4. restauração automatizada em ambiente isolado;
5. verificação de foreign keys e contagens;
6. teste periódico de desastre;
7. registro de duração versus RTO.

## 16. Medir operação e custo

Coletar sem payload financeiro:

- latência p50/p95/p99 por rota e consulta;
- taxa de erro, timeout, retry e overload;
- linhas lidas, escritas e retornadas;
- tamanho de tabelas e índices;
- consultas lentas e planos;
- profundidade e idade de filas;
- taxa de acerto de cache;
- conexões/pool quando aplicável;
- tempo de migration e backup;
- falhas de isolamento e autorização.

No PostgreSQL futuro, manter autovacuum e observar dead tuples; updates e deletes deixam versões antigas até `VACUUM` ([PostgreSQL VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html)).

## 17. Gatilhos formais de evolução

| Mudança | Autorizar somente quando |
| --- | --- |
| novo índice | plano e telemetria mostram scan/custo recorrente |
| cache | leitura é frequente, estável e domina latência/custo |
| fila | trabalho pode aceitar processamento assíncrono e retry idempotente |
| réplica de leitura | leituras saturam o primário e toleram defasagem definida |
| banco D1 separado | domínio possui volume, retenção ou disponibilidade independente |
| PostgreSQL | limites de tamanho, serialização ou consultas relacionais do D1 foram comprovadamente atingidos |
| particionamento | tabela excede capacidade prática de índice/manutenção e consultas permitem pruning |
| sharding | um writer/banco continua insuficiente após otimização e existe chave de shard estável |
| NoSQL | agregado e padrão de acesso exigem garantias que o relacional não entrega de forma sustentável |

## 18. Checklist de aprovação de tabela

Não aprovar uma migration nova sem confirmar:

- [ ] propriedade `local`, `cloud-global`, `cloud-user` ou `cloud-public`;
- [ ] finalidade e retenção documentadas;
- [ ] `id` e foreign keys definidos;
- [ ] constraints de integridade no banco;
- [ ] consultas e endpoints consumidores conhecidos;
- [ ] índices derivados dessas consultas;
- [ ] autorização e isolamento testados;
- [ ] paginação e limites definidos;
- [ ] estratégia de exclusão e cascata revisada;
- [ ] migration testada em banco vazio e na versão anterior;
- [ ] backup/rollback definidos quando houver risco destrutivo;
- [ ] logs e auditoria sem dados proibidos;
- [ ] documentação e diagrama atualizados.

## 19. Critério de prontidão para um milhão de usuários

Não declarar prontidão apenas porque o schema aceita um milhão de linhas. Exigir:

1. perfil de carga aprovado;
2. teste progressivo com 10 mil, 100 mil e 1 milhão de identidades sintéticas;
3. teste de pico com margem mínima definida no plano de capacidade;
4. p95 e p99 dentro do SLO;
5. ausência de full scans em rotas críticas;
6. isolamento entre usuários comprovado por testes negativos;
7. migrations dentro da janela operacional;
8. backup e restauração dentro de RPO/RTO;
9. rate limits e filas impedindo que um usuário esgote recursos compartilhados;
10. runbook de overload, indisponibilidade, corrupção e rollback exercitado.

## 20. Fontes normativas consultadas

- [Cloudflare D1: Best practices](https://developers.cloudflare.com/d1/best-practices/)
- [Cloudflare D1: Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [Cloudflare D1: FAQ e limites](https://developers.cloudflare.com/d1/reference/faq/)
- [Cloudflare D1: Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [PostgreSQL: Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL: Table partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [PostgreSQL: High availability, load balancing and replication](https://www.postgresql.org/docs/current/high-availability.html)
- [PostgreSQL: VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html)
- [OWASP: Multi-Tenant Application Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [AWS: Scaling beyond one million users](https://aws.amazon.com/blogs/startups/scaling-on-aws-part-4-one-million-users/)
- [AWS: Relational database scaling patterns for SaaS](https://aws.amazon.com/blogs/database/scale-your-relational-database-for-saas-part-1-common-scaling-patterns/)
- [Fábio Akita: Akitando #118 — Entendendo banco de dados](https://master--akitaonrails-official.netlify.app/2022/05/09/akitando-118-fiz-um-servidor-de-sql-entendendo-banco-de-dados/)
- [Fábio Akita: Akitando #133 — Tornando sua app web mais rápida](https://akitaonrails.com/2022/12/12/akitando-133-tornando-sua-app-web-mais-rapida-4-tecnicas-de-otimizacao/)
- [Fábio Akita: Akitando #143 — Bancos de dados a Big Data](https://akitaonrails.com/2023/07/22/akitando-143-discutindo-sobre-banco-de-dados-dos-primordios-a-big-data)
