# Security

This document is the normative security and privacy reference for Talentum. It covers the threat model, authentication and sessions, authorization and CSRF, action codes, rate limiting, CORS and response headers, Electron hardening, the local API boundary, secrets management, file and content handling, supply chain and release integrity, and the controls that are verified by regression tests. Financial features must not be distributed until their essential controls are implemented and tested. Every statement carries a status: **Current** (implemented and verifiable in the code), **Planned** (decided but not implemented), or **Open** (no decision yet, or a known gap or conflict). The mandatory pre-commit and pre-push security gate lives in `CLAUDE.md` and is not repeated here.

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
- [Incident response](#incident-response)
- [Checklists](#checklists)
- [Open items](#open-items)

## Status conventions

- **Current**: present in the code today; where possible, a regression test is named.
- **Planned**: a decided requirement that the code does not implement yet. It must not be described to users as available.
- **Open**: no decision exists, or code and intent disagree. Each one is listed in [Open items](#open-items).

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
- **Current**: every route except `/api/action-codes` (bootstrap) and `/api/health/live` (infrastructure probe without application data) requires a local action code.
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

| Name | Where | Purpose |
| --- | --- | --- |
| `SESSION_SIGNING_SECRET` | Worker secret | derives (via SHA-256) the AES-GCM key that encrypts the PKCE verifier and nonce stored in `auth_transactions`; sessions themselves are opaque hashed tokens, not signed |
| `TOKEN_HASH_PEPPER` | Worker secret | pepper for the SHA-256 hashes of action codes, access tokens, refresh tokens, `state`, `nonce`, download grants and rate-limit bucket keys |
| `BFF_SHARED_SECRET` | Worker secret | authenticates the BFF through the `X-Talentum-BFF` header; also the source of the action codes' `context_hash` |
| `GOOGLE_CLIENT_ID` | Worker secret (may be a plain variable; it is public) | OAuth client identifier and expected ID-token audience |
| `GOOGLE_CLIENT_SECRET` | Worker secret | OAuth client secret for the code exchange |
| `APP_ENV`, `ALLOWED_ORIGIN`, `PUBLIC_WEB_URL` | `wrangler.jsonc` `vars`; overridden in `.dev.vars` locally | environment name, intended CORS origin (unused today), public site used to build the OAuth redirect URI |
| `CLOUDFLARE_API_BASE_URL` | root `.env` and Vercel runtime | Worker URL as seen by the BFF on the host or in production |
| `DOCKER_CLOUDFLARE_API_BASE_URL` | root `.env` | Worker URL as seen from the `talentum-web` container |
| `CLOUDFLARE_BFF_SHARED_SECRET` | root `.env` and Vercel runtime | must equal the Worker's `BFF_SHARED_SECRET`; a mismatch makes every Worker route answer `BFF_REQUIRED` |
| `DATABASE_URL`, `DOCKER_DATABASE_URL` | root `.env` | local SQLite location on the host and inside the container |

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
- **Current**: versioned Git hooks in `.githooks/` run `pnpm typecheck` and `pnpm test` before every commit and push (install with `pnpm hooks:install`). They do not scan for secrets; the manual gate in `CLAUDE.md` covers that.
- **Planned**: CI secret scanning on every diff and, periodically, on the full history. There is no CI in the repository.
- **Planned**: branch protection that blocks merges when the scanner finds a secret.
- **Planned** (recommended): Dependabot or Renovate, SAST, dependency analysis and CodeQL.
- A detected credential is revoked and rotated before it is removed from history, and its value is never printed in issues, logs or review comments.

### Audit of 2026-09-05

Status: **Current** as a historical record. A local scan for sensitive names, private keys and known token formats was run on the worktree and history. No real textual credential was found. Matches in `icon-badge.svg` and historical PNGs were classified as incidental sequences inside encoded or binary images. A pattern scan reduces risk but replaces neither a dedicated CI scanner nor GitHub secret protection.

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

## Incident response

A suspected exposure requires: stopping the affected distribution, preserving evidence without copying personal data, revoking credentials, fixing the cause, communicating the impact clearly and documenting preventive measures. For secrets already committed or pushed, follow the incident steps in `CLAUDE.md`: stop publication, revoke or rotate first, assess exposure without repeating the value, remove it and coordinate history cleanup when required, add a preventive rule, check forks, caches, CI logs and artifacts, and document the response without recording the secret.

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
- [ ] Private routes apply authentication, authorization, rate limiting and `Cache-Control: no-store`.
- [ ] Ephemeral codes have a hash, a short TTL and single use, and never enter audit or analytics.
- [ ] CORS accepts only explicitly authorized origins (**Planned**: no CORS today).
- [ ] Logs and events contain no secrets, public email, raw IP or financial content.
- [ ] Remote migrations are reviewed and applied by the backend operator, never by a frontend.

## Open items

1. **CSRF on `GET /api/auth/refresh`**: the BFF route rotates tokens and sets cookies on a `GET` with no origin check; it relies only on `SameSite=Lax`, which allows cross-site top-level navigations. Decide whether to make it a `POST` with an origin check or to require a same-site fetch signal.
2. **Missing `Origin` accepted**: `sameOrigin()` returns `true` when the `Origin` header is absent, so BFF mutations fall back to `SameSite=Lax` alone.
3. **Logout with an expired access token**: the Worker requires a valid access token for logout, so the refresh family is not revoked server-side when the access token has expired.
4. **Domain conflict for the OAuth redirect**: `apps/web/src/site.ts` uses `https://talentum-tech.vercel.app`, while `cloudflare/wrangler.jsonc` sets `PUBLIC_WEB_URL` and `ALLOWED_ORIGIN` to `https://talentum.vercel.app`. The Worker builds the production redirect URI from `PUBLIC_WEB_URL`, so the registered redirect and the published site must be reconciled.
5. **Worker action-code retention**: consumed and expired rows stay in `action_codes`; decide on a purge job or deletion on consume.
6. **Action-code context binding**: `context_hash` is the same for every caller (hash of the BFF secret); binding to session or origin is not implemented in either backend.
7. **`Cache-Control` gaps**: the `403` from the local `/api/system/status` and the BFF route handlers do not set `Cache-Control: no-store`.
8. **Download grants not enforced**: grants are written to D1 but never validated; the BFF redirects to the artifact URL directly.
9. **Vercel package allowlist**: no CI or manifest exists, and `Dockerfile.web` copies the whole repository; decide how the Vercel upload is restricted.
10. **Local app CSP**: decide the CSP for the local app and Electron renderer (the local app sends none today).
11. **Forwarded IP trust**: the BFF trusts the first `X-Forwarded-For` value; this is correct behind Vercel's proxy but not when the BFF is exposed directly (for example, outside Compose's loopback binding).
12. **E2EE backup key recovery**: no recovery mechanism has been decided.
