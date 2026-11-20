# ADR 0001 — Web application hosting

- Status: accepted, pending validation of deploy isolation
- Date: 2026-09-05
- Status note (2026-11-20): the decision stands; the deploy-isolation and D1-adapter consequences are not yet met. See [Status note](#status-note-2026-11-20).

## Context

The web side has OAuth/OIDC, sign-up, sessions, a protected page, rate limiting, a database and signed links for installers. A public community is **Planned** (its D1 tables exist, but no route serves it).

## Options

### Cloudflare Pages

Suitable if the landing page is exported statically and the whole backend lives in another service. This separates deployment and observability without a clear benefit for the current flow.

### Cloudflare Workers

Integrates Workers, D1, Turnstile and WAF. For a new full-stack Next.js application, the route currently recommended by Cloudflare uses vinext, which is still in beta; for that reason the interface will live on Vercel.

### Vercel

The most direct path to native Next.js features, and it reduces incompatibility risk. Rate limiting, database and object storage must be defined and may involve additional products.

## Decision

Use **Vercel only for the landing page and its minimal session BFF**. Use Cloudflare Workers for the backend, D1 for structured cloud data and GitHub Releases for installers. Cloudflare Pages and R2 will not be used.

The original decision named `talentum.vercel.app` as the landing page domain. **Open:** the landing page code now uses `talentum-tech.vercel.app`, while the Worker configuration and earlier documents still use `talentum.vercel.app`; the canonical domain must be decided and aligned (tracked in [ARCHITECTURE.md §3.4](../ARCHITECTURE.md#34-domain)).

No Electron code, local backend, Prisma/SQLite, parser or financial domain may enter the Vercel build/deploy context. The separation must be guaranteed by an isolated project/repository or by a deploy package created from an allowlist and verified in CI. Only the authorized pipeline produces the Windows/Linux installers and publishes them to GitHub Releases.

The BFF is necessary because, without a custom domain, the Vercel domain and `workers.dev` do not share first-party cookies. It is limited to keeping the web session, obtaining short-lived action codes and forwarding allowed contracts to the Worker; it contains no financial domain and no persistence of its own.

## Spike criteria

1. Complete OAuth with PKCE and a secure first-party cookie in the BFF.
2. `/downloads` protected, server-rendered and without public caching.
3. Reproducible D1 migrations.
4. Publication of signed installers to GitHub Releases and metadata in D1.
5. Distributed rate limiting and server-side Turnstile.
6. Feedback CRUD, voting and moderation.
7. Logs, metrics, tracing and rollback.
8. Preview per pull request, with cost and limits documented.
9. A manifest/CI check proves that only the landing page and BFF enter the Vercel deploy.
10. Temporary grants are recorded in D1 before the landing page returns the public artifact.

## Consequences

The frontend can change provider without moving the desktop system. Domain logic and contracts do not depend directly on Cloudflare bindings; adapters isolate D1. If a custom domain is adopted in the future, the need for the BFF must be reassessed.

## Status note (2026-11-20)

The decision itself (Vercel for the landing page and BFF, Worker plus D1 for the backend, GitHub Releases for installers, no Pages and no R2) still stands. An audit of the repository found:

- **Open — deploy isolation not met.** The landing page lives in the same repository (`apps/web`) as the desktop system, there is no CI to verify an allowlist, and `Dockerfile.web` copies the whole repository into its build stage (`COPY . .`). Neither of the two accepted isolation mechanisms (isolated project/repository, or an allowlist deploy package verified in CI) is in place. `apps/web` itself imports no Electron, Prisma or financial code, but that is not yet enforced by a CI-verified manifest (spike criterion 9).
- **Planned — D1 adapter.** The Worker calls D1 inline (`DB.prepare` in `cloudflare/src/index.ts`); there is no adapter layer isolating D1 as the Consequences section assumes.
- **Planned — community.** Feedback and moderation (spike criterion 6) have D1 tables but no Worker routes.
- **Spike criteria met (Current):** 1 (OAuth with PKCE through the BFF, with first-party cookies), 2 (`/downloads` is protected and rendered server-side), 3 (two versioned D1 migrations with local and remote apply scripts) and 10 (download grants are inserted in D1 before the download URL is returned).
- **Spike criteria partially met:** 4 (release and artifact metadata are read from D1, but no signed installers are produced or published yet) and 5 (IP-keyed rate limits in D1 exist for code issuance and login; Turnstile is **Planned**).
- **Spike criteria not verified in the repository:** 7 (logs, metrics, tracing, rollback) and 8 (per-PR previews, cost and limits).
