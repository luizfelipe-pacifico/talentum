# Configuração do Cloudflare Workers e D1

## Limite obrigatório entre os bancos

A migration [`prisma/migrations/20260905214010_mvp_financial_core/migration.sql`](../prisma/migrations/20260905214010_mvp_financial_core/migration.sql) pertence somente ao SQLite local do Electron. Ela contém instituições, contas, saldos, lotes de importação e transações e **não pode ser executada no D1**.

O D1 recebe exclusivamente as migrations de [`cloudflare/migrations`](../cloudflare/migrations). O navegador e o Electron nunca acessam o D1 diretamente: toda leitura ou escrita passa pela API do Worker.

## 1. Autenticar o Wrangler

Na raiz do repositório, execute:

```powershell
pnpm exec wrangler login
pnpm exec wrangler whoami
```

O primeiro comando abre a autorização da conta Cloudflare no navegador. O segundo deve exibir a conta autenticada.

## 2. Criar o banco D1 de produção

```powershell
pnpm exec wrangler d1 create talentum-cloud-production
```

Guarde o `database_id` retornado. O identificador do banco não é uma credencial, mas segredos e tokens nunca devem ser colocados no arquivo de configuração.

O D1 não oferece uma localização específica para a América do Sul. Deixe a Cloudflare escolher automaticamente a localização inicial. Só defina `--location` após medir a latência real e registrar a decisão arquitetural.

## 3. Criar a configuração ativa

```powershell
Copy-Item -LiteralPath cloudflare/wrangler.example.jsonc -Destination cloudflare/wrangler.jsonc
```

No arquivo `cloudflare/wrangler.jsonc`, substitua `COLE_AQUI_O_DATABASE_ID` pelo `database_id` obtido no passo anterior. Esse arquivo é versionado porque o ID do D1 não é secreto. O binding obrigatório é `DB`; o Worker acessa o banco somente por `env.DB`.

## 4. Preparar os segredos locais

```powershell
Copy-Item -LiteralPath cloudflare/.dev.vars.example -Destination cloudflare/.dev.vars
```

Gere três valores independentes, com pelo menos 32 bytes aleatórios, executando uma vez para cada variável:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

- `SESSION_SIGNING_SECRET`: assinatura e validação de sessão;
- `TOKEN_HASH_PEPPER`: proteção adicional dos hashes de tokens;
- `BFF_SHARED_SECRET`: autenticação entre o BFF da Vercel e o Worker.

`.dev.vars` é local, está no `.gitignore` e nunca deve ser commitado.

## 5. Aplicar e verificar a migration localmente

```powershell
pnpm run cloudflare:migrations:list:local
pnpm run cloudflare:migrations:apply:local
pnpm exec wrangler d1 execute talentum-cloud-production --local --config cloudflare/wrangler.jsonc --command "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
pnpm run cloudflare:dev
```

Em outro terminal, valide a conexão:

```powershell
Invoke-RestMethod http://localhost:8787/health
```

A resposta esperada contém `status: ok` e `service: talentum-cloud-api`.

## 6. Revisar e aplicar em produção

Sempre liste as migrations pendentes antes de modificar o banco remoto:

```powershell
pnpm run cloudflare:migrations:list:remote
pnpm run cloudflare:migrations:apply:remote
```

Não use `prisma db push` no D1 e não copie migrations da pasta `prisma/migrations` para `cloudflare/migrations`.

## 7. Cadastrar segredos remotos

Cadastre cada segredo de forma interativa; não passe o valor na linha de comando:

```powershell
pnpm exec wrangler secret put SESSION_SIGNING_SECRET --config cloudflare/wrangler.jsonc
pnpm exec wrangler secret put TOKEN_HASH_PEPPER --config cloudflare/wrangler.jsonc
pnpm exec wrangler secret put BFF_SHARED_SECRET --config cloudflare/wrangler.jsonc
```

O segredo do provedor OAuth deve ser cadastrado com `wrangler secret put`. O identificador público do cliente pode ser uma variável comum; o client secret deve permanecer secreto.

Para o fluxo Google atual, cadastre também `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Configure no cliente OAuth exatamente `https://talentum.vercel.app/api/auth/callback` como redirect de produção. A LP precisa de `CLOUDFLARE_API_BASE_URL` e `CLOUDFLARE_BFF_SHARED_SECRET` no runtime da Vercel.

## 8. Publicar e validar o Worker

```powershell
pnpm run cloudflare:deploy
```

O Wrangler retorna o endereço `workers.dev`. Valide `GET /health` nesse endereço e mantenha o endpoint sem informações de banco, conta ou versão de dependências.

### Deploy conectado ao GitHub

Ao criar o aplicativo a partir deste repositório no painel Cloudflare, selecione **Workers**, não Pages. Configure:

- diretório raiz: raiz do repositório;
- comando de build: `pnpm run cloudflare:build`;
- comando de deploy: `pnpm run cloudflare:deploy`;
- branch de produção: `main`.

Não use `pnpm run build` nesse aplicativo: esse comando compila o Next.js do produto local. Também não use `npx wrangler deploy` sem `--config`, pois o arquivo do Worker está no diretório `cloudflare`.

O arquivo `cloudflare/wrangler.jsonc` precisa existir no ambiente do pipeline e é versionado porque o ID do D1 não é secreto. `.dev.vars`, tokens de API e valores inseridos com `wrangler secret put` continuam proibidos no Git.

## 9. Conectar a LP/BFF da Vercel

Cadastre no projeto da LP na Vercel:

- `CLOUDFLARE_API_BASE_URL`: URL pública do Worker;
- `CLOUDFLARE_BFF_SHARED_SECRET`: exatamente o mesmo valor de `BFF_SHARED_SECRET`;
- variáveis públicas somente quando forem comprovadamente não confidenciais.

O BFF usa essas variáveis no runtime do servidor. Nenhuma delas recebe prefixo `NEXT_PUBLIC_`. A LP chama seu próprio BFF; o BFF chama o Worker; o Worker consulta o D1.

## 10. Fluxo de novas alterações do banco cloud

1. Criar uma nova migration SQL numerada em `cloudflare/migrations`.
2. Garantir que toda tabela tenha `id` opaco e que relações usem IDs e chaves estrangeiras.
3. Aplicar em banco local descartável.
4. Executar testes da API e revisar índices, constraints e rollback operacional.
5. Listar migrations remotas pendentes.
6. Aplicar no D1 remoto.
7. Publicar o Worker compatível com o novo schema.
8. Atualizar a documentação técnica no mesmo commit.

## Checklist de segurança antes de publicar

- nenhum dado financeiro, extrato, conta, saldo, transação ou chave Pix está no D1;
- nenhum token é persistido em texto puro; somente hash, expiração, consumo e revogação;
- cookies são `Secure`, `HttpOnly` e `SameSite` adequado ao fluxo do BFF;
- rotas privadas aplicam autenticação, autorização, rate limit e `Cache-Control: no-store`;
- códigos efêmeros possuem hash, TTL curto, uso único e não entram em auditoria ou analytics;
- CORS aceita somente origens explicitamente autorizadas;
- logs e eventos não contêm segredos, e-mail público, IP bruto ou conteúdo financeiro;
- migrations remotas são revisadas e aplicadas pelo backend, nunca pelo frontend.
