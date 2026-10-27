# Autenticação, sessões e tokens

## Política

Web e Electron usam Authorization Code com PKCE S256. Implicit Grant e fluxo por senha do usuário são proibidos. Toda validação e autorização ocorre no backend.

## Estado atual da web

O fluxo Google da LP está implementado entre BFF e Worker: PKCE S256, `state`, `nonce`, assinatura RS256 via JWKS, access token opaco de 15 minutos e refresh token opaco rotativo de 30 dias. O BFF guarda ambos em cookies `HttpOnly`; reutilização de refresh revoga a família e a sessão. A operação em produção depende dos Worker Secrets e redirects cadastrados no provedor.

O `state` fica vinculado ao navegador que iniciou o login: `/api/auth/start` grava o hash do `state` no cookie `__Host-talentum-oauth-state` (10 minutos) e o callback só segue quando o `state` recebido corresponde a ele, o que impede CSRF de login. O refresh reivindica o token com `UPDATE … WHERE consumed_at IS NULL` antes de emitir o sucessor; numa corrida, a segunda tentativa é tratada como reúso e revoga a família. Cookies de sessão saem sempre com `Secure`, que o prefixo `__Host-` exige e que os navegadores aceitam em `http://localhost`. O logout apaga os cookies mesmo quando o Worker está indisponível. Origem de mutações e destino de redirecionamentos usam o `Host` acessado (`apps/web/src/server/site-url.ts`), não `request.url`.

## Credenciais

| Credencial | Duração | Web | Electron | Servidor |
| --- | --- | --- | --- | --- |
| Access token | curta, inicialmente 5–15 min | mantido no BFF ou cookie seguro conforme implementação | memória do backend local | claims mínimos |
| Refresh token | limitado por sessão | cookie `Secure`, `HttpOnly`, `SameSite` | cofre do SO | somente hash, família e estado |
| ID token | somente durante login | backend | backend local | não usar como sessão |
| `state`/`nonce`/PKCE | uma transação | vinculados ao user agent | memória/transação local | hash e expiração, se persistidos |

Refresh tokens são rotacionados a cada uso. Reúso de token anterior revoga a família e gera evento de segurança. Logout e mudança de risco revogam sessões.

## Validação obrigatória

- assinatura e algoritmo permitido;
- emissor, audiência, expiração e `nonce`;
- redirect URI por comparação exata;
- `state` único e vinculado ao cliente;
- PKCE S256 por transação;
- scopes mínimos e audience específica;
- bloqueio de open redirect;
- reautenticação para ações de alto risco.

## Web

- refresh token nunca entra em `localStorage` ou `sessionStorage`;
- cookie de host usa `Secure`, `HttpOnly`, `SameSite` e `Path` mínimo;
- toda mutação autenticada por cookie tem proteção CSRF;
- sessão é regenerada após login e mudança de privilégio;
- resposta privada usa `Cache-Control: no-store`;
- CORS tem allowlist exata e nunca reflete origem com credenciais.

## Electron

- abrir OAuth no navegador do sistema, nunca em `webview`;
- não embutir client secret;
- usar redirect loopback efêmero ou protocolo registrado e validado;
- guardar refresh token no credential vault; sem armazenamento seguro, desabilitar login persistente;
- renderer nunca recebe refresh token.

## Proteção contra abuso

Limites combinam IP, `userId`, `sessionId`, sinal de dispositivo e endpoint. Login, callback, refresh, criação de post, comentário, voto, denúncia e download possuem buckets próprios. Aplicar atraso progressivo, erros genéricos, detecção de credential stuffing e Turnstile após comportamento suspeito.
