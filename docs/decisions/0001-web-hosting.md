# ADR 0001 — Hospedagem da aplicação web

- Status: aceita com validação de isolamento do deploy
- Data: 2026-09-05

## Contexto

A web possui OAuth/OIDC, cadastro, sessão, comunidade pública, página protegida, rate limiting, banco e links assinados para instaladores.

## Opções

### Cloudflare Pages

Adequada se a LP for exportada estaticamente e todo backend ficar em outro serviço. Isso separa implantação e observabilidade sem benefício claro para o fluxo atual.

### Cloudflare Workers

Integra Workers, D1, Turnstile e WAF. Para novo Next.js full-stack, a rota atualmente recomendada pela Cloudflare usa vinext, ainda beta; por isso a interface ficará na Vercel.

### Vercel

É o caminho mais direto para recursos nativos do Next.js e reduz risco de incompatibilidade. Rate limit, banco e object storage precisam ser definidos e podem envolver produtos adicionais.

## Decisão

Usar **Vercel somente para a LP em `talentum.vercel.app` e seu BFF mínimo de sessão**. Usar Cloudflare Workers para o backend, D1 para dados cloud estruturados e GitHub Releases para instaladores. Cloudflare Pages e R2 não serão usados.

Nenhum código do Electron, backend local, Prisma/SQLite, parser ou domínio financeiro pode entrar no contexto de build/deploy da Vercel. A separação deve ser garantida por projeto/repositório isolado ou pacote de deploy criado por allowlist e verificado no CI. Apenas o pipeline autorizado produz os instaladores Windows/Linux e os publica em GitHub Releases.

O BFF é necessário porque, sem domínio próprio, `talentum.vercel.app` e `workers.dev` não compartilham cookies first-party. Ele limita-se a manter sessão web, obter códigos efêmeros e encaminhar contratos permitidos ao Worker; não contém domínio financeiro nem persistência própria.

## Critérios do spike

1. OAuth completo com PKCE e cookie first-party seguro no BFF;
2. `/downloads` protegida, SSR e sem cache público;
3. migrações D1 reproduzíveis;
4. publicação de instaladores assinados em GitHub Releases e metadados no D1;
5. rate limit distribuído e Turnstile no servidor;
6. CRUD, votação e moderação de feedback;
7. logs, métricas, tracing e rollback;
8. preview por pull request, custo e limites documentados.
9. manifesto/checagem CI prova que somente LP e BFF entram no deploy Vercel;
10. concessões temporárias são registradas no D1 antes de a LP retornar o artefato público.

## Consequência

O frontend pode mudar de provedor sem mover o sistema desktop. Domínio e contratos não dependem diretamente de bindings Cloudflare; adaptadores isolam o D1. Se houver domínio próprio no futuro, a necessidade do BFF deve ser reavaliada.
