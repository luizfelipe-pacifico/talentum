# ADR 0001 — Hospedagem da aplicação web

- Status: proposta para validação
- Data: 2026-09-05

## Contexto

A web possui OAuth/OIDC, cadastro, sessão, comunidade pública, página protegida, rate limiting, banco e links assinados para instaladores.

## Opções

### Cloudflare Pages

Adequada se a LP for exportada estaticamente e todo backend ficar em outro serviço. Isso separa implantação e observabilidade sem benefício claro para o fluxo atual.

### Cloudflare Workers

Integra Workers, D1, R2, KV, Turnstile e WAF. É a opção recomendada para um spike. Para novo Next.js full-stack, a rota atualmente recomendada pela Cloudflare usa vinext, ainda beta; a compatibilidade precisa ser comprovada.

### Vercel

É o caminho mais direto para recursos nativos do Next.js e reduz risco de incompatibilidade. Rate limit, banco e object storage precisam ser definidos e podem envolver produtos adicionais.

## Decisão proposta

Usar **Cloudflare Workers, não Cloudflare Pages**, condicionado a um spike que valide App Router, Route Handlers, cookies, OAuth, D1/R2 e observabilidade. Se um requisito essencial depender de workaround frágil, adotar Vercel para web/backend.

## Critérios do spike

1. OAuth completo com PKCE e cookie seguro;
2. `/downloads` protegida, SSR e sem cache público;
3. migrações D1 reproduzíveis;
4. URL R2 curta e assinada;
5. rate limit distribuído e Turnstile no servidor;
6. CRUD, votação e moderação de feedback;
7. logs, métricas, tracing e rollback;
8. preview por pull request, custo e limites documentados.

## Consequência

A decisão permanece reversível até o spike. Domínio e contratos não dependem diretamente de bindings Cloudflare; adaptadores isolam D1, R2 e KV.
