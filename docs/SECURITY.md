# Security

This document is the normative security and privacy reference for Talentum. It covers the threat model, authentication and sessions, authorization and CSRF, action codes, rate limiting, CORS and response headers, Electron hardening, the local API boundary, secrets management, file and content handling, supply chain and release integrity, the controls that are verified by regression tests, and the offensive security review run before every commit and push. Financial features must not be distributed until their essential controls are implemented and tested. Statements carry the status labels defined in [README.md](README.md#status-labels). This document owns the mandatory [pre-commit and pre-push security gate](#mandatory-pre-commit-and-pre-push-security-gate) and the [incident response](#incident-response); `CLAUDE.md` makes them binding for AI agents and links here.

## Contents

- [Status conventions](#status-conventions)
- [Scope and protected data](#scope-and-protected-data)
- [Threat model](#threat-model)
- [Mandatory rules](#mandatory-rules)
- [Authentication](#authentication)
- [Authorization and CSRF](#authorization-and-csrf)
- [Action codes](#action-codes)
- [Rate limiting and abuse protection](#rate-limiting-and-abuse-protection)
- [CORS, response headers and CSP](#cors-response-headers-and-csp)
- [Electron hardening](#electron-hardening)
- [Local API boundary](#local-api-boundary)
- [Controls by environment](#controls-by-environment)
- [Secrets management](#secrets-management)
- [Files, AI and hostile content](#files-ai-and-hostile-content)
- [Feedback community](#feedback-community)
- [End-to-end encrypted backup](#end-to-end-encrypted-backup)
- [Vercel deployment isolation](#vercel-deployment-isolation)
- [Supply chain, CI and release integrity](#supply-chain-ci-and-release-integrity)
- [Verified controls and their tests](#verified-controls-and-their-tests)
- [Mandatory pre-commit and pre-push security gate](#mandatory-pre-commit-and-pre-push-security-gate)
- [Incident response](#incident-response)
- [Checklists](#checklists)
- [Open items](#open-items)
- [Offensive security review (before every commit and push)](#offensive-security-review-before-every-commit-and-push)

## Status conventions

The labels are defined in [README.md](README.md#status-labels). Where possible, a **Current** control names its regression test, and every **Open** item is listed in [Open items](#open-items).

The rules in this document are mandatory regardless of status: a **Planned** control is a requirement that blocks the feature it protects from shipping.

## Scope and protected data

This document governs authentication, APIs, files, databases, logs, AI and backup. The following data is protected:

- original bank statements and card invoices;
- transactions, descriptions, merchants and categories;
- balances, net worth, goals and habits;
- identity, email address and OAuth identifiers;
- the SQLite database, backups and keys;
- tokens, cookies, authorization codes and infrastructure secrets.

Financial data stays on the device (local SQLite, accessed only by the local backend). The Cloudflare D1 database holds only minimal identity, sessions, releases and download grants, and is reached only through the Worker. See [DATABASE.md](DATABASE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Threat model

| Threat | Minimum control | Status |
| --- | --- | --- |
| Malicious import file | size limits, real type detection, isolated parser and timeout | **Planned** (no statement parser exists yet) |
| Local API reached by another process or site | loopback bind, `Host` check, controlled origin and a per-session ephemeral secret | `Host` check **Current**; per-session secret **Planned** |
| Theft of the local database | operating-system permissions, optional encryption, no data in logs | **Planned** (no encryption option yet) |
| Theft of the remote backup | AES-256-GCM on the client, key never on the server | **Planned** (no backup feature yet) |
| OAuth hijacking | PKCE, `state`, nonce, strict redirect and short-lived tokens | **Current** for the web login |
| Compromised dependency | lockfile, review, alerts and controlled updates | lockfile **Current**; alerts and automated review **Planned** |
| Hostile news content | sanitization, CSP and safe external opening of links | **Planned** (no news feature yet) |
| Prompt injection in news | separate instructions from content; give the model no tools and no private data | **Planned** |

## Mandatory rules

1. Never version, print or send secrets to tools, logs or documentation.
2. Never send financial data to Workers AI or any other external model.
3. Never load remote content with Electron privileges.
4. Keep `contextIsolation: true`, `nodeIntegration: false` and a restrictive CSP. The two flags are **Current**; the CSP for the local app is **Planned** (see [CORS, response headers and CSP](#cors-response-headers-and-csp)).
5. Re-validate every input in the trusted process; the interface is not a security boundary.
6. Use parameterized queries (Prisma locally, bound D1 statements in the Worker) and independent authorization checks. **Current**: every Worker query uses `prepare(...).bind(...)`; local route handlers use Prisma.
7. Redact logs: technical IDs and states are allowed; financial values and descriptions are not.
8. Encrypt in transit and at rest, but never send unnecessary confidential data to the frontend, even encrypted.
9. Apply per-resource, per-owner authorization in the backend on every request.
10. Treat posts and comments as hostile input: validate size and schema, escape on output and apply CSP.
11. Require an ephemeral, single-use action code on every frontend-to-backend call, except the route that issues the code itself. **Current** in both the local API and the Worker.

## Authentication

### Policy

Web and Electron use the OAuth 2.0 Authorization Code flow with PKCE S256. The Implicit Grant and any flow that handles the user's password are prohibited. All validation and authorization happen in the backend.

### Current web flow

Status: **Current**.

The Google login of the landing page is implemented between the BFF (`apps/web`) and the Worker (`cloudflare/src/index.ts`): PKCE S256, `state`, `nonce`, ID-token signature verification with RS256 against Google's JWKS, an opaque access token valid for 15 minutes and an opaque rotating refresh token valid for 30 days. The BFF keeps both in `HttpOnly` cookies (`__Host-talentum-access`, `__Host-talentum-refresh`). Reuse of a refresh token revokes its family and the session. Production operation depends on the Worker secrets and on the redirect URIs registered with the provider.

The `state` is bound to the browser that started the login: `GET /api/auth/start` stores a SHA-256 hash of the `state` in the `__Host-talentum-oauth-state` cookie (600 seconds, the same lifetime as the Worker's auth transaction), and the callback only proceeds when the received `state` matches it (constant-time comparison), which prevents login CSRF. The Worker consumes the auth transaction atomically (`UPDATE … WHERE consumed_at IS NULL`). The refresh claims the old token with `UPDATE … WHERE consumed_at IS NULL` before issuing the successor; in a race, the second attempt is treated as reuse and revokes the family. Session cookies are always sent with `Secure`, which the `__Host-` prefix requires and which browsers accept on `http://localhost`. Logout always clears the cookies, even when the Worker is unavailable. Mutation origin checks and redirect targets use the requested `Host` (`apps/web/src/server/site-url.ts`), not `request.url`.

Details verified in the code:

- the Worker validates the ID token's `alg` (`RS256` only), signature, issuer (`accounts.google.com` or `https://accounts.google.com`), audience (`GOOGLE_CLIENT_ID`), expiry, `nonce`, presence of `sub` and `email`, and `email_verified`;
- the requested scopes are `openid email profile`;
- the redirect URI is fixed server-side as `PUBLIC_WEB_URL` plus `/api/auth/callback` and stored in the auth transaction; it is not taken from the request;
- the PKCE verifier and the nonce are encrypted with AES-GCM (key derived from `SESSION_SIGNING_SECRET`) before being stored in `auth_transactions`; `state` and `nonce` are stored only as peppered hashes;
- sessions are opaque random tokens; D1 stores only their peppered SHA-256 hash (`auth_sessions.token_hash`), never the token;
- the BFF cookies use `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`.

### Credentials

| Credential | Lifetime | Web | Electron | Server |
| --- | --- | --- | --- | --- |
| Access token | short, initially 5–15 min (**Current**: 15 min) | `HttpOnly` cookie held by the BFF (**Current**) | backend-local memory (**Planned**) | minimal claims; stored as a hash only |
| Refresh token | bounded by the session (**Current**: 30 days) | `Secure`, `HttpOnly`, `SameSite` cookie (**Current**) | operating-system vault (**Planned**) | hash, family and state only (**Current**) |
| ID token | login only | backend only (**Current**) | backend-local (**Planned**) | never used as a session (**Current**) |
| `state`/`nonce`/PKCE | one transaction | bound to the user agent (**Current**) | local memory/transaction (**Planned**) | hash and expiry when persisted (**Current**; verifier encrypted) |

### Refresh-token families

- **Current**: refresh tokens rotate on every use; the successor is linked through `successor_token_id`.
- **Current**: reuse of a previous token (or losing the atomic claim race) sets `revoked_at` and `compromise_detected_at` on the family and revokes the session, then answers `REFRESH_REUSE_DETECTED`.
- **Planned**: writing a security event for reuse. The `security_events` table exists in D1, but the Worker writes nothing to it today.
- **Planned**: revocation on risk change (for example, privilege change or suspicious activity).

### Logout

- **Current**: `POST /api/auth/logout` on the BFF checks origin, asks the Worker to revoke the session and every refresh family of that session, and always deletes both cookies and redirects with `303`.
- **Open**: the Worker logout requires a valid access token. When the access token has already expired, the Worker answers `AUTH_REQUIRED`, the cookies are still cleared, but the refresh family in D1 stays valid until it expires.

### Mandatory validation

| Requirement | Status |
| --- | --- |
| signature and allowed algorithm | **Current** |
| issuer, audience, expiry and `nonce` | **Current** |
| redirect URI by exact comparison | **Current** (fixed server-side; see the domain conflict in [Open items](#open-items)) |
| unique `state` bound to the client | **Current** |
| PKCE S256 per transaction | **Current** |
| minimal scopes and specific audience | **Current** |
| open-redirect blocking | **Current** (the BFF only redirects to fixed paths on the requested host, to the provider URL issued by the Worker, or to a published artifact URL) |
| re-authentication for high-risk actions | **Planned** |

### Web rules

- The refresh token never goes into `localStorage` or `sessionStorage`. **Current**.
- The host cookie uses `Secure`, `HttpOnly`, `SameSite` and a minimal `Path`. **Current**, except that `Path` is `/` for all three cookies.
- Every cookie-authenticated mutation has CSRF protection. **Open** gap: see [Authorization and CSRF](#authorization-and-csrf).
- The session is regenerated after login and after privilege change. **Current** for login (a new session and family per login); privilege change does not exist yet.
- Private responses use `Cache-Control: no-store`. **Current** in the Worker; the BFF route handlers do not set it explicitly (**Open**).
- CORS uses an exact allowlist and never reflects the origin with credentials. **Planned**: see [CORS, response headers and CSP](#cors-response-headers-and-csp).

### Electron and desktop OAuth

Status: **Planned**. The desktop app has no login today.

- open OAuth in the system browser, never in a `webview`;
- never embed a client secret;
- use an ephemeral loopback redirect or a registered and validated custom protocol;
- store the refresh token in the operating-system credential vault; without secure storage, disable persistent login;
- the renderer never receives the refresh token;
- logout revokes or removes local credentials without silently deleting financial data.

## Authorization and CSRF

- **Current**: the Worker requires the `X-Talentum-BFF` header (compared through SHA-256 digests with `BFF_SHARED_SECRET`) on every route except `GET /health`; otherwise it answers `BFF_REQUIRED` (403).
- **Current**: authenticated Worker routes (`/api/auth/logout`, `/api/me`, `/api/releases`, download grants) resolve the session from `Authorization: Bearer` against non-revoked, non-expired `auth_sessions`; download grants are written for the session's own `user_id`.
- **Current**: the BFF's `POST` mutations (`/api/auth/logout`, `/api/releases/[releaseId]/download-grants`) call `sameOrigin()`, which compares the `Origin` header with the requested host.
- **Open**: `sameOrigin()` returns `true` when the `Origin` header is missing. Protection then relies only on `SameSite=Lax`.
- **Open**: `GET /api/auth/refresh` rotates the tokens and sets new cookies without any origin check. Because it is a `GET`, `SameSite=Lax` cookies are sent on a cross-site top-level navigation, so another site can force a token rotation. The `/downloads` middleware also redirects to it when only the refresh cookie is present.
- **Planned**: per-resource and per-owner authorization for future community and moderation routes.
- **Current**: the local API has a single local profile and no user authentication; each route scopes queries by the local `profileId`.

## Action codes

Every frontend-to-backend request, except the bootstrap endpoint that issues the code, carries a backend-issued, opaque, single-use action code with a short TTL in the `X-Action-Code` header. The code contains no user data, is not used for analytics or tracking, and does not replace authentication, authorization, CSRF protection, idempotency or rate limiting.

### Required properties

| Property | Local API (`src/server/action-codes.ts`) | Worker (`cloudflare/src/index.ts`) |
| --- | --- | --- |
| generated by the backend with a CSPRNG, at least 128 bits of entropy | **Current** (32 random bytes) | **Current** (32 random bytes) |
| only a hash and minimal metadata stored | **Current**: SHA-256 hash in an in-memory `Map` with `{method, path, expiresAt}` | **Current**: peppered SHA-256 hash in the D1 `action_codes` table |
| initial maximum TTL of 60 seconds | **Current** (60 s) | **Current** (60 s) |
| bound to method and route | **Current** | **Current** |
| bound to origin/context and to the session when one exists | **Planned**: no binding | **Planned**: `context_hash` is the hash of the BFF shared secret, identical for every caller, so it binds to the BFF only, not to a session or origin |
| consumed atomically, exactly once | **Current** (deleted from the map before comparison) | **Current** (`UPDATE … SET consumed_at … WHERE consumed_at IS NULL AND expires_at > now`) |
| removed after consumption or expiry | **Current** (deleted on consume; expired entries swept on each issue or consume) | **Open**: rows are kept with `consumed_at` set; there is no purge |
| never in URLs, telemetry, analytics, logs or historical databases | **Current** (header only; no logging) | **Current** for URLs and logs; the hash is kept in D1 (see the row above) |
| no identity or business information in the value | **Current** | **Current** |
| `Cache-Control: no-store` on issue and consume | **Current** for issue and for successful responses; **Open**: the `403` from `/api/system/status` lacks `Cache-Control` | **Current** (every Worker response) |
| generic error that does not reveal whether the code existed | **Current** (`INVALID_ACTION_CODE`) | **Current** (`INVALID_ACTION_CODE`, uniform message) |
| authentication, authorization, CSRF, rate limiting and idempotency kept independent | partially: see the sections above; idempotency keys are **Planned** | partially; idempotency keys are **Planned** |

The original plan to store codes in KV or a Durable Object is superseded by the D1 table in the Worker; moving away from D1 would require an ADR.

## Rate limiting and abuse protection

- **Current**: the Worker keeps fixed one-minute windows in the D1 `rate_limit_windows` table, keyed by a peppered hash of the bucket name and client IP. There are two buckets: `codes` (30 per minute on `POST /api/action-codes`) and `login` (10 per minute on `POST /api/auth/start`).
- **Current**: the client IP is the value the authenticated BFF forwards in `X-Talentum-Client-IP` (taken from the first `X-Forwarded-For` entry, or `X-Real-IP`), falling back to `CF-Connecting-IP`. The header is only honored after the BFF secret check, so an unauthenticated caller cannot choose its bucket.
- **Planned**: limits combining IP, `userId`, `sessionId`, a device signal and the endpoint; dedicated buckets for callback, refresh, post creation, comment, vote, report and download; progressive delay, generic errors, credential-stuffing detection and Turnstile after suspicious behavior. Turnstile is not integrated today.
- **Planned**: a rate limit on the local API (none today).
- **Planned**: edge WAF rules.

## CORS, response headers and CSP

- **Planned**: an exact CORS allowlist in the Worker. Today the Worker sends no CORS headers at all, so browsers cannot call it cross-origin; it is reached only server-to-server from the BFF. `ALLOWED_ORIGIN` is declared in the Worker configuration but unused.
- **Current**: every Worker JSON response carries `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. Errors use the shape `{error:{code,message}}` with a generic message.
- **Current**: `apps/web` sends a per-request nonce CSP from its middleware (`default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `'unsafe-eval'` and `ws:` only in development) plus `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and `Strict-Transport-Security` from `apps/web/next.config.ts`. The CSP middleware does not run on `/api` routes.
- **Planned**: a restrictive CSP and baseline security headers for the local app (`src/`). Today the local Next.js app only disables `X-Powered-By`; it sends no CSP, which also means the Electron renderer runs without one.
- **Current**: the local API middleware answers non-loopback hosts with `HOST_NOT_ALLOWED` (403, `no-store`).

## Electron hardening

Status of each control in `electron/main.cjs` and `electron/preload.cjs`:

- **Current**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Current**: the preload exposes only three window functions (`minimize`, `toggleMaximize`, `close`) through `contextBridge`.
- **Current**: `setWindowOpenHandler` denies every new window; `will-navigate` blocks navigation outside the app origin.
- **Current**: external links open in the system browser only when the protocol is `https:` and the host is on a fixed allowlist.
- **Current**: the default session denies every permission request.
- **Current**: IPC handlers act only when the sender frame belongs to the app origin.
- **Current**: single-instance lock and no application menu.
- **Current**: the window loads the fixed `TALENTUM_URL` or `http://localhost:3000`; no remote content is loaded with Electron privileges.
- **Planned**: a restrictive CSP for the renderer (see above).
- **Planned**: Electron fuses, code signing and signed automatic updates once distribution exists.
- **Planned**: never accept invalid certificates nor disable Chromium protections (no code does so today; the rule applies to future changes).

## Local API boundary

- **Current**: the local Next.js backend is the only process that reaches SQLite; the renderer calls documented route handlers in `src/app/api`.
- **Current**: `src/middleware.ts` rejects every `/api` request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]`, blocking DNS rebinding.
- **Current**: Docker Compose publishes the local app only on `127.0.0.1`.
- **Current**: every route except `/api/action-codes` (bootstrap) and `/api/health/live` requires a local action code. The liveness probe is a documented exception (`CLAUDE.md`, Architecture rules): it returns no application data, the interface never calls it, and only the Compose health check and `pnpm dev:all` use it.
- **Planned**: a per-session ephemeral secret shared only between Electron and the local backend. Today any loopback process can request action codes, so the action code does not authenticate the caller.
- **Planned**: origin control on the local API (no `Origin` check today).
- **Planned**: a random port instead of the fixed port 3000.
- **Planned**: a rate limit on the local API.

## Controls by environment

| Control | Web/Worker | Electron |
| --- | --- | --- |
| TLS/HSTS | required; HSTS **Current** on `apps/web` | required on cloud connections (**Planned**: no cloud connection from Electron yet) |
| CSP, anti-XSS and sanitization | required; **Current** on `apps/web` and the Worker | required in the renderer; **Planned** |
| CSRF | cookie-based mutations; partially **Current** (see Open items) | OAuth flow through `state`/PKCE; **Planned** |
| Rate limit/WAF/Turnstile | edge and application; two buckets **Current**, the rest **Planned** | cloud backend; local API limit **Planned** |
| Tokens | `HttpOnly` cookie in the BFF with rotation; **Current** | access token in memory, refresh token in the OS vault; **Planned** |
| Database | D1 with per-row/resource authorization in the application; **Current** for existing routes | SQLite reached only by the local backend; **Current** |
| Secrets | bindings/secret store, never in the bundle; **Current** | no client secret; local keys protected by the OS; **Planned** |
| Software integrity | CI, dependencies and artifacts; **Planned** | code signing, update and manifest; **Planned** |
| Isolation | headers, CORS and cache; headers **Current**, CORS **Planned** | sandbox, context isolation, minimal IPC **Current**; fuses **Planned** |
| Audit | login, session, moderation and download; **Planned** (`security_events` and `audit_events` tables exist but are not written) | local technical events without financial data; **Planned** |

## Secrets management

### Where secrets live

Status: **Current**.

- **Production Worker**: encrypted Worker secret bindings, created interactively with `wrangler secret put <NAME> --config cloudflare/wrangler.jsonc`. Never pass the value on the command line.
- **Local Worker**: `cloudflare/.dev.vars`, copied from `cloudflare/.dev.vars.example`. It is ignored by Git and must never be committed.
- **Local app, Docker and the BFF in development**: the single root `.env`, copied from `.env.example`. It is ignored by Git. `apps/web/next.config.ts` loads the root `.env` when run from `apps/web`; variables already set in the environment (Vercel, Compose) take precedence.
- **Vercel (BFF)**: project environment variables in the server runtime. None of them uses the `NEXT_PUBLIC_` prefix, and no code reads a `NEXT_PUBLIC_` variable.
- **Example files** (`.env.example`, `cloudflare/.dev.vars.example`, `cloudflare/wrangler.example.jsonc`) contain variable names and unmistakably synthetic placeholders only.
- `cloudflare/wrangler.jsonc` is versioned because the D1 `database_id`, the Worker name and the public variables are not secrets. API tokens, `.dev.vars` and values entered with `wrangler secret put` are never committed.

### Variables

The single list of variables, with kind, purpose and location in every environment, is in [ARCHITECTURE.md §3.7](ARCHITECTURE.md#37-configuration-variables-names-and-locations). The three Worker secrets (`SESSION_SIGNING_SECRET`, `TOKEN_HASH_PEPPER`, `BFF_SHARED_SECRET`) and `GOOGLE_CLIENT_SECRET` are secrets; `CLOUDFLARE_BFF_SHARED_SECRET` is the BFF's copy of `BFF_SHARED_SECRET` and is just as secret.

### Generating and rotating values

Generate each of `SESSION_SIGNING_SECRET`, `TOKEN_HASH_PEPPER` and `BFF_SHARED_SECRET` independently, with at least 32 random bytes, running the command once per variable:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Register the OAuth client secret with `wrangler secret put`; the public client identifier may be a plain variable. Previews never receive production secrets. A detected credential is revoked and rotated before any history cleanup. Rotation procedures per variable (including the impact of rotating `SESSION_SIGNING_SECRET` on in-flight logins and of `TOKEN_HASH_PEPPER` on every stored hash) are **Planned**.

Setup and deployment steps for the Worker are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Files, AI and hostile content

Status: **Planned**. No statement parser, news feature or AI integration exists in the code; `pdfjs-dist` and `ofx-data-extractor` are installed but unused.

- import files get size limits, real type detection, an isolated parser and a timeout;
- parsers are tested with invalid and hostile files before release;
- financial data is never sent to Workers AI or any external model;
- news content is sanitized, rendered under CSP, and its links open externally and safely;
- model prompts separate instructions from content, and the model gets no tools and no private data.

## Feedback community

Status: **Planned**. D1 tables exist for the community, but the Worker exposes no feedback or community routes.

- anonymous reads include only `PUBLISHED` content and a minimal public profile;
- writing, voting and reporting require a valid session;
- authors change only their own content; moderators act through an explicit permission;
- votes have a unique constraint and counters are derived or transactional;
- posts and comments have size limits, normalization, contextual escaping, and raw HTML is blocked in the MVP;
- antispam, cooldown, adaptive Turnstile, reporting and a moderation queue apply;
- responses and logs never expose email, IP, token, OAuth subject or private events;
- URLs are validated and rendered with protection against `javascript:`, phishing and reverse tabnabbing;
- deletion, retention and moderation appeal must have a published policy.

## End-to-end encrypted backup

Status: **Planned**; key recovery is **Open**.

- algorithm: AES-256-GCM or an equivalent reviewed authenticated construction;
- a unique nonce per encryption;
- the key is derived or generated on the device and never sent to the server;
- a versioned header with algorithm, KDF, salt, nonce and checksum;
- a restore is validated before replacing the active database;
- an explicit key-recovery mechanism still has to be decided.

Without a documented recovery strategy, E2EE backup must not be presented as ready.

## Vercel deployment isolation

- **Current**: `apps/web` (`@talentum/web`) contains only the landing page, the downloads page and a minimal session BFF; it has no Electron source, local backend, Prisma/SQLite, parser or financial module.
- **Current**: the BFF has no database and no financial rule; it forwards only allowed contracts to the Worker.
- **Current**: D1 stores only release metadata, artifact hashes and download grants, never installers.
- **Planned**: installers as signed artifacts in GitHub Releases, never part of the landing page's executable bundle.
- **Open**: download grants are recorded in D1, but the BFF redirects straight to the artifact's `download_url` and nothing validates the grant.
- **Planned/Open**: a CI-generated and validated allowlist manifest of the package uploaded to Vercel. There is no CI and no manifest; `Dockerfile.web` copies the whole repository (minus `.dockerignore`) into the image context.
- **Planned**: previews follow the same isolation and never receive production secrets.

## Supply chain, CI and release integrity

### Credential leak prevention

- **Current**: `.gitignore` ignores `.env*` (except `.env.example`), `.dev.vars*` (except the example), SQLite files and journals, dumps, backups, private key and keystore formats, logs, traces, `.wrangler/`, `.vercel/`, build output and caches. `.dockerignore` excludes `.env*`, databases and `temp/` from image contexts.
- **Current**: examples use unmistakable placeholders only.
- **Current**: versioned Git hooks in `.githooks/` run `pnpm typecheck` and `pnpm test` before every commit and push (install with `pnpm hooks:install`). They do not scan for secrets; the manual [security gate](#mandatory-pre-commit-and-pre-push-security-gate) covers that.
- **Planned**: CI secret scanning on every diff and, periodically, on the full history. There is no CI in the repository.
- **Planned**: branch protection that blocks merges when the scanner finds a secret.
- **Planned** (recommended): Dependabot or Renovate, SAST, dependency analysis and CodeQL.
- A detected credential is revoked and rotated before it is removed from history, and its value is never printed in issues, logs or review comments.

### Audit of 2026-09-05

Status: **Historical**. A local scan for sensitive names, private keys and known token formats was run on the worktree and history. No real textual credential was found. Matches in `icon-badge.svg` and historical PNGs were classified as incidental sequences inside encoded or binary images. A pattern scan reduces risk but replaces neither a dedicated CI scanner nor GitHub secret protection.

### Release integrity

- **Current**: the downloads page shows each artifact's SHA-256 so users can verify it before running.
- **Planned**: code signing, signed updates and an update manifest for the desktop app.

## Verified controls and their tests

Status: **Current**. Verified in October 2026; each item has a test in `tests/regression/`, run by `pnpm test`.

| Control | Test file |
| --- | --- |
| the local API rejects a `Host` outside loopback (DNS rebinding) | `local-app.test.mjs` |
| Electron denies navigation, new windows and permissions | `local-app.test.mjs` |
| the preload accepts IPC only from the app's own windows | `local-app.test.mjs` |
| the OAuth callback is bound to the browser that started the login (login CSRF) | `web-bff.test.mjs` |
| `__Host-` cookies are `Secure` in development too | `web-bff.test.mjs` |
| the BFF forwards the visitor's IP to the Worker | `web-bff.test.mjs` |
| the origin check compares with the requested `Host`, not `request.url`; redirects stay on that host | `web-bff.test.mjs` |
| a concurrent refresh with the same token does not create two successors | `worker-auth.test.mjs` |
| the Worker rate limit counts the visitor's IP forwarded by the authenticated BFF in `X-Talentum-Client-IP`, not the BFF server's IP | `worker-auth.test.mjs` |
| the client-supplied IP is honored only after the BFF authenticates | `worker-auth.test.mjs` |
| logout clears the cookies even when the Worker fails | `web-worker-offline.test.mjs` |
| the interface does not cite internal documentation; the layout guide exists only in development | `ui-shell.test.mjs` |
| error pages offer recovery without diagnostics | `error-pages.test.mjs` |

## Mandatory pre-commit and pre-push security gate

Rule. This is the owner of the gate; `CLAUDE.md` makes it binding for AI agents and links here. Run it together with the [offensive security review](#offensive-security-review-before-every-commit-and-push).

Never commit or push until every step below has completed successfully. This gate is mandatory even when the user asks to commit immediately, the repository is private, GitHub push protection is enabled, or the change appears documentation-only.

1. Inspect `git status --short --ignored`, the complete staged file list, and `git diff --cached`. Confirm every file is necessary, intentional and safe to publish permanently.
2. Verify `.gitignore` before staging. Ignore local secrets, credentials, databases, journals, dumps, backups, logs, caches, build outputs, temporary files, editor state and provider-generated local state.
3. Scan tracked, untracked-to-be-added and staged content for secrets and sensitive data with the strongest locally available scanner plus targeted searches. GitHub scanning is a secondary control and does not recognize every secret or risky file.
4. Review source, configuration, migrations, fixtures, tests, documentation, generated artifacts, images and screenshots manually. A successful regex scan is not approval.
5. Check staged changes for personal, financial and operational data: real names, personal email addresses, phone numbers, documents, addresses, account or card data, Pix keys, statements, balances, transactions, IP addresses, device identifiers, internal paths, account metadata and production records.
6. Confirm examples contain only clearly synthetic values. Do not “anonymize” real customer or financial data by changing only a few fields.
7. Confirm the commit excludes anything unnecessary for cloning, building, testing, documenting or deploying the project. If a file does not need version control, do not commit it merely because it is not confidential.
8. Stop before commit or push when a finding is ambiguous. Classify it, remove it, ignore it or obtain explicit user direction; never assume exposure is harmless.
9. After staging, repeat the staged diff and sensitive-data scan. Only then may an explicitly authorized commit or push proceed.
10. Report which checks ran, any limitations and the exact classes of files excluded.

Treat the following as prohibited unless a documented, reviewed exception proves the specific value is public and necessary:

- passwords, passphrases, recovery codes, cookies, session identifiers, API keys, access tokens, refresh tokens, OAuth secrets, webhook secrets and signing secrets;
- private keys, seed phrases, certificates containing private material, keystores and SSH credentials;
- database connection strings, credentials embedded in URLs, cloud service-account files, CLI credential stores, package-manager auth files and registry tokens;
- `.env*` and `.dev.vars*` with real values, Terraform state, Wrangler local state, deployment caches and provider configuration containing credentials;
- production databases, SQLite `-wal`/`-shm` files, dumps, backups, exported tables, raw statements, uploaded documents and real fixtures;
- logs, crash reports, traces, terminal transcripts, screenshots and generated reports containing identity, infrastructure, request headers, tokens or customer data;
- personal, financial, authentication, authorization or security telemetry not deliberately approved for public disclosure;
- internal hostnames, private network topology, privileged endpoints, vulnerability details that enable exploitation, or operational metadata unnecessary to build and operate the open-source project.

Public identifiers such as a Cloudflare D1 `database_id`, Worker name or public service URL are not authentication secrets by themselves. Commit them only when the application configuration requires them; never infer that adjacent values such as account tokens, API tokens or shared secrets are also public.

Store Cloudflare production secrets with encrypted Worker secret bindings and local development secrets only in ignored `.dev.vars` or `.env` files. Commit example files with variable names and unmistakably synthetic placeholders only.

Authoritative references:

- [GitHub — Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
- [GitHub — Secret scanning scope and limitations](https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-scope)
- [GitHub — Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Cloudflare — Environment variables and secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Cloudflare — Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## Incident response

A suspected exposure requires: stopping the affected distribution, preserving evidence without copying personal data, revoking credentials, fixing the cause, communicating the impact clearly and documenting preventive measures. If sensitive data has already been committed or pushed:

1. stop further publication and do not merely delete the value in a later commit;
2. revoke or rotate the credential first;
3. assess exposure and notify the user without repeating the value;
4. remove it from current files and, when required, coordinate Git history cleanup;
5. add a preventive ignore rule or scanner check;
6. verify forks, caches, CI logs, release artifacts and provider logs as applicable;
7. document the incident response without recording the secret.

## Checklists

### Release checklist

- [ ] No secret or personal data in Git, the bundle, logs or documentation.
- [ ] Dependencies and artifacts verified.
- [ ] OAuth and authorization flows tested.
- [ ] Parsers tested with invalid and hostile files.
- [ ] Backup and restore tested end to end.
- [ ] CSP, Electron permissions and link opening reviewed.
- [ ] Data export and deletion verified.
- [ ] Secret scanning of the diff and history passed with no real credentials.
- [ ] Rate limits, antispam, reports and community authorization tested.

### Before publishing the Worker

- [ ] No financial data, statement, account, balance, transaction or Pix key is in D1.
- [ ] No token is persisted in plain text; only hash, expiry, consumption and revocation.
- [ ] Cookies are `Secure`, `HttpOnly` and use a `SameSite` value suited to the BFF flow.
- [ ] Private routes apply authentication, authorization, rate limiting and `Cache-Control: no-store` (rate limits on private routes are **Planned**).
- [ ] Ephemeral codes have a hash, a short TTL and single use, and never enter audit or analytics.
- [ ] CORS accepts only explicitly authorized origins (**Planned**: no CORS today).
- [ ] Logs and events contain no secrets, public email, raw IP or financial content (the Worker does not log today; `security_events`/`audit_events` writes are **Planned**).
- [ ] Remote migrations are reviewed and applied by the backend operator, never by a frontend.

## Open items

1. **CSRF on `GET /api/auth/refresh`**: the BFF route rotates tokens and sets cookies on a `GET` with no origin check; it relies only on `SameSite=Lax`, which allows cross-site top-level navigations. Decide whether to make it a `POST` with an origin check or to require a same-site fetch signal.
2. **Missing `Origin` accepted**: `sameOrigin()` returns `true` when the `Origin` header is absent, so BFF mutations fall back to `SameSite=Lax` alone.
3. **Logout with an expired access token**: the Worker requires a valid access token for logout, so the refresh family is not revoked server-side when the access token has expired.
4. **Domain conflict for the OAuth redirect**: the production redirect URI depends on the undecided domain; see [ARCHITECTURE.md §3.4](ARCHITECTURE.md#34-domain).
5. **Worker action-code retention**: consumed and expired rows are never purged; the decision is owned by [DATABASE.md](DATABASE.md#open-items) (item 4).
6. **Action-code context binding**: `context_hash` is the same for every caller (hash of the BFF secret), and local codes are issued to any loopback caller; binding to session or origin is not implemented in either backend, and the local binding depends on the Planned random port and per-run secret.
7. **`Cache-Control` gaps**: the `403` from the local `/api/system/status` and the BFF route handlers do not set `Cache-Control: no-store`.
8. **Download grants not enforced**: grants are written to D1 but never validated; the BFF redirects to the artifact URL directly.
9. **Vercel package allowlist**: no CI or manifest exists, and `Dockerfile.web` copies the whole repository; decide how the Vercel upload is restricted.
10. **Local app CSP**: decide the CSP for the local app and Electron renderer (the local app sends none today).
11. **Forwarded IP trust**: the BFF trusts the first `X-Forwarded-For` value; this is correct behind Vercel's proxy but not when the BFF is exposed directly (for example, outside Compose's loopback binding).
12. **E2EE backup key recovery**: no recovery mechanism has been decided.
13. **Security-event recording**: refresh-token reuse revokes the family and session but writes nothing to `security_events`, and `audit_events` is never written, so download grants are recorded but not audited.
14. **Rate-limit coverage**: only `codes` (30/min) and `login` (10/min) per IP exist; callback, refresh, download grants, private routes and the local API have none, and the values are not calibrated with telemetry.

## Offensive security review (before every commit and push)

Rule (mandatory manual step; `CLAUDE.md`, "Security is tested before every commit and push"); none of it runs automatically yet. It complements, and does not replace, the [secret and personal-data gate](#mandatory-pre-commit-and-pre-push-security-gate) and the [Checklists](#checklists) above. That gate asks "is anything sensitive leaving the machine?"; this review asks "how would an attacker abuse what this change adds or touches?". Run it as the attacker would: try to break the change, record what you tried, fix what breaks before sending.

### Scope: map the diff to surfaces

List what changes, then review only the surfaces it touches plus anything they call:

```sh
git diff --cached --stat                  # before a commit
git diff --stat origin/main...HEAD        # before a push
```

| Paths touched | Surface | Existing rules |
| --- | --- | --- |
| `src/app/api/**`, `src/server/**`, `src/middleware.ts` | local API | [Local API boundary](#local-api-boundary), [Action codes](#action-codes) |
| `electron/**` | Electron shell | [Electron hardening](#electron-hardening) |
| `cloudflare/src/**`, `cloudflare/migrations/**`, `cloudflare/wrangler*.jsonc` | Worker and D1 | [Authentication](#authentication), [Rate limiting and abuse protection](#rate-limiting-and-abuse-protection) |
| `apps/web/**` | landing page and BFF | [Authorization and CSRF](#authorization-and-csrf), [CORS, response headers and CSP](#cors-response-headers-and-csp) |
| future CSV/OFX/PDF importers | file parsers | [Files, AI and hostile content](#files-ai-and-hostile-content) |
| `prisma/**` | local schema | [DATABASE.md](DATABASE.md) |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `Dockerfile*`, `compose.yaml`, `.githooks/**`, future `.github/**` | supply chain and CI | [Supply chain, CI and release integrity](#supply-chain-ci-and-release-integrity) |

A documentation-only diff still gets the secret gate; it skips steps 1 to 3 below only when no example, command or configuration in it can be executed.

### Step 1: threat-model the diff with STRIDE

Answer the four threat-modeling questions for the change: what are we working on, what can go wrong, what are we doing about it, did we do a good enough job. For "what can go wrong", walk STRIDE over every touched surface and write one line per category, even if the answer is "not applicable because…":

| STRIDE | Property | Questions specific to Talentum |
| --- | --- | --- |
| Spoofing | authentication | Can another loopback process or a web page call the local API as if it were the renderer? Can a caller reach the Worker without the BFF secret, or choose its own rate-limit IP? Can a forged `state` or ID token complete a login? |
| Tampering | integrity | Can input change a field the user must not control (`profileId`, `userId`, amounts, release IDs)? Is every Worker query bound with `prepare(...).bind(...)`? Can an import file alter rows outside its own import? |
| Repudiation | accountability | Would a login, refresh-reuse, download grant or destructive local action leave a trace? (`security_events` and `audit_events` exist but are not written: **Planned**.) |
| Information disclosure | confidentiality | Does any response, log, error, cache or the client bundle carry financial values, tokens, emails, raw IPs, stack traces or internal paths? Is `Cache-Control: no-store` set on private responses? |
| Denial of service | availability | Can one caller exhaust the action-code map, D1 rows, the rate-limit table, memory or CPU (huge body, huge import, regex backtracking)? Is there a size limit and a timeout? |
| Elevation of privilege | authorization | Can the renderer reach Node or IPC beyond the three window functions? Can a session read or create another user's grant? Can a `GET` change state? |

Record each threat that is not already mitigated as a finding in the report (step 6).

### Step 2: checklist by surface

Commands assume the local app on port 3000 (`pnpm dev`), the landing page/BFF on port 3100 (`pnpm --dir apps/web dev` or `pnpm docker:up`) and the Worker on port 8787 (`pnpm cloudflare:dev`). Run probes only against your own local instances, never against production or third-party hosts. Keep any action code or token in a shell variable; never echo it, paste it into a report or commit it.

#### Local API (`src/`)

- [ ] Every new route consumes an action code bound to its method and path before doing anything else, except the two documented exceptions.
- [ ] Every query is scoped by the local `profileId`; no ID from the request body or URL is trusted without that scope.
- [ ] Input is parsed with a `zod` schema with explicit maximum lengths; unknown fields are rejected or ignored, never persisted.
- [ ] Errors use the generic `{error:{code,message}}` shape with `Cache-Control: no-store`; no stack, SQL or path leaks.
- [ ] Responses return counts or the minimum the screen needs, never more financial data than it renders.

Probes (expected result in the comment; any other result is a finding):

```sh
BASE=http://127.0.0.1:3000
issue() { curl -s -X POST "$BASE/api/action-codes" -H 'Content-Type: application/json' \
  -d "{\"method\":\"$1\",\"path\":\"$2\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).actionCode'; }

# missing code -> 403 INVALID_ACTION_CODE
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/local-summary"

# single use: first 200, replay 403
CODE=$(issue GET /api/local-summary)
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Action-Code: $CODE" "$BASE/api/local-summary"
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Action-Code: $CODE" "$BASE/api/local-summary"

# binding: a code issued for another path or method -> 403
CODE=$(issue GET /api/dashboard)
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Action-Code: $CODE" "$BASE/api/local-summary"

# race: one code, 20 parallel uses -> exactly one 200 and nineteen 403
CODE=$(issue GET /api/local-summary)
seq 20 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-Action-Code: $CODE" "$BASE/api/local-summary" | sort | uniq -c

# DNS rebinding: foreign Host -> 403 HOST_NOT_ALLOWED
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: attacker.example' "$BASE/api/health/live"

# bootstrap abuse: the issuer must refuse to issue a code for itself -> 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/action-codes" \
  -H 'Content-Type: application/json' -d '{"method":"POST","path":"/api/action-codes"}'

# cross-origin page: today 200 (Open: no Origin check on the local API)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/action-codes" \
  -H 'Origin: https://attacker.example' -H 'Content-Type: application/json' \
  -d '{"method":"GET","path":"/api/local-summary"}'
```

On 2026-11-20 every probe above returned the expected result against `next dev`, including exactly one success in the race. The last probe documents a known gap rather than a pass: a web page the user visits can request action codes from the loopback API (see [Local API boundary](#local-api-boundary)). A change that adds a write route or returns more data raises the impact of that gap and must be weighed against it. The issuer has no rate limit (**Planned**); a flood such as `ab -n 5000 -c 50 -p body.json -T application/json "$BASE/api/action-codes"` (with `body.json` holding a valid request) shows how far the in-memory map grows in 60 seconds.

#### Electron (`electron/`)

Checked against the Electron security checklist (item numbers in parentheses):

- [ ] No dangerous option appears; the command below must print nothing:

  ```sh
  grep -rnE "nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webSecurity:\s*false|allowRunningInsecureContent|enableBlinkFeatures|experimentalFeatures|<webview|ignore-certificate-errors|setCertificateVerifyProc|loadURL\(['\"]file:" electron src
  ```

- [ ] Context isolation, sandbox and no Node integration stay on (2, 3, 4); permission handler still denies everything (5).
- [ ] Navigation and new windows stay blocked (13, 14); every `shell.openExternal` call still passes the `https:` plus host-allowlist check (15).
- [ ] Every new IPC handler validates the sender frame (17); the preload exposes no new Electron or Node API to the page (20).
- [ ] No remote content is loaded (1); the renderer CSP is still **Planned** (7), so a change that renders untrusted HTML is blocked until it exists.
- [ ] Electron is on a supported release (16): `pnpm outdated electron`.
- [ ] Fuses (19): **Planned** with packaging; once a packaged binary exists, read them with `npx @electron/fuses read --app <packaged-app>`.

#### Worker and D1 (`cloudflare/`)

- [ ] Every route except `GET /health` sits behind the BFF secret check and the action-code check; authenticated routes resolve the session from `Authorization: Bearer` and never from a request field.
- [ ] Every statement uses bound parameters; this must print nothing:

  ```sh
  grep -nE 'prepare\(`[^`]*\$\{' cloudflare/src/*.ts
  ```

- [ ] Rows owned by a user are read and written with the session's `user_id` in the `WHERE` clause (IDOR, see step 3).
- [ ] A new public or expensive route gets a rate-limit bucket like `codes` and `login`; today only those two exist.
- [ ] Single-use values (action codes, auth transactions, refresh tokens, future grants) are claimed with `UPDATE … WHERE consumed_at IS NULL` and the affected-row count is checked.
- [ ] Migrations add no financial column, no plain-text token and no table without an opaque `id`.
- [ ] Unauthenticated probes against the local Worker return `403 BFF_REQUIRED` with the security headers:

  ```sh
  W=http://127.0.0.1:8787
  for p in /api/action-codes /api/me /api/releases /api/auth/refresh; do
    curl -s -o /dev/null -w "$p %{http_code}\n" -X POST "$W$p"; done
  curl -s -D - -o /dev/null "$W/health" | grep -iE 'cache-control|content-security-policy|referrer-policy|x-content-type-options'
  ```

Authenticated Worker behavior (replayed action codes, refresh reuse, concurrent refresh, forwarded IP trust) is exercised with mocks in `tests/regression/worker-auth.test.mjs`; extend that file rather than probing with the real BFF secret.

#### Landing page and BFF (`apps/web/`)

- [ ] Security headers are present on pages:

  ```sh
  curl -sI http://127.0.0.1:3100/ | grep -iE 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
  ```

- [ ] Cross-site mutations are refused: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3100/api/auth/logout -H 'Origin: https://attacker.example'` must not succeed. Repeat without any `Origin` header: today it is accepted (**Open**, item 2 of [Open items](#open-items)). The OWASP CSRF cheat sheet treats a missing `Origin` as untrusted and recommends `Sec-Fetch-Site` as the primary signal with origin verification as fallback; adopting it is **Planned**.
- [ ] No `GET` route changes state. `GET /api/auth/refresh` does today (**Open**, item 1); a change must not add another.
- [ ] Every `Location` the BFF emits stays on a fixed path of the requested host, the provider URL issued by the Worker or a published artifact URL. Probe with a foreign `Host` and with absolute URLs in every query parameter, and read the `Location` header (`curl -s -o /dev/null -D - …`).
- [ ] No server variable leaks into the client: `grep -rn "NEXT_PUBLIC_" apps/web/src` must stay empty, and after `pnpm web:build` the client bundle must not contain secret variable names: `grep -rlE "BFF_SHARED_SECRET|GOOGLE_CLIENT_SECRET|TOKEN_HASH_PEPPER|SESSION_SIGNING_SECRET" apps/web/.next/static` must print nothing.
- [ ] Private BFF responses set `Cache-Control: no-store` (**Open**, item 7).

#### File importers (CSV, OFX, PDF)

Status: **Planned**; no importer exists. The first importer cannot merge without:

- [ ] a byte limit checked before parsing, a row limit, a per-file timeout and parsing off the request thread (worker thread or child process);
- [ ] type detection from content, not from the extension or the declared `Content-Type`;
- [ ] a random internal file name; the user's file name is display-only and never part of a path;
- [ ] idempotent re-import: importing the same file twice creates no duplicate transactions (OFX `FITID`, or a content hash for CSV);
- [ ] a regression corpus in `tests/regression/` with synthetic files only, covering at least: empty file; BOM, UTF-16 and invalid UTF-8; one 10 MB line; more rows than the limit; unbalanced quotes and embedded separators; cells starting with `=`, `+`, `-`, `@`, tab or carriage return and their full-width forms; OFX 1.x SGML with unclosed and deeply nested tags; OFX 2.x XML with a `DOCTYPE`, external entity and entity expansion (XXE and "billion laughs"); amounts with thousands of digits, `NaN`, exponents and mixed decimal separators; impossible dates; duplicate and missing `FITID`; a PDF with JavaScript, embedded files or thousands of pages.
- [ ] Formula characters are neutralized on CSV export, not rejected on import (negative amounts legitimately start with `-`).
- [ ] Fuzzing: **Planned**. Property-based generation with `fast-check` (`pnpm add -D fast-check`) feeding random bytes and mutated corpus files to each parser, asserting it either returns a validated result or a typed error within the time limit, never throws, hangs or allocates without bound.

#### Secrets

- [ ] Run the [security gate](#mandatory-pre-commit-and-pre-push-security-gate). Until a dedicated scanner is installed, use targeted searches that print file names, never matching values:

  ```sh
  git diff --cached -U0 | grep -E '^\+' | grep -ciE 'secret|token|passw|api[_-]?key|client_secret|bearer |BEGIN [A-Z ]*PRIVATE KEY'
  git diff --cached --name-only | xargs -r grep -lE 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_|xox[abprs]-|AIza[0-9A-Za-z_-]{35}|GOCSPX-|-----BEGIN [A-Z ]*PRIVATE KEY'
  ```

  A non-zero count or a listed file is inspected privately before staging continues.
- [ ] gitleaks: **Planned** (not installed). Install a release binary from the project's GitHub releases or use the container image, then run `gitleaks git --redact --no-banner .` (history) and `gitleaks dir --redact --no-banner .` (working tree).
- [ ] TruffleHog: **Planned** (not installed). Install with `brew install trufflehog`, a release binary or the container image, then run `trufflehog git file://. --results=verified,unknown` and `trufflehog filesystem .`.

#### Dependencies and supply chain

- [ ] `pnpm audit --prod --audit-level high` passes, or each remaining advisory is triaged in the report. Run `pnpm audit` without `--prod` too: Electron, Wrangler and build tools reach the user or the deployment even though they are dev dependencies.
- [ ] **Open**: the first run of `pnpm audit --prod` on 2026-11-20 reported 11 advisories (1 critical, 5 high, 5 moderate) in `next`, `sharp`, `zod`, `effect` and `source-map-js`. They must be triaged and upgraded or accepted with a reason before the next release.
- [ ] Lockfile changes are intentional: `git diff --cached pnpm-lock.yaml` adds only packages the change needs; review new package names for typosquatting and new maintainers.
- [ ] Any change to `allowBuilds` in `pnpm-workspace.yaml` (packages allowed to run install scripts) is justified in the commit.
- [ ] Installs in CI and Docker use `pnpm install --frozen-lockfile`.
- [ ] Dependabot alerts and version updates (`.github/dependabot.yml`), CodeQL code scanning, and GitHub secret scanning with push protection: **Planned**; enable them in the repository settings when the repository is public.

#### CI

Status: no CI exists (**Current**), so this applies to the first workflow that is added (**Planned**):

- [ ] top-level `permissions: contents: read`, raised per job only where needed;
- [ ] third-party actions pinned to a full commit SHA;
- [ ] no `pull_request_target` job that checks out or runs pull-request code; secrets are never available to forks;
- [ ] no secret printed, and `set -x` never used in a step that reads one;
- [ ] the workflow runs `pnpm test`, `pnpm typecheck`, `pnpm audit` and a secret scanner on every pull request.

### Step 3: replay, idempotency and authorization-bypass tests

Each case is a test in `tests/regression/`, named after the defect it prevents, following the test-first rule in `CLAUDE.md`.

| Attack | How to test | Status |
| --- | --- | --- |
| Action-code replay | use a consumed code again; use it on another method or path; use it after 60 s | **Current** by the local probes above; Worker by `worker-auth.test.mjs` |
| Action-code race | the same code sent concurrently; exactly one success | local probe above; Worker relies on the atomic `UPDATE` |
| Refresh-token reuse and race | reuse an old refresh token; two concurrent refreshes with one token | **Current** (`worker-auth.test.mjs`) |
| OAuth callback replay | replay `code` and `state` after a successful login; send a `state` from another browser | **Current** for login CSRF (`web-bff.test.mjs`); replay of a consumed auth transaction should also be asserted |
| IDOR on Worker rows | with session A, request `/api/me` and create download grants while changing every ID in the path or body to values owned by session B or that do not exist; expect no data from B and no row written for B | **Planned**: add when the next authenticated route changes |
| IDOR on the local API | once more than one profile or object-by-ID routes exist, swap IDs between profiles and expect `404` without leaking existence | **Planned** (single local profile today) |
| Write idempotency | send the same write twice with one `Idempotency-Key`: one effect, same response; the same key with a different body: rejected; concurrent duplicates: one effect | **Planned**: idempotency keys do not exist yet; download grants are created once per request today |
| Mass assignment | send extra fields (`userId`, `profileId`, `status`, `id`) to every write route; none is persisted | **Planned** with the first local write route |

### Step 4: free platform protections

`CLAUDE.md` requires every free protection where it applies. Current state:

| Protection | Where | Status | Notes |
| --- | --- | --- | --- |
| Cloudflare Turnstile | login start, download-grant creation and any future signup or post form on `apps/web`; verified in the Worker | **Planned** (not integrated) | free plan, unlimited verifications. The widget alone protects nothing: the Worker must call Siteverify with a new Worker secret, accept only `success: true` with the expected `hostname` and `action`, and treat each token as single use (valid 300 s). The `apps/web` CSP must allow the challenge origin. |
| Worker rate-limit buckets | `codes`, `login` | **Current** | other buckets **Planned** (see [Rate limiting and abuse protection](#rate-limiting-and-abuse-protection)) |
| Cloudflare Free Managed Ruleset | Worker hostname | **Open** | zone-level WAF rules need the Worker on a custom domain in a Cloudflare zone; a `workers.dev` hostname is not a zone the project controls (inference from the WAF docs). Decide on a custom domain first. |
| Cloudflare rate-limiting rule | Worker hostname | **Open** | the free plan allows one rule, IP-only counting, 10 s period and 10 s mitigation. The Worker is called server-to-server by the BFF, so an IP rule at Cloudflare would count Vercel's egress IPs, not visitors; per-visitor limits belong at Vercel and in the Worker buckets. |
| Cloudflare Bot Fight Mode | Worker hostname | **Open**, not recommended there | it applies to the whole domain, may challenge API traffic and cannot be skipped with WAF rules, so it would risk blocking the BFF. Reconsider only for a hostname that serves browsers directly. |
| Vercel DDoS mitigation | `apps/web` | **Current** (automatic on all plans) | nothing to configure |
| Vercel WAF custom rules and rate limiting | `apps/web` | **Planned** | Hobby allows 3 custom rules, one of them a rate-limit rule (fixed window, 10 s to 10 min, keyed by IP or JA4). Candidate: `/api/auth/*` and `/api/releases/*`. Start with the **Log** action, then switch to `429`. |
| Vercel Attack Mode | `apps/web` | available on demand | enable during an active attack only |
| CORS | Worker | **Current**: none sent, so browsers cannot call it cross-origin | an exact allowlist is **Planned** only if a browser ever calls the Worker directly; never reflect the request origin |
| GitHub secret scanning, push protection, Dependabot, CodeQL | repository | **Planned** | see the supply-chain checklist above |

Turning on any of these changes deployment configuration. Do it only when the user explicitly asks, then record the change here and in [ARCHITECTURE.md](ARCHITECTURE.md).

### Step 5: credential exposure

A credential seen by anyone or anything it was not meant for is compromised, whether it was committed, pasted in a chat, shown in a terminal, a screenshot, a CI log or a local log, and however briefly. Do not wait to find out whether it was used.

1. Revoke or rotate it immediately, before cleanup, investigation or the next commit:
   - `BFF_SHARED_SECRET` and `CLOUDFLARE_BFF_SHARED_SECRET`: generate one new value, set it with `wrangler secret put` and in the Vercel environment, redeploy both; until both match, every Worker route answers `BFF_REQUIRED`.
   - `TOKEN_HASH_PEPPER`: rotating it invalidates every stored hash, which logs out every session and voids pending action codes and grants. Rotate anyway; a forced logout is the intended effect.
   - `SESSION_SIGNING_SECRET`: logins in progress fail and must restart.
   - `GOOGLE_CLIENT_SECRET`: create a new secret for the OAuth client at the provider, update the Worker secret, then delete the old one.
   - Cloudflare, Vercel, GitHub or registry tokens: revoke in the provider dashboard and issue a new token with the narrowest scope.
2. Then follow [Incident response](#incident-response): assess exposure without repeating the value, remove it from files and, when needed, history, check forks, caches, CI logs and artifacts, add a preventive rule, and document the response without recording the value.

### Step 6: report

Every commit or push ends with a report in the conversation or pull request, in this form. Severities: **Critical**, exploitable remotely or exposes financial data or credentials; **High**, exploitable with a precondition the attacker can plausibly meet; **Medium**, needs an unlikely precondition or limits impact; **Low**, defense in depth. Critical and High block the commit or push until fixed. Medium and Low may be accepted only with a reason and an entry in [Open items](#open-items).

```markdown
## Offensive security review

Change: <one line>
Surfaces touched: <local API | Electron | Worker/D1 | BFF/LP | importers | secrets | dependencies | CI>

### STRIDE
- S: <threat or "n/a because …">
- T: …
- R: …
- I: …
- D: …
- E: …

### Checks run
- <command or test> → <result>
- Not run: <check> because <reason>

### Findings
| Severity | Finding | Status |
| --- | --- | --- |
| High | <what, where, how to reproduce without secrets> | fixed in this change / accepted: <reason, Open item n> |

### Limitations
- <tools not installed, environments not available>
```

### Coverage of the reference lists

Use this map to confirm the review did not skip a category that the change could hit.

| Reference | Where this review covers it |
| --- | --- |
| OWASP Top 10 2025: A01 Broken Access Control, A07 Authentication Failures | step 2 (local API, Worker, BFF), step 3 (IDOR, replay) |
| A02 Security Misconfiguration, A04 Cryptographic Failures | step 2 (headers, Electron options, Worker secrets), step 4 |
| A03 Software Supply Chain Failures, A08 Software or Data Integrity Failures | step 2 (dependencies, CI) |
| A05 Injection, A06 Insecure Design, A10 Mishandling of Exceptional Conditions | step 1, step 2 (bound statements, importers, generic errors) |
| A09 Security Logging and Alerting Failures | step 1 (repudiation); audit tables are **Planned** |
| OWASP API Security Top 10 2023: API1 and API3 object and property authorization, API5 function authorization | step 3 (IDOR, mass assignment) |
| API2 authentication, API4 resource consumption, API6 sensitive business flows | step 2 (Worker), step 4 (Turnstile, rate limits) |
| API7 SSRF, API10 unsafe consumption of APIs | step 2 (Worker): the only outbound calls are to the OAuth provider and its JWKS; any new outbound URL must be fixed server-side, never taken from input |
| API8 misconfiguration, API9 inventory | step 2 (headers, CORS); the route inventory is the scope table above |
| ASVS 5.0 chapters V1 to V16 (V17 WebRTC does not apply) | V2, V4, V8 in step 3; V5 in importers; V6, V7, V9, V10 in Worker and BFF; V3, V12, V13 in headers and Electron; V11, V14 in secrets and step 5; V15 in dependencies; V16 in step 1. Target level 2 for anything touching financial data or sessions. |
| CWE Top 25 (2025) | XSS (79), SQL injection (89), CSRF (352), missing or incorrect authorization (862, 863, 639), path traversal (22), code injection (94), unrestricted upload (434), deserialization (502), input validation (20), information exposure (200), SSRF (918), unbounded allocation (770): steps 2 and 3. Memory-safety entries apply only through native dependencies (`sharp`, Prisma engines, Electron) and are covered by dependency updates. |
| RFC 9700 | already met by the web flow (PKCE S256, exact redirect, rotating refresh tokens, no implicit or password grant); recheck when OAuth code changes, and apply it to desktop OAuth when it is built |

### Sources

Researched in November 2026; revisit when a new edition appears.

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) and the [2025 edition](https://top10.owasp.org/2025)
- [OWASP ASVS 5.0](https://asvs.owasp.org/) and its [chapter list](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en)
- [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10)
- OWASP cheat sheets: [Threat Modeling](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [CWE Top 25 (2025)](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html)
- [RFC 9700, OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- Cloudflare: [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/), [WAF managed rules](https://developers.cloudflare.com/waf/managed-rules/), [rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)
- Vercel: [Firewall](https://vercel.com/docs/vercel-firewall), [WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [pnpm audit](https://pnpm.io/cli/audit), [Dependabot configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates), [gitleaks](https://github.com/gitleaks/gitleaks), [TruffleHog](https://github.com/trufflesecurity/trufflehog)
