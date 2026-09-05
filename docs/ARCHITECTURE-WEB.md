# Arquitetura web

## Escopo

A web entrega a landing page pública, autentica/cadastra o usuário e, após validação no backend, libera downloads para Windows e Linux. Usuários autenticados também participam da comunidade pública de feedback.

## Fluxo de cadastro e download

```mermaid
sequenceDiagram
    actor U as Usuário
    participant F as Frontend
    participant B as Backend Cloudflare
    participant O as OAuth/OIDC
    participant D as D1
    participant R as R2
    U->>F: acessa LP
    F->>B: inicia cadastro/login
    B->>O: Authorization Code + PKCE
    O-->>B: callback
    B->>B: valida state, nonce, PKCE e identidade
    B->>D: usuário e sessão relacionados por ID
    B-->>F: cookie seguro
    F->>B: solicita downloads
    B->>D: autoriza usuário e release
    B->>R: gera link curto e assinado
    B-->>F: Windows e Linux
```

## Fluxo de feedback

```mermaid
flowchart LR
    UI[Aba Feedback] -->|HTTPS| API[Worker API]
    API --> AUTH[Autenticação e autorização]
    API --> LIMIT[Rate limit e antispam]
    API --> D1[(D1)]
    API --> MOD[Moderação e auditoria]
```

Todos podem ler conteúdo com estado `PUBLISHED`. Criar post, comentar, curtir e denunciar exige sessão. O backend aplica propriedade, moderação, limites e sanitização; o frontend nunca escreve no D1 diretamente.

## Componentes

- **Frontend:** páginas públicas/protegidas; nenhum segredo, cliente de banco ou decisão de autorização.
- **Worker:** OAuth/OIDC, sessão, comunidade, rate limit, auditoria e emissão de downloads.
- **D1:** identidade mínima, sessões, feedback e metadados.
- **R2:** instaladores assinados e anexos futuros aprovados; nenhum upload de feedback no MVP.
- **Borda:** TLS, WAF, Turnstile e cabeçalhos de segurança.

## Implantação

Cloudflare Pages serve apenas um export estático. Como este fluxo exige backend, sessão, D1 e R2, a opção Cloudflare é **Workers**. Veja [`decisions/0001-web-hosting.md`](./decisions/0001-web-hosting.md).

## Critérios de aceite

- `/downloads` não abre sem sessão válida;
- frontend não contém segredos nem token persistente acessível a JavaScript;
- links de artefatos expiram e são auditados;
- conteúdo público de feedback nunca revela e-mail, token, IP ou identificador OAuth;
- ações da comunidade são autorizadas e limitadas no backend;
- respostas privadas usam `Cache-Control: no-store`.
