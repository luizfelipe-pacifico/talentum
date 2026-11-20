# Talentum Documentation

This directory holds the project's sources of truth. Documentation is kept in a few comprehensive documents rather than many small ones: extend the right document before creating a new one. A statement marked **Planned** is not implemented functionality.

## Documents

| Document | Responsibility |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Overview, repository layout, runtime flows, the action-code protocol and API contracts, split into **Layer 1: Web** (landing page, BFF, Cloudflare Worker and D1, setup and deployment) and **Layer 2: Electron** (desktop shell, local Next.js app, local API, SQLite) |
| [`SECURITY.md`](./SECURITY.md) | Threat model, authentication (OAuth/OIDC, sessions, refresh tokens), CSRF, rate limiting, headers, Electron hardening, secrets management and the verified controls |
| [`DATABASE.md`](./DATABASE.md) | Data placement policy, modeling rules, the local Prisma/SQLite schema, the cloud D1 schema, migrations and capacity |
| [`PRODUCT.md`](./PRODUCT.md) | Product vision and scope, MVP features and routes, onboarding, dashboard specification and the update notice |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | Brand, tokens for both themes, typography, iconography, motion, state illustrations and the visual QA log |
| [`ROADMAP.md`](./ROADMAP.md) | MVP, macro-feature order, dependencies and completion criteria |
| [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) | Repository organization, engineering practices and the full development guide (setup, commands, Docker, tests, hooks, contribution) |
| [`MEMORY-AI.md`](./MEMORY-AI.md) | How the maintainer thinks and works, for AI agents: communication, quality bar, design and copy philosophy, decision patterns and a lessons-learned log. Read at the start of every session and update in the same turn when a new preference appears |
| [`decisions/`](./decisions/) | Architecture decision records; see [Recorded decisions](#recorded-decisions) |

`App de Gestão Financeira ARCA.pdf` is the original source material. It is historical and non-normative; its still-relevant ideas are condensed in the appendix of `PRODUCT.md`.

## Decision hierarchy

When sources conflict, use this order:

1. versioned code, tests and configuration;
2. the documents in this index;
3. the historical appendix of `PRODUCT.md` and the source PDF.

Fix conflicts at the source; do not explain them only in code comments.

## Status labels

- **Current:** exists and can be verified in the repository.
- **Planned:** accepted decision, not fully implemented.
- **Open:** depends on validation, an ADR or a maintainer decision.

## Keeping documentation up to date

| Change | Update |
| --- | --- |
| Architecture, runtime flow, API contract, deployment | `ARCHITECTURE.md` (the affected layer) |
| Authentication, authorization, secrets, data handling | `SECURITY.md` |
| Schema, migrations, data placement | `DATABASE.md` |
| Features, routes, onboarding, dashboard rules | `PRODUCT.md` |
| Tokens, components, illustrations, visual QA | `DESIGN-SYSTEM.md` |
| Scope or order of work | `ROADMAP.md` |
| Setup, commands, tooling, conventions | `BEST_PRACTICES.md` and, for onboarding or commands, the root `README.md` |
| A decision with meaningful alternatives | a new ADR in `decisions/` |

Update this index whenever a document is added, removed, renamed or changes responsibility.

## Recorded decisions

| ADR | Subject |
| --- | --- |
| [`0001-web-hosting.md`](./decisions/0001-web-hosting.md) | Landing page on Vercel, backend on Cloudflare Workers |
| [`0002-own-ofx-parser.md`](./decisions/0002-own-ofx-parser.md) | Own bounded OFX reader instead of `ofx-data-extractor` |
| [`0003-local-device-key.md`](./decisions/0003-local-device-key.md) | Where the secret that protects own Pix identifiers lives |
| [`0004-electron-packaging.md`](./decisions/0004-electron-packaging.md) | Desktop packaging with `electron-builder` (NSIS and AppImage) |
