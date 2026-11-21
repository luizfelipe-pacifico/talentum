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
- [Local vault and desktop login](#local-vault-and-desktop-login)
- [Statement import](#statement-import)
- [Own Pix identifiers](#own-pix-identifiers)
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

Financial data stays on the device (local SQLite, accessed only by the local backend). The Cloudflare D1 database holds only minimal identity, consents, sessions, encrypted two-step verification secrets, releases and download grants, community content, public news, and security and audit events, and is reached only through the Worker. See [DATABASE.md](DATABASE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Threat model

| Threat | Minimum control | Status |
| --- | --- | --- |
| Malicious import file | size limits, real type detection, isolated parser and timeout | **Current**: size, row, column and field limits, content-based format detection, an enforced parse deadline, and PDF parsing in an isolated worker thread with memory and hard time limits ([Statement import](#statement-import)); **Open**: the CSV and OFX parsers still run in the request process |
| Hostile file name | the original name is treated as a label, never as a path | **Current**: the name is sanitized, stored only as metadata and the file is never written to disk |
| Local API reached by another process or site | loopback bind, `Host` check, controlled origin, a per-session ephemeral secret and a local session | loopback bind, `Host` check, `Origin` check on code issuance and a local session required for every data route **Current** ([Local vault and desktop login](#local-vault-and-desktop-login)); per-run bootstrap secret **Current** in code for the packaged app only |
| Theft of the local database (copied file, backup, synced folder, stolen disk) | whole-database encryption with a key that never touches the disk in clear | **Current**: libSQL encryption with a random 256-bit key wrapped under the password and the recovery code with scrypt; `tests/vault-database.test.mjs` asserts the file has no SQLite header and no plaintext marker ([ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)). Own Pix identifiers keep their own layer ([Own Pix identifiers](#own-pix-identifiers)) |
| Someone at the computer (or phone browser) while the app is closed or locked | local password; nothing rendered before unlock; progressive delay | **Current**: the interface mounts nothing before unlock; every data route needs a session; five free attempts, then 30 s doubling to 1 hour, persisted |
| Someone at the computer while the app is unlocked and unattended | idle lock, manual lock, lock on system sleep | **Current**: idle lock (default 10 minutes, 1 to 60), "Bloquear agora", and `powerMonitor` suspend/lock-screen in the desktop app |
| Offline guessing against a copied vault file | memory-hard KDF, minimum length, common-password blocklist | **Current**: scrypt N = 2^17, r = 8, p = 1 per guess, 12-character minimum and blocklist. The second factor does **not** help here: the TOTP secret is encrypted under the same key, so the only defense against offline guessing is the password and the scrypt cost. The progressive delay lives in the same file and can be reset by whoever copies it |
| Lost password | recovery path without cloud escrow | **Current**: a 160-bit recovery code shown once (confirmation required, rotated after use). Without the password and the code the data is unrecoverable, by design |
| Theft of the remote backup | AES-256-GCM on the client, key never on the server | **Planned** (no backup feature yet) |
| OAuth hijacking | PKCE, `state`, nonce, strict redirect and short-lived tokens | **Current** for the web login |
| Compromised dependency | lockfile, review, alerts and controlled updates | lockfile, Dependabot configuration, dependency review on pull requests and CodeQL **Current** in the repository; enabling alerts in the GitHub settings is pending (maintainer) |
| Hostile news content | sanitization, CSP and safe external opening of links | **Current**: DTD/entity refusal, plain text only, `https` links on the source's hosts, Electron external-link allowlist ([ARCHITECTURE.md §2.8](ARCHITECTURE.md#28-news-and-summaries)) |
| Prompt injection in news | separate instructions from content; give the model no tools and no private data | **Current**: delimited data, no tools, token cap, cleaned plain-text output, deterministic fallback (`worker-news.test.mjs`) |
| Account takeover after a phished Google session | second factor | **Current**: optional TOTP with recovery codes, lockout and replay refusal ([Two-step verification](#two-step-verification)) |
| Bots on login and community | challenge and rate limits | **Current** in code: Turnstile on login start and content creation, per-route and per-user buckets |

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

The `state` is bound to the browser that started the login: `GET /api/auth/start` stores a SHA-256 hash of the `state` in the `__Host-talentum-oauth-state` cookie (600 seconds, the same lifetime as the Worker's auth transaction), and the callback only proceeds when the received `state` matches it (constant-time comparison), which prevents login CSRF. The Worker consumes the auth transaction atomically (`UPDATE … WHERE consumed_at IS NULL`). The refresh claims the old token with `UPDATE … WHERE consumed_at IS NULL` before issuing the successor; in a race, the second attempt is treated as reuse and revokes the family. Session cookies are always sent with `Secure`, which the `__Host-` prefix requires and which browsers accept on `http://localhost`. Logout always clears the cookies, even when the Worker is unavailable. Mutation origin checks and redirect targets use the requested `Host` (`apps/web/src/server/site-url.ts`), not `request.url`. Since the cloud completion, login starts with a same-origin `POST` from `/entrar` carrying the Turnstile token; submitting it is the acceptance of the current Terms and Privacy versions, recorded in `consents` by the callback. The return page travels in `__Host-talentum-return` and is accepted only from a fixed list (`apps/web/src/server/return-to.ts`).

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
| Access token | short, initially 5–15 min (**Current**: 15 min) | `HttpOnly` cookie held by the BFF (**Current**) | Electron main-process memory (**Current**) | minimal claims; stored as a hash only |
| Refresh token | bounded by the session (**Current**: 30 days) | `Secure`, `HttpOnly`, `SameSite` cookie (**Current**) | operating-system vault through `safeStorage` (**Current**) | hash, family and state only (**Current**) |
| ID token | login only | backend only (**Current**) | backend-local (**Planned**) | never used as a session (**Current**) |
| `state`/`nonce`/PKCE | one transaction | bound to the user agent (**Current**) | main-process memory for one sign-in (**Current**) | hash and expiry when persisted (**Current**; verifier encrypted) |

### Refresh-token families

- **Current**: refresh tokens rotate on every use; the successor is linked through `successor_token_id`.
- **Current**: reuse of a previous token (or losing the atomic claim race) sets `revoked_at` and `compromise_detected_at` on the family and revokes the session, then answers `REFRESH_REUSE_DETECTED`.
- **Current**: reuse writes a `REFRESH_REUSE` security event (risk `HIGH`), without token, e-mail or IP (`worker-open-items.test.mjs`).
- **Current**: web and desktop families are separate (`auth_sessions.client_kind`); a desktop refresh token is refused by the web refresh and vice versa.
- **Planned**: revocation on risk change (for example, privilege change or suspicious activity).

### Logout

- **Current**: `POST /api/auth/logout` on the BFF checks origin, asks the Worker to revoke the session and every refresh family of that session, and always deletes both cookies and redirects with `303`.
- **Current**: the BFF also sends the refresh token, and the Worker revokes the session and its families by either token, so an expired access token no longer leaves the family alive (`worker-open-items.test.mjs`). The answer is always `{ok:true}`.

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
| re-authentication for high-risk actions | **Partial**: disabling two-step verification or regenerating recovery codes needs a current code; account deletion needs the typed confirmation |

### Web rules

- The refresh token never goes into `localStorage` or `sessionStorage`. **Current**.
- The host cookie uses `Secure`, `HttpOnly`, `SameSite` and a minimal `Path`. **Current**, except that `Path` is `/` for all three cookies.
- Every cookie-authenticated mutation has CSRF protection. **Current**: `sameOrigin()` on every BFF `POST`, missing `Origin` refused, no `GET` changes state except the desktop handoff (see [Desktop sign-in](#desktop-sign-in)).
- The session is regenerated after login and after privilege change. **Current** for login (a new session and family per login); privilege change does not exist yet.
- Private responses use `Cache-Control: no-store`. **Current** in the Worker and in every BFF route (`apps/web/src/server/http.ts`).
- CORS uses an exact allowlist and never reflects the origin with credentials. **Current**: see [CORS, response headers and CSP](#cors-response-headers-and-csp).

### Two-step verification

Status: **Current** in code (Worker, BFF and `/conta`); needs the `MFA_ENCRYPTION_KEY` Worker secret.

- TOTP per RFC 6238 (SHA-1, 6 digits, 30 s), verified against RFC 6238 vectors (`worker-mfa-desktop.test.mjs`). The secret (20 random bytes) is generated by the Worker and stored only as AES-GCM ciphertext under `MFA_ENCRYPTION_KEY`, with the account ID as associated data. The `otpauth://` URI is shown only while the enrollment is pending (15 minutes), labelled with the public name, not the e-mail, and rendered as a QR code on the server (`apps/web/src/server/qr.ts`, no external service).
- Activation requires the first valid code. Ten single-use recovery codes are generated, stored as peppered hashes and displayed once: a ciphertext copy lives for 10 minutes and is deleted by the reveal (`DELETE … RETURNING`). The reveal is triggered by rendering `/conta/mfa/codigos`; a third party forcing that navigation can only burn the display (the person regenerates codes with a current TOTP), never read the codes.
- At login, the callback stores a 5-minute single-use challenge (hash only) and issues no session until `POST /api/auth/mfa/verify` accepts a code. The window is ±1 step; the accepted step is written atomically (`last_used_step`), so the same code cannot be used twice. Five wrong codes end the challenge.
- Lockout per account: every fifth consecutive failure locks for 5 minutes, doubling up to 1 hour; per IP, the `mfa-ip` bucket (20 per 10 minutes). Events: `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFY` failures, `MFA_LOCKOUT`, `MFA_RECOVERY_CODE_USED`, `MFA_RECOVERY_CODES_REGENERATED`.
- Disabling or regenerating codes requires a current code. Account deletion removes every MFA row.
- **Open**: rotation of `MFA_ENCRYPTION_KEY` has no re-encryption path; rotating it forces re-enrollment.

### Desktop sign-in

Status: **Current** in the Worker, the BFF and `electron/cloud-auth.cjs` (`tests/electron-cloud-auth.test.mjs`); the packaged app has no Worker URL yet and reports the account as unavailable. Rules for the integration (RFC 8252 and RFC 9700):

- the app is a public client: no Google or Talentum secret in the installer; it proves possession of its own PKCE S256 verifier;
- the redirect is a loopback with an IP literal (`127.0.0.1` or `[::1]`), an explicit port 1024–65535 and the path `/callback`; `localhost`, `https`, query strings, credentials and other paths are refused by the Worker and re-checked by the BFF before redirecting the browser;
- the browser starts at the BFF (`/api/auth/desktop?handoff=`), so the `state` is bound to that browser exactly like the web login; the handoff is single use and expires with the request (10 minutes). This is the only `GET` that starts state; forcing it only starts a login whose result goes to the loopback registered by whoever started it;
- the code delivered to the loopback lives 60 seconds and is consumed by any redemption attempt; wrong verifier, other redirect or late use fail with `INVALID_GRANT` and a `DESKTOP_TOKEN` security event;
- desktop sessions are `DESKTOP` kind and only open `/api/desktop/*`; two-step verification and consent recording happen in the browser exactly as for the web;
- the app keeps the access token in backend memory and the refresh token in the operating-system vault; without a vault, persistent login stays off; the renderer never receives either token;
- logout calls `/api/desktop/auth/logout` and removes local credentials without touching financial data.

All six rules are **Current**: system browser through `shell.openExternal`, no client secret, a one-shot loopback listener on `127.0.0.1` with a random port and constant-time `state` check, PKCE S256, the refresh token sealed with `safeStorage` (Keychain, DPAPI, libsecret/KWallet; nothing persisted with Linux `basic_text`), the renderer receiving only `{connected, persistent, displayName}`, and sign-out revoking remotely and deleting the local copy without touching the vault or the database. Signing in with Google never unlocks local data.

## Authorization and CSRF

- **Current**: the Worker requires the `X-Talentum-BFF` header (compared through SHA-256 digests with `BFF_SHARED_SECRET`) on every route except `GET /health`; otherwise it answers `BFF_REQUIRED` (403).
- **Current**: authenticated Worker routes (`/api/auth/logout`, `/api/me`, `/api/releases`, download grants) resolve the session from `Authorization: Bearer` against non-revoked, non-expired `auth_sessions`; download grants are written for the session's own `user_id`.
- **Current**: the BFF's `POST` mutations (`/api/auth/logout`, `/api/releases/[releaseId]/download-grants`) call `sameOrigin()`, which compares the `Origin` header with the requested host.
- **Current**: `sameOrigin()` refuses a missing `Origin` (browsers send it on every `POST`); `web-bff.test.mjs` and `cloud-consent.test.mjs` cover it.
- **Current**: refresh is `POST /api/auth/refresh` with the origin check; `GET` only redirects to `/entrar`, which auto-submits the `POST` from the site itself.
- **Current**: community and account routes authorize per owner (author for edits, author or moderator for deletes, own sessions only) and per role (`user_roles.MODERATOR`), tested as IDOR cases in `worker-community.test.mjs` and `worker-open-items.test.mjs`.
- **Current**: the local API has a single local profile; each route scopes queries by the local `profileId`, and every data route requires the local session opened by the vault password (`SameSite=Strict` cookie plus the action code, which already forces a JSON preflight cross-origin).

## Action codes

Every frontend-to-backend request, except the bootstrap endpoint that issues the code, carries a backend-issued, opaque, single-use action code with a short TTL in the `X-Action-Code` header. The code contains no user data, is not used for analytics or tracking, and does not replace authentication, authorization, CSRF protection, idempotency or rate limiting.

### Required properties

| Property | Local API (`src/server/action-codes.ts`) | Worker (`cloudflare/src/index.ts`) |
| --- | --- | --- |
| generated by the backend with a CSPRNG, at least 128 bits of entropy | **Current** (32 random bytes) | **Current** (32 random bytes) |
| only a hash and minimal metadata stored | **Current**: SHA-256 hash in an in-memory `Map` with `{method, path, expiresAt}` | **Current**: peppered SHA-256 hash in the D1 `action_codes` table |
| initial maximum TTL of 60 seconds | **Current** (60 s) | **Current** (60 s) |
| bound to method and route | **Current** | **Current** |
| bound to origin/context and to the session when one exists | **Current**: bound to the local session (issued only with a live session cookie, accepted only together with the cookie of that same session, refused once that session ends; `tests/vault-session-enforcement.test.mjs`, `tests/regression/action-code-accepted-without-session-cookie.test.mjs`); the issuer also refuses a foreign `Origin` | **Partial**: `context_hash` separates BFF codes from public codes (a public code never opens a BFF route); no binding to a session |
| consumed atomically, exactly once | **Current** (deleted from the map before comparison) | **Current** (`UPDATE … SET consumed_at … WHERE consumed_at IS NULL AND expires_at > now`) |
| removed after consumption or expiry | **Current** (deleted on consume; expired entries swept on each issue or consume) | **Current**: the cron deletes rows one day after expiry |
| never in URLs, telemetry, analytics, logs or historical databases | **Current** (header only; no logging) | **Current** for URLs and logs; the hash is kept in D1 (see the row above) |
| no identity or business information in the value | **Current** | **Current** |
| `Cache-Control: no-store` on issue and consume | **Current** for issue and for successful responses; **Open**: the `403` from `/api/system/status` lacks `Cache-Control` | **Current** (every Worker response) |
| generic error that does not reveal whether the code existed | **Current** (`INVALID_ACTION_CODE`) | **Current** (`INVALID_ACTION_CODE`, uniform message) |
| authentication, authorization, CSRF, rate limiting and idempotency kept independent | partially: see the sections above; idempotency keys are **Planned** | **Current**: `Idempotency-Key` on content creation, natural idempotency elsewhere |

The original plan to store codes in KV or a Durable Object is superseded by the D1 table in the Worker; moving away from D1 would require an ADR.

## Rate limiting and abuse protection

- **Current**: fixed windows in D1 `rate_limit_windows`, one atomic UPSERT with `RETURNING` per hit (concurrent requests cannot read the same old count), keyed by a peppered hash of bucket and subject; the raw IP is never stored. Buckets cover code issuance (BFF and public), login start, callback, refresh, logout, private reads, download grants, account deletion, community reads, posts, comments, edits, votes, reports, moderation, news, summaries (per IP and a global AI budget), two-step verification and the desktop routes; values are listed in [ARCHITECTURE.md §3.5](ARCHITECTURE.md#35-cloud-api-contract-worker-and-bff) and owned by `cloudflare/src/lib/limits.ts`.
- **Current**: the client IP is `X-Talentum-Client-IP` only after the BFF secret check, else `CF-Connecting-IP`; an unauthenticated caller cannot choose its bucket.
- **Current**: Turnstile ([Step 4](#step-4-free-platform-protections)) is always required on login start and on post, comment and report creation. Decision: always, not adaptive. Adaptive challenges need a failure signal per visitor; login start has none before the person exists, and content creation is rare enough that one challenge per post costs little. Votes and edits stay with session plus rate limit.
- **Planned**: values calibrated with telemetry; progressive delay; a rate limit on the local API.
- **Planned**: edge WAF rules (maintainer checklist in [ARCHITECTURE.md §3.8](ARCHITECTURE.md#38-cloudflare-setup-and-deployment), step 11).

## CORS, response headers and CSP

- **Current**: exact CORS in the Worker. Only `ALLOWED_ORIGIN` gets a preflight `204` (no credentials, `Vary: Origin`, allowed headers `Content-Type, X-Action-Code`); any other `Origin` is refused with `403 ORIGIN_NOT_ALLOWED`, on preflights and on ordinary requests. `X-Talentum-BFF` is never allowed, so the browser still cannot complete a BFF call; server-to-server callers send no `Origin` (`worker-open-items.test.mjs`).
- **Current**: every Worker JSON response carries `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. Errors use the shape `{error:{code,message}}` with a generic message.
- **Current**: `apps/web` sends a per-request nonce CSP from its middleware (`default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `'unsafe-eval'` and `ws:` only in development) plus `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and `Strict-Transport-Security` from `apps/web/next.config.ts`. The CSP middleware does not run on `/api` routes.
- **Current** (2026-11-20): the local app, and therefore the Electron renderer, receive a per-request nonce CSP from `src/middleware.ts` (`src/server/csp.ts`): `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'` for scripts), `style-src 'self' 'unsafe-inline'` (React `style` props), `img-src 'self' data: blob:`, `font-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `'unsafe-eval'` and `ws:` only under `next dev`. The root layout reads the nonce (which makes pages dynamic) and applies it to the theme script. Pages also get `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Checked in headless Chromium on `next dev`: no CSP violation and no hydration error in either theme (`tests/regression/local-app-csp.test.mjs`).
- **Current**: the local API middleware answers non-loopback hosts with `HOST_NOT_ALLOWED` (403, `no-store`).

## Electron hardening

Status of each control in `electron/main.cjs` and `electron/preload.cjs`:

- **Current**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Current**: the preload exposes, through `contextBridge`, only three window functions (`minimize`, `toggleMaximize`, `close`) and `bootstrapSecret()`, which asks the main process for the per-run local bootstrap secret over the `app:bootstrap-secret` IPC channel and receives it, or `null` when the sender frame is not the app origin or no secret exists (see [Local API boundary](#local-api-boundary)), and `installUpdate(version)`, which passes one string to `app:update-install`; the main process validates it and decides URL, download and verification on its own. It never exposes `ipcRenderer`, the filesystem or `child_process` (`tests/electron-security.test.mjs`).
- **Current**: `setWindowOpenHandler` denies every new window; `will-navigate` blocks navigation outside the app origin.
- **Current**: external links open in the system browser only when the protocol is `https:` and the host is on a fixed allowlist.
- **Current**: the default session denies every permission request.
- **Current**: IPC handlers act only when the sender frame belongs to the app origin, including `cloud:status`, `cloud:sign-in` and `cloud:sign-out`; the preload never exposes a token.
- **Current**: `powerMonitor` `suspend` and `lock-screen` ask the windows to lock the local vault; closing the last window stops the packaged backend (the key leaves memory) on every system, and on macOS `activate` restarts it locked.
- **Current**: single-instance lock and no application menu.
- **Current**: in development and Docker the window loads `TALENTUM_URL` or `http://localhost:3000`; a packaged build without `TALENTUM_URL` starts its own backend on a random `127.0.0.1` port and loads that origin. No remote content is loaded with Electron privileges.
- **Current**: a restrictive CSP for the renderer (see above).
- **Current in the installer configuration**: Electron fuses (`build.electronFuses`): `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false`, `grantFileProtocolExtraPrivileges: false`, `enableCookieEncryption: true`. `runAsNode` stays `true` because the packaged backend and `prisma migrate deploy` start with `ELECTRON_RUN_AS_NODE`; `tests/regression/electron-fuses.test.mjs` fails if the code stops needing it while the fuse stays on. **Planned**: move both to `utilityProcess` and turn `runAsNode` off; ASAR with integrity validation.
- **Current in code**: the packaged app refuses to start with any Chromium or Node debugging switch (`--remote-debugging-port`, `--remote-debugging-pipe`, `--remote-debugging-address`, `--remote-allow-origins`, `--inspect`, `--inspect-brk`): `electron/main.cjs` exits with code 1 before creating a window or the backend. Found in the offensive review of the first real package (2026-11-20): with the port open, any program of the same user could read the unlocked window and drive the local session, and the fuses cover only `--inspect` and `NODE_OPTIONS` (`tests/regression/packaged-app-accepts-remote-debugging.test.mjs`). Development builds keep debugging.
- **Current in code**: the update installer is downloaded, checked and executed only by the main process through `app:update-install`; nothing runs unless the SHA-256 matches GitHub's published digest **and** an Ed25519 signature verifies against the release public key. That key does not exist yet, so the handler refuses before downloading ([ARCHITECTURE.md](ARCHITECTURE.md#45-ipc)).
- **Planned**: code signing (Windows Authenticode; macOS Developer ID with hardened runtime and notarization, configured in `build.mac` with credentials read only from environment variables) and the release signing key. Packaging with `electron-builder` is configured and produces unsigned test artifacts only ([ADR 0004](decisions/0004-electron-packaging.md)). The macOS entitlements grant only `com.apple.security.cs.allow-jit` (`packaging/entitlements.mac.plist`).
- **Planned**: never accept invalid certificates nor disable Chromium protections (no code does so today; the rule applies to future changes).

## Local API boundary

- **Current**: the local Next.js backend is the only process that reaches SQLite; the renderer calls documented route handlers in `src/app/api`.
- **Current**: `src/middleware.ts` rejects every `/api` request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]`, blocking DNS rebinding.
- **Current**: Docker Compose publishes the local app only on `127.0.0.1`.
- **Current**: every route except `/api/action-codes` (bootstrap) and `/api/health/live` requires a local action code, and every route except those two and the four public vault routes requires a live local session through it. The liveness probe is a documented exception (`CLAUDE.md`, Architecture rules): it returns no application data, the interface never calls it, and only the Compose health check and `pnpm dev:all` use it.
- **Current**: every local API read and write is scoped by the local `profileId` in its `where` clause, including updates and deletes addressed by an opaque ID; an ID from the URL or body is never authorization on its own.
- **Current**: the onboarding step, the transaction edit, the timeline revert, reconciliation decisions and their reverts, and the restoration of a reverted transaction edit claim their state atomically (a conditional `updateMany` whose affected-row count is checked); a concurrent second attempt is refused and writes nothing. The import compares duplicates inside its transaction after its first write reserves the database, the local profile is unique in the database (`singletonKey`), and a manual cash entry is idempotent by a client key unique per profile.
- **Current in code, packaged app only**: a per-run ephemeral bootstrap secret. The packaged Electron main process generates 32 random bytes as `TALENTUM_LOCAL_BOOTSTRAP_SECRET` for the backend it spawns; when that variable is set, `POST /api/action-codes` issues a code only to a caller presenting the same value in `X-Talentum-Bootstrap` (timing-safe comparison, `403 BOOTSTRAP_DENIED` otherwise).
- **Current in code, packaged app only**: the secret reaches the window over the trusted IPC channel `app:bootstrap-secret`. The main process answers only when the sender frame belongs to the app origin; the preload exposes it as `bootstrapSecret()` and the API client sends it in `X-Talentum-Bootstrap`. **Open**: any script running in the renderer can call it ([Open items](#open-items), item 15). Exercised end to end on the Linux AppImage on 2026-11-20: the window obtains codes, and a loopback process without the secret gets `403 BOOTSTRAP_DENIED`.
- **Current**: in development and Docker the bootstrap variable is unset, but a loopback process without the session cookie only reaches the four public vault routes; it cannot read data without the password.
- **Current**: origin control on code issuance: `POST /api/action-codes` refuses a browser `Origin` that is not the requested loopback `Host`. A web page the user visits therefore cannot obtain codes (browsers always send `Origin` on a cross-origin `POST`). Other routes need a code, so they inherit the check; non-browser loopback processes, which send no `Origin`, are still not stopped outside the packaged app.
- **Current in code, packaged app only**: a random loopback port chosen at start; development and Docker keep the fixed port 3000.
- **Current**: a body-size ceiling on every local API write, by declared `Content-Length` in the middleware (see [Statement import](#statement-import)).
- **Current**: write conflicts are translated by one mapper (`prismaFailure`, `src/server/http.ts`): `P2002` becomes `409`, `P2025` becomes `404`, anything else a generic `500`, always in the `{error:{code,message}}` shape.
- **Planned**: a rate limit on the local API.

## Local vault and desktop login

Status: **Current** ([ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)). Applies to the downloaded app on Windows, Linux and macOS and to the Docker development setup.

**Keys.** A random 256-bit DEK encrypts the whole SQLite file (libSQL `encryptionKey`, HKDF subkey `database`). The DEK is wrapped with AES-256-GCM (purpose-bound AAD) under `scrypt(NFKC(password), 16-byte salt, N = 2^17, r = 8, p = 1)` and under the same KDF of the canonical recovery code. Wrapped keys live in `talentum-local.vault` (atomic write, mode `0600`, outside the database, git-ignored, excluded from installers). The DEK exists only in backend memory after unlock and is zeroed on lock.

**Password policy.** At least 12 characters, at most 256, a blocklist of common and Portuguese-language leaked passwords, refusal of repeated or sequential strings, and a strength estimate shown while typing (`src/lib/password-policy.ts`, applied by the backend; the screen is never the barrier). No composition rules (NIST SP 800-63B §3.1.1.2).

**Recovery code.** 160 bits, Crockford Base32 in eight groups, shown once; the interface requires the person to declare it saved. An unconfirmed code is replaced at the next unlock; a used code is replaced at once; generating a new one from Settings requires the password.

**Session.** Unlock returns a random 256-bit token in `talentum-session-<port>` (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when served over HTTPS; the local app is loopback HTTP). Only its SHA-256 is kept in memory. Action codes are issued only to a live session and bound to it: consuming one also requires the request's own session cookie, so a captured code is useless without the cookie (`src/server/action-codes.ts`, found by the offensive review of 2026-11-20): this is the single enforcement point every route already passes through, and `tests/vault-session-enforcement.test.mjs` enumerates every `src/app/api/**/route.ts` to prove that each handler consumes a code and that no path outside `/api/vault/status`, `/setup`, `/unlock`, `/recover` receives one without a session. `db` throws `VaultLockedError` while locked, as a last layer. Restarting the backend ends every session.

**Auto-lock.** Idle lock after 10 minutes by default (1 to 60, Settings > Security), counted from real user input that the interface reports at most once a minute; automatic polling does not count. A timer locks even when no request arrives. "Bloquear agora" in the header locks every window. The desktop app also locks on system suspend and screen lock.

**Attempts.** Five free attempts, then 30 s doubling up to 1 hour, persisted in the vault file (survives restarts), checked before the KDF runs (also limits CPU abuse). The error is the same whether the password, the authenticator code or the recovery code is wrong.

**Second factor (TOTP, RFC 6238).** Optional; SHA-1, 6 digits, 30 s, ±1 step, a used step refused, ten single-use backup codes stored as HMACs under a DEK subkey. Enrollment requires the password, renders the QR locally from a module matrix and activates only after a valid code; disabling requires the password and a current code. **Honest limit:** the TOTP secret is encrypted under the DEK, so the second factor is a gate enforced by the backend against someone using the app with a known or observed password. It adds no cryptographic strength against someone who copies the files and guesses the password offline; against that, only the password and the scrypt cost protect the data.

**What it does not protect.** A compromised operating-system account or malware running while the app is unlocked (it can read process memory or drive the window); the hex key string passed to libSQL, which stays in the JavaScript heap until collected; old plaintext blocks left by SSD wear leveling, copy-on-write or synced folders after migrating an earlier plaintext database (full-disk encryption remains recommended); a phone or another computer if someone changes the loopback bind (never supported: the local app binds to `127.0.0.1` only; there is no mobile app).

**Desktop Google sign-in** creates or links the cloud account only; it never unlocks local data and no key to local data is sent anywhere. Controls in [Electron and desktop OAuth](#electron-and-desktop-oauth).

Coverage: `tests/vault-crypto.test.mjs` (KDF, envelope, wrong password, tampering, recovery code format, password policy, RFC 6238 vectors, replay), `tests/vault-database.test.mjs` (file encryption, legacy plaintext migration and removal, vault file mode and content, repeated setup, locked `db`, persisted progressive delay, idle lock, password change, recovery, TOTP with uniform errors and replay refusal, backup codes, auto-lock bounds, migration runner idempotency and gates), `tests/vault-session-enforcement.test.mjs`, `tests/electron-cloud-auth.test.mjs`, `tests/electron-security.test.mjs` and the Playwright `tests/e2e/vault.spec.ts`.

## Statement import

Status: **Current**. Controls implemented in `src/server/import/`, all applied before any write:

- a size ceiling (8 MiB) checked on the uploaded file, plus ceilings on rows, columns and characters per field (`limits.ts`). **Current** (2026-11-20): the middleware refuses a request by its declared `Content-Length` before the route runs (`src/server/body-limits.ts`: 8 MiB plus 64 KiB of multipart envelope for the two upload routes, which also require the header, `411` otherwise; 1 MiB for every other API write), and `readStatementUpload` repeats the check before `request.formData()`. Verified on `next dev`: a 20 MiB upload is answered `413` in milliseconds;
- the format is recognized by content; the declared extension and `Content-Type` decide nothing;
- a control byte in the file fails the import: a statement is text, and binary content disguised as CSV is the vector to block (`BINARY_CONTENT`);
- decoding tries strict UTF-8 before Windows-1252, in that order: the reverse would silently decode a UTF-8 file wrongly;
- no embedded content is executed, and the OFX reader resolves no external entity ([ADR 0002](decisions/0002-own-ofx-parser.md));
- the original name is sanitized and used only as a label; the file is never written to disk;
- the statement content is not retained: `ImportFile` stores name, size, type, encoding and hash;
- error messages use a stable code and generic text, with no local path, SQL, internal name or document excerpt;
- every importer query is scoped by `profileId`, and the target account is validated as belonging to the profile: an opaque ID is not authorization.

**Current**: `PARSE_TIMEOUT_MS` is enforced as a cooperative deadline between parsing phases and every 256 rows (`422 PARSE_TIMEOUT`). **Open**: the parser runs inside the request process rather than in an isolated worker, so one pathological row is not interrupted mid-row.
**PDF (Current, [ADR 0006](decisions/0006-pdf-import.md)).** On top of the controls above, PDF import:

- recognizes PDF only by the `%PDF-` signature in the first kilobyte;
- extracts text with `pdfjs-dist` without executing anything: no `eval` or `new Function` (absent from PDF.js 6, checked by a test, and `isEvalSupported: false` still passed), `enableXfa: false`, no scripting API, PDF.js's own worker module loaded inside the isolated thread described below (no worker URL);
- fetches nothing: no font faces, no system fonts, no standard-font or CMap URL, `useWorkerFetch: false`, `disableAutoFetch`, `disableStream`; `pdfjs-dist` is a server external package, never bundled for the browser;
- refuses the whole file above 40 pages, 400,000 extracted characters or 8 seconds (`TOO_MANY_PAGES`, `PDF_TOO_MUCH_TEXT`, `PDF_TIMEOUT`) and refuses encrypted files (`PDF_ENCRYPTED`); truncating would omit entries silently;
- parses in an isolated `node:worker_threads` thread, never in the server thread that holds the unlocked vault key (`src/server/import/pdf/extract.ts` supervises `extract-worker.ts`): the thread receives only a transferred copy of the file bytes and the numeric limits in `workerData`, `env: {}` (no environment variable, so no bootstrap secret, database URL or other secret), no `argv`, no stdin, and only the `--experimental-strip-types` family of `execArgv` flags (never `--inspect`); `resourceLimits` caps the heap at 256 MiB old and 32 MiB young generation and the stack at 4 MiB, and exceeding them ends only the thread (`413 PDF_TOO_COMPLEX`); a hard wall-clock deadline of 12 seconds, measured by the server, calls `terminate()` even in the middle of a synchronous PDF.js step (`422 PDF_TIMEOUT`); a crash, an unexpected exit or a malformed reply is `422 PDF_READER_FAILED`; at most two PDF threads run at once and the rest wait;
- treats the thread's reply as untrusted: a strict schema (no extra fields, finite numbers, integer pages and line numbers within the limits, at least one line, only known error codes) plus coherence checks (sequential line numbers, pages within the page count, character count equal to the sum of the lines) run before the layout reader sees anything; the thread's stdout and stderr are drained and discarded, because PDF.js warnings may quote document content;
- writes no entry below the confidence threshold: it becomes a `LOW_CONFIDENCE` issue whose message names the field and the page, never the line content;
- warns (`PDF_ACTIVE_CONTENT_IGNORED`) when the raw bytes declare JavaScript, attachments, launch or automatic actions; the warning is informational, the protection is that nothing runs.

Card statement items use the same pipeline (`POST /api/card-statements/:statementId/items/import`), with the statement validated as belonging to the profile before the file is read.

**Open**: the CSV and OFX parsers still run inside the request process (see above); only PDF parsing is isolated.

Coverage: `tests/import-pdf-worker.test.mjs` (a thread that never yields is terminated at the hard deadline with `PDF_TIMEOUT` while the server event loop keeps running; a thread that exhausts its heap becomes `PDF_TOO_COMPLEX`; a crash becomes `PDF_READER_FAILED`; malformed replies are refused; the thread sees an empty `process.env`, no `argv` and only `bytes` and `limits`, with the buffer transferred; the real worker is created with the supervised options and `next.config.ts` keeps the worker chunk resolvable), `tests/import-pdf.test.mjs` (synthetic and hostile PDFs: scripts, automatic actions and attachments not executed; more pages than the limit; forged page count; character and time limits; truncated, garbage and encrypted files; absurd and `NaN` amounts; the extraction options and the absence of `eval` in the installed PDF.js), `tests/import-inspect.test.mjs` (limits and refusals) and `tests/import-e2e.test.mjs` (missing, reused, other-route and other-method action codes; disguised binary; unknown account; invalid filter; `no-store`; no stack trace in the response). The end-to-end file runs against a live local backend and is skipped automatically when none answers.

## Own Pix identifiers

Status: **Current**. A Pix key is a CPF, CNPJ, phone number or e-mail address: a strong identifier, and in three of the four cases with a value space small enough for brute force (a CPF has 10^11 combinations). The controls are therefore specific:

- the value is normalized before anything else, so the same key written in different ways produces the same index;
- comparison uses **HMAC-SHA256 with a device subkey**, never a plain hash, which would fall to a precomputed table;
- the recoverable value uses **AES-256-GCM** with a fresh nonce per operation and a versioned header; tampered content fails the authentication tag;
- the index and encryption subkeys are derived with HKDF with distinct `info`: compromising one does not yield the other, and neither is the master key;
- the master key lives in a file separate from SQLite (`talentum-local.key`), with restricted permissions where the filesystem supports them;
- a listing returns **only the masked form**; the cleartext value requires an explicit request (`?reveal=1`) and the ciphertext never leaves the API;
- the value never enters logs, the timeline, analytics, D1 or error messages.

This protects against theft of the database alone: a copied `.db`, a forgotten backup. It **does not protect** against compromise of the whole device: whoever reads the database also reads the key file. The limit is declared and must not be presented otherwise in the interface. The full decision, with the discarded alternatives, is in [ADR 0003](decisions/0003-local-device-key.md).

Coverage: `tests/pix.test.mjs` and `tests/accounts-e2e.test.mjs`, which also verify that a listing exposes neither the value, the index nor the ciphertext.

## Controls by environment

| Control | Web/Worker | Electron |
| --- | --- | --- |
| TLS/HSTS | required; HSTS **Current** on `apps/web` | required on cloud connections (**Planned**: no cloud connection from Electron yet) |
| CSP, anti-XSS and sanitization | required; **Current** on `apps/web` and the Worker | required in the renderer; **Planned** |
| CSRF | cookie-based mutations; **Current** (origin required on every BFF mutation) | OAuth flow through `state`/PKCE; **Planned** |
| Rate limit/WAF/Turnstile | edge and application; Worker buckets and Turnstile **Current** in code, WAF **Planned** | cloud backend; local API limit **Planned** |
| Tokens | `HttpOnly` cookie in the BFF with rotation; **Current** | cloud access token in main-process memory, refresh token in the OS vault through `safeStorage`; local session token in an `HttpOnly`, `SameSite=Strict` cookie; **Current** |
| Database | D1 with per-row/resource authorization in the application; **Current** for existing routes | SQLite encrypted at rest, opened only after a password unlock and reached only by the local backend; **Current** |
| Secrets | bindings/secret store, never in the bundle; **Current** | no client secret; the local device key is a separate file with `0600` permissions where supported (**Current**, [ADR 0003](decisions/0003-local-device-key.md)); OS-vault protection **Planned** |
| Software integrity | CI builds and tests, gitleaks, dependency review, CodeQL and the Vercel build isolation check **Current**; artifact verification **Planned** | code signing, update and manifest; **Planned** (unsigned `electron-builder` packaging only) |
| Isolation | headers, CORS and cache; **Current** | sandbox, context isolation, minimal IPC **Current**; fuses **Planned** |
| Audit | login, session, moderation and download; **Current** (`security_events`, `audit_events`) | redacted local timeline of imports, edits and reconciliation decisions without amounts, keys or file content **Current**; security-event log **Planned** |

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

Status: **Current** for CSV, OFX and PDF import (see [Statement import](#statement-import)); **Current** for news and AI summaries ([ARCHITECTURE.md §2.8](ARCHITECTURE.md#28-news-and-summaries)). `ofx-data-extractor` was removed.

- import files get size limits, real type detection, an isolated parser and a timeout (Current for CSV, OFX and PDF; PDF parsing runs in an isolated worker thread with memory limits and a hard deadline; process isolation of the CSV and OFX parsers is Open);
- parsers are tested with invalid and hostile files before release (Current for CSV, OFX and PDF with synthetic fixtures; PDFs are built byte by byte in the test, never taken from a real statement);
- financial data is never sent to Workers AI or any external model;
- news content is sanitized, rendered under CSP, and its links open externally and safely;
- model prompts separate instructions from content, and the model gets no tools and no private data.

## Feedback community

Status: **Current** in code (Worker routes, LP screens, `worker-community.test.mjs`, `web-community-bff.test.mjs`).

- anonymous reads include only `PUBLISHED` and `CLOSED` content and a minimal public profile (`profileId`, public name, month of joining); **Current**;
- writing, voting and reporting require a valid session; **Current**;
- authors change only their own content; moderators act through the `MODERATOR` row in `user_roles`, granted by the operator; **Current**;
- votes have a unique constraint and counts are derived with `COUNT(*)`; **Current**;
- posts and comments have size limits, NFC normalization, removal of control and bidirectional characters, plain text only (no HTML, no autolinks), escaping by React on output and the LP CSP; **Current**;
- Turnstile on creation, per-person rate limits, idempotency keys, one report per person and target, a moderation queue; **Current**. Automatic antispam (content heuristics) is **Planned**;
- responses and events never expose email, IP, token, OAuth subject or account ID; **Current**;
- no URL is rendered as a link from community text, so `javascript:` and reverse tabnabbing do not apply; **Current**;
- deletion is a tombstone; retention is published on `/privacidade`; a moderation appeal process is **Open** (no channel exists).

## End-to-end encrypted backup

Status: **Current** as a **local-only** encrypted backup ([ADR 0007](decisions/0007-local-encrypted-backup.md)); cloud storage is **Open**. Key recovery is decided: **there is none**.

- algorithm: AES-256-GCM (`src/server/backup/encrypted.ts`). **Current**;
- a unique 96-bit random nonce per file, and a new key per file (new salt). **Current**;
- the key is derived on the device from the person's passphrase with scrypt (N = 2^17, r = 8, p = 1, 16-byte salt; passphrase NFC-normalized, 12 to 1024 characters) and never stored or sent anywhere. **Current**;
- a versioned header with algorithm, KDF parameters, salt and nonce, authenticated as additional data; the database checksum is inside the ciphertext, not in the header. Readers accept only N in [2^14, 2^20], r = 8 and p ≤ 4, so a forged file cannot exhaust memory. **Current**;
- a restore is validated (GCM tag, inner SHA-256, `PRAGMA quick_check`, schema version known to the app) before anything changes, the current database becomes a restore point, and the swap happens at the next unlock, before the database is opened. Restore points and the staged copy are encrypted with the database key, never plaintext on disk (libSQL `VACUUM INTO` writes plaintext and is not used). **Current**;
- key recovery: **none**. Losing the passphrase loses the backup; the interface says so and asks the person to confirm before generating the file.

Do not describe this as "zero knowledge" or as audited. Local restore points (`talentum-backups/` next to the database) are **not** encrypted: they sit with the device key under the same OS permissions and protect against mistakes and failed migrations, not against theft of the device.

**Backup and data-portability surfaces (Current).** Every route needs an action code. Restore-point and deletion routes are device-level and do not require a profile (so a deletion can be undone). File paths are derived on the server from `DATABASE_URL`; the only variable part of a file name is a UUID validated before the path is built, and the resolved path is checked to stay in the backup directory. Restoring requires `{ "confirm": "restore" }`; deletion requires the typed phrase `APAGAR MEUS DADOS`; both are checked in the backend. The encrypted-backup upload checks `Content-Length` (200 MB) before reading the body. All backup work runs through one in-process queue, which also limits scrypt to one 128 MiB derivation at a time. Passphrases go only in POST bodies, never in URLs, and are never logged or stored. Downloads are served with `Content-Disposition: attachment`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, with server-built file names. Exports are not encrypted and leave the device only where the person saves them; the JSON export omits the Pix index and ciphertext.

## Vercel deployment isolation

- **Current**: `apps/web` (`@talentum/web`) contains only the landing page, the downloads page and a minimal session BFF; it has no Electron source, local backend, Prisma/SQLite, parser or financial module.
- **Current**: the BFF has no database and no financial rule; it forwards only allowed contracts to the Worker.
- **Current**: D1 stores only release metadata, artifact hashes and download grants, never installers.
- **Planned**: installers as signed artifacts in GitHub Releases, never part of the landing page's executable bundle.
- **Current**: download grants are enforced: 2-minute, single use, bound to the person, validated by the Worker before the artifact URL is revealed, created and redeemed inside one BFF request (the value never reaches the browser), audited, and the final redirect is limited to GitHub `https` hosts (`worker-open-items.test.mjs`).
- **Current**: after `pnpm web:build`, CI runs `scripts/web-isolation-check.mjs`, which reads every Next.js file trace (`*.nft.json`) and the client bundle and fails if anything reaches Electron, Prisma, SQLite, `src/`, `cloudflare/`, `scripts/`, `.env` files or secret variable names; it writes `apps/web/.next/talentum-isolation.json` as the manifest. **Open**: it proves the build output, not the context the Vercel integration uploads (that depends on the project's Root Directory setting), and `Dockerfile.web` still copies the whole repository into its build stage.
- **Planned**: previews follow the same isolation and never receive production secrets.

## Supply chain, CI and release integrity

### Credential leak prevention

- **Current**: `.gitignore` ignores `.env*` (except `.env.example`), `.dev.vars*` (except the example), SQLite files and journals, dumps, backups, private key and keystore formats, logs, traces, `.wrangler/`, `.vercel/`, build output and caches. `.dockerignore` excludes `.env*`, databases and `temp/` from image contexts.
- **Current**: examples use unmistakable placeholders only.
- **Current**: versioned Git hooks in `.githooks/` run `pnpm typecheck` and `pnpm test` before every commit and push (install with `pnpm hooks:install`). They do not scan for secrets; the manual [security gate](#mandatory-pre-commit-and-pre-push-security-gate) covers that.
- **Current**: `.gitignore` also covers `*.key` (the local device key) and `release/` (packaging output).
- **Current**: CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on pull requests with a top-level read-only `contents` permission. Every third-party action is pinned to a full commit SHA, `actions/checkout` runs with `persist-credentials: false`, and after `pnpm install --frozen-lockfile` the workflow runs `pnpm audit --prod --audit-level high` before Prisma validation, typecheck, the test suite and the builds. The step list is owned by [BEST_PRACTICES.md](BEST_PRACTICES.md#automated-quality).
- **Current**: `.github/workflows/security.yml` runs gitleaks (`gitleaks/gitleaks-action` pinned by SHA, full history, report never uploaded or commented) on pushes, pull requests and weekly; `actions/dependency-review-action` on pull requests (fails on high severity); CodeQL `javascript-typescript` with `security-extended`. `.github/dependabot.yml` covers npm (root and `apps/web`) and GitHub Actions weekly.
- **Planned** (maintainer setting): branch protection requiring the `CI` and `Security` checks, GitHub secret scanning with push protection and Dependabot alerts.
- A detected credential is revoked and rotated before it is removed from history, and its value is never printed in issues, logs or review comments.

### Dependency advisories

- **Current**: Next.js is `^15.5.29` in both the local app and `apps/web`, which fixes the critical remote-code-execution advisory reported by the first `pnpm audit --prod`; `zod` is `^4.6.7`; `pnpm-workspace.yaml` pins bounded `overrides` for the vulnerable transitive packages `effect`, `sharp` and `source-map-js`.
- **Current**: on 2026-11-20, `pnpm audit --prod --audit-level high` reports no known vulnerabilities, and CI fails when a high or critical production advisory appears.

### Audit of 2026-09-05

Status: **Historical**. A local scan for sensitive names, private keys and known token formats was run on the worktree and history. No real textual credential was found. Matches in `icon-badge.svg` and historical PNGs were classified as incidental sequences inside encoded or binary images. A pattern scan reduces risk but replaces neither a dedicated CI scanner nor GitHub secret protection.

### Release integrity

- **Current**: the downloads page shows each artifact's SHA-256 so users can verify it before running.
- **Planned**: code signing, signed updates and an update manifest for the desktop app. Locally built `electron-builder` artifacts are unsigned and are for testing only.
- **Current in code**: the in-app update path never executes an installer that fails the published SHA-256 or the Ed25519 release signature (`electron/update-verify.cjs`, `tests/updates.test.mjs`); with no release key configured it refuses every installation.
- **Current**: `.github/SECURITY.md` asks reporters to use GitHub's private vulnerability reporting with synthetic data only.

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
| every local API route except `action-codes` and `health` requires an action code and scopes by profile | `dashboard-honesty.test.mjs` |
| `P2002`/`P2025` become `409`/`404` in the shared error shape on the listed routes | `prisma-errors-mapped.test.mjs` |
| concurrent imports, profile creation and edit reverts cannot duplicate or overwrite | `check-then-act-races.test.mjs` |
| the parse deadline is enforced and uploads are refused by `Content-Length` before buffering | `import-limits-enforced.test.mjs` |
| the local app and renderer send a nonce CSP without `'unsafe-inline'` scripts | `local-app-csp.test.mjs` |
| the installer disables `NODE_OPTIONS` and `--inspect` through Electron fuses | `electron-fuses.test.mjs` |
| verdict and projection use one balance in one reference currency | `dashboard-currency-divergence.test.mjs` |
| Worker CORS: exact origin, no credentials, BFF header never allowed, foreign origin refused | `worker-open-items.test.mjs` |
| logout revokes the family with an expired access token; refresh reuse writes a security event without token, e-mail or IP | `worker-open-items.test.mjs` |
| download grants: single use, own person only, 2 minutes, GitHub hosts only, audited | `worker-open-items.test.mjs` |
| per-user and per-route rate limits; public codes never open BFF routes; retention cron | `worker-open-items.test.mjs` |
| login requires current consent versions and Turnstile (fail closed in production); first login records consents | `worker-open-items.test.mjs`, `cloud-consent.test.mjs` |
| account deletion revokes sessions, removes identity and tombstones content | `worker-open-items.test.mjs` |
| community: auth, IDOR, mass assignment, idempotency, Turnstile, rate limit, plain text, tombstones, moderation role | `worker-community.test.mjs` |
| TOTP vectors, encrypted secret, one-time recovery reveal, replay refusal, lockout, pending-state expiry | `worker-mfa-desktop.test.mjs` |
| desktop sign-in: loopback-only redirect, PKCE mismatch, single-use code, token kinds separated | `worker-mfa-desktop.test.mjs` |
| news: DTD/entity refusal, plain text, host allowlist, size limit, prompt-injection hardening, AI fallback | `worker-news.test.mjs` |
| BFF: refresh by POST, origin required, no-store, login outcome and loopback re-validation, safe return page | `cloud-consent.test.mjs`, `web-bff.test.mjs` |
| CI: actions pinned by SHA, gitleaks, dependency review, CodeQL, Dependabot, Vercel build isolation | `ci-supply-chain.test.mjs` |
| every local API route except `action-codes`, `health` and the four public vault routes requires a live local session (enumerated over all route files) | `../vault-session-enforcement.test.mjs` |
| the local database file is encrypted (no SQLite header, no plaintext marker, `SQLITE_NOTADB` without the key) | `../vault-database.test.mjs` |
| a scheduled restore is applied at unlock only after checksum, integrity and schema checks with the key; restore points and staged copies stay encrypted; libSQL `VACUUM INTO` writes plaintext and is not used | `../restore-points.test.mjs` |
| the API middleware lets an encrypted-backup restore up to its 200 MB ceiling through and still requires `Content-Length` | `encrypted-backup-restore-blocked-by-body-limit.test.mjs` |
| the desktop client follows the Worker contract: fresh public action code per call, loopback `/callback`, PKCE S256, one refresh rotation at a time, no token in the renderer | `../electron-cloud-auth.test.mjs` |

Outside `tests/regression/`, contract and unit tests cover the controls added with the MVP features: `electron-security.test.mjs` (window isolation, enumerated preload surface, packaged backend with random port, `userData` database and per-run secret), `pix.test.mjs` and `accounts-e2e.test.mjs` (Pix identifier cryptography and masking), `import-inspect.test.mjs` and `import-e2e.test.mjs` (import limits and refusals), `reconciliation-contracts.test.mjs` and `timeline-contracts.test.mjs` (action code, profile scoping, reversible decisions, redacted events and the migration backup gate). The two `*-e2e` files are skipped when no local backend answers.


### Controls added by the 2026-11-20 offensive review (**Current**, `tests/regression/offensive-review-findings.test.mjs`)

- Installers exclude `.env*`, `.dev.vars*`, databases and key files (`package.json` `build.files`), and `scripts/desktop-prepare.mjs` deletes the `.env` that Next copies into `.next/standalone` and aborts if one remains.
- The packaged app ignores `TALENTUM_URL`; in development only loopback URLs are accepted, so a planted variable cannot make the trusted window load a remote page.
- The local device key is created with mode `0600` (atomically, `wx`) inside a `0700` directory.
- Imported descriptions (CSV and OFX) drop C0/C1 controls and bidirectional overrides, and OFX numeric entities outside valid Unicode decode to a space instead of rejecting the file.
- Imported amounts above R$ 9.999.999.999.999,99 are rejected, so a hostile file cannot poison totals.
- `POST /api/action-codes` requires `Content-Type: application/json` (415 otherwise) and rejects a foreign `Origin` (403 `ORIGIN_NOT_ALLOWED`). The `Origin` is compared with the requested `Host` (`sameOriginAsHost` in `src/server/local-host.ts`), which the middleware has already restricted to loopback. A first version compared it with `request.url`, which `next dev` builds as `localhost` even when the page was opened at `127.0.0.1`, so every screen opened at `127.0.0.1` failed to load data; `tests/regression/local-app.test.mjs` and the end-to-end suite now cover both addresses.
- No source file may contain literal bidirectional control characters (Trojan Source, CVE-2021-42574).
- Local writes are scoped by `profileId` in their own `where` clause, and concurrent onboarding saves, transaction edits and timeline reverts get `409` (`tests/regression/concurrent-writes.test.mjs`, `onboarding-concurrent-version.test.mjs`).

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
- [ ] Private routes apply authentication, authorization, rate limiting and `Cache-Control: no-store`.
- [ ] Ephemeral codes have a hash, a short TTL and single use, and never enter audit or analytics.
- [ ] CORS accepts only `ALLOWED_ORIGIN`, which equals the published LP origin.
- [ ] `TURNSTILE_SECRET_KEY` and `MFA_ENCRYPTION_KEY` are set as Worker secrets before the deploy.
- [ ] Logs and events contain no secrets, public email, raw IP or financial content (`security_events`/`audit_events` metadata is restricted to an allowlist of keys in `cloudflare/src/lib/events.ts`).
- [ ] Remote migrations are reviewed and applied by the backend operator, never by a frontend.

## Open items

Items 1, 2, 3, 5, 7 (BFF part), 8, 13 and 21 were closed by the cloud completion and items 10, 17, 18, 19, 22 and 23 by the local completion (November 2026); their numbers are kept so references stay valid.

1. **Closed** — CSRF on refresh: `POST` with origin check (`cloud-consent.test.mjs`).
2. **Closed** — missing `Origin` is refused on every BFF mutation (`web-bff.test.mjs`).
3. **Closed** — logout revokes by refresh token too (`worker-open-items.test.mjs`).
4. **Domain conflict for the OAuth redirect**: the production redirect URI, `ALLOWED_ORIGIN` and the Turnstile hostname all depend on the undecided domain; see [ARCHITECTURE.md §3.4](ARCHITECTURE.md#34-domain).
5. **Closed** — Worker action codes, auth transactions and rate-limit windows are purged by the cron one day after expiry.
6. **Action-code context binding**: local codes are bound to the local session and refused after it ends (**Current**, ADR 0009). Worker codes separate the BFF and public contexts but are not bound to a session.
7. **`Cache-Control` gaps**: **closed** for the BFF (`apps/web/src/server/http.ts`); the `403` from the local `/api/system/status` still lacks it.
8. **Closed** — download grants are enforced (single use, 2 minutes, validated before the URL is revealed).
9. **Vercel deployment isolation**: the build output is verified in CI (`scripts/web-isolation-check.mjs`); what remains open is proving the uploaded context (Vercel Root Directory) and `Dockerfile.web` copying the whole repository.
10. ~~**Local app CSP**~~ **Resolved 2026-11-20:** nonce CSP for the local app and renderer (see [CORS, response headers and CSP](#cors-response-headers-and-csp)).
11. **Forwarded IP trust**: the BFF trusts the first `X-Forwarded-For` value; this is correct behind Vercel's proxy but not when the BFF is exposed directly (for example, outside Compose's loopback binding).
12. **E2EE backup key recovery**: decided in [ADR 0007](decisions/0007-local-encrypted-backup.md): the encrypted backup is local only and has **no key recovery**; losing the passphrase loses the backup, stated plainly in the interface. Restore points next to the database are now encrypted with the database key (ADR 0007 amendment). What stays open is a cloud storage provider (needs its own ADR).
13. **Closed** — security events (login, sessions, refresh reuse, logout, MFA, account deletion, desktop token failures) and audit events (download grants, moderation, deletions) are written without tokens, e-mails or IPs.
14. **Rate-limit calibration**: every cloud route has a bucket now; values are not calibrated with telemetry, and the local API has none.
15. **Bootstrap secret scope**: a loopback process without the session cookie now reaches only the four public vault routes in every environment (**Current**, ADR 0009), so the data is no longer exposed to other local processes. The packaged app also requires the per-run bootstrap secret, delivered over the trusted IPC `app:bootstrap-secret`. What stays open: development and Docker have no per-run bootstrap secret, any script in the renderer can read it in the packaged app, and the packaged smoke test (action-code issuance, libSQL native loading, vault setup, PDF import, lock and unlock) has passed only on Linux (AppImage, 2026-11-20); Windows and macOS remain to be exercised.
16. **Import hardening gaps (partially resolved 2026-11-20)**: the parse deadline is enforced and uploads are refused by `Content-Length` before buffering; PDF parsing runs in an isolated worker thread with memory limits, a hard deadline and validated output (**Current**); **still open**: the CSV and OFX parsers are not isolated (see [Statement import](#statement-import)).
17. **Migration gate coverage**: closed in code. At vault setup and every unlock, in `pnpm dev`, the Docker image and the packaged app, the open path (`src/server/backup/startup.ts`) creates a verified, encrypted `pre_migration` restore point with its `DatabaseBackup` row before the migration runner. Remaining: the Linux AppImage exercised setup and unlock on 2026-11-20 with no pending migration; a packaged upgrade over an older database is still to be exercised.
18. ~~**Unmapped Prisma errors**~~ **Resolved 2026-11-20:** `prismaFailure` in `src/server/http.ts`, used by the category, Pix, institution, merchant-rule and reconciliation routes (`tests/regression/prisma-errors-mapped.test.mjs`).
19. ~~**Remaining check-then-act races**~~ **Resolved 2026-11-20:** `persistImport` compares inside its transaction after its first write; `LocalProfile.singletonKey` is unique and `ensureLocalProfile` rereads the winner; reverting a `transaction_edit` restores only while the row still equals `afterJson` (`tests/regression/check-then-act-races.test.mjs`). Verified on `next dev`: two simultaneous `POST /api/profile` produce one profile and two simultaneous transfer decisions produce one decision.
20. **Electron fuses and signing (partially resolved 2026-11-20)**: `build.electronFuses` turns off `NODE_OPTIONS`, `--inspect` and extra `file://` privileges and turns on cookie encryption. **Still open:** `runAsNode` stays on until the backend moves to `utilityProcess.fork`; installers are unsigned (Windows Authenticode and macOS Developer ID with notarization need certificates); `asar` is off. Required before any public release.
21. **Closed** in the repository — gitleaks, dependency review, CodeQL and Dependabot; the GitHub settings that enforce them are pending (maintainer).
22. **CSV export escaping**: closed. `GET /api/exports/transactions-csv` prefixes an apostrophe to every text cell that starts with `=`, `+`, `-`, `@` (also after leading spaces and in full-width form), tab or carriage return, and quotes every cell (`src/server/export/csv.ts`, `tests/csv-export.test.mjs`). Any new CSV export must reuse that module.
23. ~~**Upload buffering**~~ **Resolved 2026-11-20:** the middleware refuses by declared `Content-Length` before the body is buffered (`src/server/body-limits.ts`, `tests/regression/import-limits-enforced.test.mjs`).
24. **Turnstile and MFA secrets not provisioned**: production login fails closed until `TURNSTILE_SECRET_KEY` exists; two-step verification answers `503` until `MFA_ENCRYPTION_KEY` exists ([ARCHITECTURE.md §3.8](ARCHITECTURE.md#38-cloudflare-setup-and-deployment), step 11).
25. **`MFA_ENCRYPTION_KEY` rotation**: no re-encryption path; rotation forces re-enrollment.
26. **Moderation appeal and community policy**: no published policy or appeal channel yet.
27. **Desktop sign-in client (partially resolved 2026-11-20)**: `electron/cloud-auth.cjs` implements the loopback listener, `safeStorage` storage and renderer isolation of tokens against the Worker contract (`tests/electron-cloud-auth.test.mjs`). **Still open:** the packaged app has no Worker URL constant (it reports the account as unavailable until the domain is decided, item 4), and no end-to-end run against a real Worker has been made.
28. **Local vault hardening**: the progressive delay is stored in the vault file, so whoever can write that file can reset it (offline guessing does not need it anyway); Argon2id would replace scrypt once a vetted dependency or a native Node API is available; the device key file of ADR 0003 is not yet wrapped under the DEK. The desktop sign-in contract was reconciled with §3.5 (item 27).

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
| Repudiation | accountability | Would a login, refresh-reuse, download grant, moderation decision or destructive local action leave a trace? (Worker: `security_events` and `audit_events` are written; local security-event log **Planned**.) |
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

# cross-origin page: must be refused -> 403 ORIGIN_NOT_ALLOWED
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/action-codes" \
  -H 'Origin: https://attacker.example' -H 'Content-Type: application/json' \
  -d '{"method":"GET","path":"/api/local-summary"}'
```

On 2026-11-20 every probe above returned the expected result against `next dev`, including exactly one success in the race. The cross-origin probe now returns `403`. What remains open is narrower: in development and Docker any other process on the machine, which sends no `Origin`, can still request action codes from the loopback API (see [Local API boundary](#local-api-boundary) and [Open items](#open-items), item 15). In the packaged app the issuer also requires the per-run bootstrap secret, so the same request receives `403 BOOTSTRAP_DENIED` (confirmed against the Linux AppImage on 2026-11-20). A change that adds a write route or returns more data raises the impact of that gap and must be weighed against it. The issuer has no rate limit (**Planned**); a flood such as `ab -n 5000 -c 50 -p body.json -T application/json "$BASE/api/action-codes"` (with `body.json` holding a valid request) shows how far the in-memory map grows in 60 seconds.

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
- [ ] Every statement uses bound parameters. The command below lists template interpolations inside `prepare`; the only accepted ones are module constants (`POST_SELECT`, the `post_id`/`comment_id` column chosen by a boolean, the table chosen by the route and the placeholder list in `cloudflare/src/community.ts`). Anything else is a finding:

  ```sh
  grep -rnE 'prepare\(`[^`]*\$\{' cloudflare/src
  ```

- [ ] Rows owned by a user are read and written with the session's `user_id` in the `WHERE` clause (IDOR, see step 3).
- [ ] A new public or expensive route gets a bucket in `cloudflare/src/lib/limits.ts`.
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

Status: **Partial**. The CSV, OFX and PDF importers exist with the controls in [Statement import](#statement-import). A change to an importer, or a new one, cannot merge without:

- [ ] a byte limit checked before parsing, a row limit, a per-file timeout and parsing off the request thread (worker thread or child process). The byte and row limits and the enforced timeout are **Current**; isolated parsing is **Current** for PDF and **Open** for CSV and OFX (item 16);
- [ ] type detection from content, not from the extension or the declared `Content-Type`;
- [ ] a random internal file name; the user's file name is display-only and never part of a path;
- [ ] idempotent re-import: importing the same file twice creates no duplicate transactions (OFX `FITID`, or a content hash for CSV); the importer stores a content fingerprint per file (**Current**);
- [ ] a regression corpus in `tests/regression/` with synthetic files only, covering at least: empty file; BOM, UTF-16 and invalid UTF-8; one 10 MB line; more rows than the limit; unbalanced quotes and embedded separators; cells starting with `=`, `+`, `-`, `@`, tab or carriage return and their full-width forms; OFX 1.x SGML with unclosed and deeply nested tags; OFX 2.x XML with a `DOCTYPE`, external entity and entity expansion (XXE and "billion laughs"); amounts with thousands of digits, `NaN`, exponents and mixed decimal separators; impossible dates; duplicate and missing `FITID`; a PDF with JavaScript, embedded files or thousands of pages (the PDF cases are **Current** in `tests/import-pdf.test.mjs`).
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
- [ ] The first run of `pnpm audit --prod` on 2026-11-20 reported 11 advisories (1 critical, 5 high, 5 moderate) in `next`, `sharp`, `zod`, `effect` and `source-map-js`. **Current**: all were resolved by upgrades and bounded overrides (see [Dependency advisories](#dependency-advisories)); a new advisory is triaged in the report.
- [ ] Lockfile changes are intentional: `git diff --cached pnpm-lock.yaml` adds only packages the change needs; review new package names for typosquatting and new maintainers.
- [ ] Any change to `allowBuilds` in `pnpm-workspace.yaml` (packages allowed to run install scripts) is justified in the commit.
- [ ] Installs in CI and Docker use `pnpm install --frozen-lockfile`.
- [ ] Dependabot alerts and version updates (`.github/dependabot.yml`), CodeQL code scanning, and GitHub secret scanning with push protection: **Planned**; enable them in the repository settings when the repository is public.

#### CI

Status: **Partial**. `.github/workflows/ci.yml` exists; every change to it, and every new workflow, keeps:

- [ ] top-level `permissions: contents: read`, raised per job only where needed (**Current**);
- [ ] third-party actions pinned to a full commit SHA, and `actions/checkout` with `persist-credentials: false` (**Current**);
- [ ] no `pull_request_target` job that checks out or runs pull-request code; secrets are never available to forks;
- [ ] no secret printed, and `set -x` never used in a step that reads one;
- [ ] the workflow runs `pnpm test`, `pnpm typecheck`, `pnpm audit` and a secret scanner on every pull request (the first three are **Current**; the secret scanner is **Planned**).

### Step 3: replay, idempotency and authorization-bypass tests

Each case is a test in `tests/regression/`, named after the defect it prevents, following the test-first rule in `CLAUDE.md`.

| Attack | How to test | Status |
| --- | --- | --- |
| Action-code replay | use a consumed code again; use it on another method or path; use it after 60 s | **Current** by the local probes above; Worker by `worker-auth.test.mjs` |
| Action-code race | the same code sent concurrently; exactly one success | local probe above; Worker relies on the atomic `UPDATE` |
| Refresh-token reuse and race | reuse an old refresh token; two concurrent refreshes with one token | **Current** (`worker-auth.test.mjs`) |
| OAuth callback replay | replay `code` and `state` after a successful login; send a `state` from another browser | **Current** for login CSRF (`web-bff.test.mjs`); replay of a consumed auth transaction should also be asserted |
| IDOR on Worker rows | with session A, act on B's posts, comments, sessions and grants | **Current** (`worker-community.test.mjs`, `worker-open-items.test.mjs`) |
| IDOR on the local API | swap object IDs between profiles and expect `404` without leaking existence | **Partial**: object-by-ID routes exist and every read and write carries `profileId` in its `where` clause; a cross-profile test is **Planned** once more than one profile exists |
| Write idempotency | send the same write twice with one `Idempotency-Key`: one effect, same response; the same key with a different body: rejected; concurrent duplicates: one effect | **Current** in the Worker for posts and comments (`worker-community.test.mjs`); local idempotency keys **Planned**. **Current**: the onboarding step, transaction edit and timeline revert claim their state atomically and answer `409` to a concurrent duplicate |
| Mass assignment | send extra fields (`userId`, `profileId`, `status`, `id`) to every write route; none is persisted | **Partial**: local write routes exist and persist only fields parsed by their `zod` schemas, with `profileId` taken from the server; a regression test sending extra fields is **Planned** |

### Step 4: free platform protections

`CLAUDE.md` requires every free protection where it applies. Current state:

| Protection | Where | Status | Notes |
| --- | --- | --- | --- |
| Cloudflare Turnstile | login start and post, comment and report creation on `apps/web`; verified in the Worker | **Current** in code (Siteverify, `hostname` and `action` checked, fail closed in production); widget creation and secrets pending (maintainer) | free plan, unlimited verifications. The widget alone protects nothing: the Worker must call Siteverify with a new Worker secret, accept only `success: true` with the expected `hostname` and `action`, and treat each token as single use (valid 300 s). The `apps/web` CSP must allow the challenge origin. |
| Worker rate-limit buckets | every route | **Current** | see [Rate limiting and abuse protection](#rate-limiting-and-abuse-protection) |
| Cloudflare Free Managed Ruleset | Worker hostname | **Open** | zone-level WAF rules need the Worker on a custom domain in a Cloudflare zone; a `workers.dev` hostname is not a zone the project controls (inference from the WAF docs). Decide on a custom domain first. |
| Cloudflare rate-limiting rule | Worker hostname | **Open** | the free plan allows one rule, IP-only counting, 10 s period and 10 s mitigation. The Worker is called server-to-server by the BFF, so an IP rule at Cloudflare would count Vercel's egress IPs, not visitors; per-visitor limits belong at Vercel and in the Worker buckets. |
| Cloudflare Bot Fight Mode | Worker hostname | **Open**, not recommended there | it applies to the whole domain, may challenge API traffic and cannot be skipped with WAF rules, so it would risk blocking the BFF. Reconsider only for a hostname that serves browsers directly. |
| Vercel DDoS mitigation | `apps/web` | **Current** (automatic on all plans) | nothing to configure |
| Vercel WAF custom rules and rate limiting | `apps/web` | **Planned** | Hobby allows 3 custom rules, one of them a rate-limit rule (fixed window, 10 s to 10 min, keyed by IP or JA4). Candidate: `/api/auth/*` and `/api/releases/*`. Start with the **Log** action, then switch to `429`. |
| Vercel Attack Mode | `apps/web` | available on demand | enable during an active attack only |
| CORS | Worker | **Current**: exact `ALLOWED_ORIGIN`, no credentials, BFF header never allowed | never reflect the request origin |
| GitHub secret scanning, push protection, Dependabot, CodeQL | repository | workflows and `dependabot.yml` **Current**; repository settings pending (maintainer) | see the supply-chain checklist above |

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
| A09 Security Logging and Alerting Failures | step 1 (repudiation); Worker security and audit events are **Current**, alerting **Planned** |
| OWASP API Security Top 10 2023: API1 and API3 object and property authorization, API5 function authorization | step 3 (IDOR, mass assignment) |
| API2 authentication, API4 resource consumption, API6 sensitive business flows | step 2 (Worker), step 4 (Turnstile, rate limits) |
| API7 SSRF, API10 unsafe consumption of APIs | step 2 (Worker): outbound calls go only to Google, Turnstile Siteverify and the allowlisted news hosts (article URLs come from stored items whose host is re-checked, redirects confined to the source's hosts); any new outbound URL must be fixed server-side, never taken from input |
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
