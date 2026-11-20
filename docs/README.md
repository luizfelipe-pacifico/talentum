# Talentum Documentation

This directory holds the project's sources of truth. Documentation is kept in a few comprehensive documents rather than many small ones: extend the right document before creating a new one. A statement marked **Planned** is not implemented functionality.

## Documents

| Document | Responsibility |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Overview, repository layout, runtime flows, the action-code protocol and API contracts, split into **Layer 1: Web** (landing page, BFF, Cloudflare Worker and D1, setup and deployment) and **Layer 2: Electron** (desktop shell, local Next.js app, local API, SQLite) |
| [`SECURITY.md`](./SECURITY.md) | Threat model, authentication (OAuth/OIDC, sessions, refresh tokens), CSRF, rate limiting, headers, Electron hardening, secrets management and the verified controls |
| [`DATABASE.md`](./DATABASE.md) | Data placement policy, modeling rules, the local Prisma/SQLite schema, the cloud D1 schema, migrations and capacity |
| [`PRODUCT.md`](./PRODUCT.md) | Product vision and scope, MVP features and routes, onboarding, dashboard specification and the update notice |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | Design principles (validated on every change), brand, tokens for both themes, typography, iconography and the Lucide exception, motion, the twelve viewport classes and responsive pattern catalog, UX writing and copy rules, state illustrations and how to source new ones, and the visual QA log |
| [`ROADMAP.md`](./ROADMAP.md) | MVP, macro-feature order, dependencies and completion criteria |
| [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) | Repository organization, engineering practices and the full development guide (setup, commands, Docker, tests, hooks, contribution) |
| [`ARCA-VISION.md`](./ARCA-VISION.md) | Full rewrite of the original ARCA product document (`App de Gestão Financeira ARCA.pdf`), illustrated with Mermaid diagrams and text wireframes. Historical and non-normative: where it differs from the documents above, they win |
| [`MEMORY-AI.md`](./MEMORY-AI.md) | How the maintainer thinks and works, for AI agents: communication, quality bar, design and copy philosophy, decision patterns and a lessons-learned log. Read at the start of every session and update in the same turn when a new preference appears |
| [`decisions/`](./decisions/) | Architecture decision records; see [Recorded decisions](#recorded-decisions) |

`App de Gestão Financeira ARCA.pdf` is the original source material. It is historical and non-normative and is fully rewritten in [`ARCA-VISION.md`](./ARCA-VISION.md); read that document instead of the PDF.

## Decision hierarchy

When sources conflict, use this order:

1. versioned code, tests and configuration;
2. the documents in this index;
3. the historical [`ARCA-VISION.md`](./ARCA-VISION.md), the historical appendix of `PRODUCT.md` and the source PDF.

Fix conflicts at the source; do not explain them only in code comments.

## Status labels

These are the only status labels, and every document uses them as defined here.

- **Current:** exists and can be verified in the repository (code, migrations, configuration or tests).
- **Partial:** part of it is Current and the rest is Planned; the text says which part is which.
- **Planned:** accepted, not implemented yet. Never describe it as available.
- **Open:** needs a decision, an ADR, validation, or the resolution of a conflict between code and documentation. Every Open item also appears in the owning document's Open items list.
- **Rule:** a normative requirement. It binds every change whatever the implementation state, so a rule is never labeled Current; where the code does not follow it yet, the gap is listed as Open or Planned.
- **Historical:** a dated record of what was observed or decided at the time. It is not normative and is not updated, except for a dated note when it no longer describes the code.

`ROADMAP.md` also uses **MVP** and **Next stage**. They describe scope, not implementation state, and are combined with the labels above.

## One owner per fact

Each fact is written in full in exactly one document, its owner. Other documents state it in one sentence at most and link to the owner, so a change is made once. When you find the same fact explained in two places, keep the owner's version and replace the other with a link.

| Fact | Owner |
| --- | --- |
| Repository layout and directory tree | `ARCHITECTURE.md` §1.4 |
| Action-code protocol and its implementation | `ARCHITECTURE.md` §2.1 |
| Required security properties of action codes | `SECURITY.md`, Action codes |
| Production domain conflict | `ARCHITECTURE.md` §3.4 |
| Configuration variables: names, kind, purpose and location | `ARCHITECTURE.md` §3.7 |
| Security gaps of the Web and Electron layers (CSRF, origin checks, rate-limit coverage, CSP, action-code binding, deploy isolation, grant enforcement) | `SECURITY.md`, Open items |
| Checklist before publishing the Worker | `SECURITY.md`, Checklists |
| Pre-commit and pre-push security gate, incident response | `SECURITY.md` (`CLAUDE.md` makes it binding and links there) |
| Bug-fix order and regression tests | `BEST_PRACTICES.md`, Bug fixes and regression tests |
| Commands, setup, environment files | `BEST_PRACTICES.md` |
| Schema, retention and purge of stored rows | `DATABASE.md` |
| Routes, features, MVP scope and import formats | `PRODUCT.md` |
| Delivery order and stage exit criteria | `ROADMAP.md` |
| Viewport classes, themes, UX writing, illustrations | `DESIGN-SYSTEM.md` |
| How the maintainer works | `MEMORY-AI.md` |
| Rules for AI agents | `CLAUDE.md` (`AGENTS.md` only points to it) |

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
| A preference, correction or lesson from the maintainer | `MEMORY-AI.md`, within the limits in `CLAUDE.md` ("What must never be written to `docs/MEMORY-AI.md`") |
| A rule for AI agents or a standing instruction | `CLAUDE.md` only |

Update this index whenever a document is added, removed, renamed or changes responsibility.

## Recorded decisions

| ADR | Subject |
| --- | --- |
| [`0001-web-hosting.md`](./decisions/0001-web-hosting.md) | Landing page on Vercel, backend on Cloudflare Workers |
| [`0002-own-ofx-parser.md`](./decisions/0002-own-ofx-parser.md) | Own bounded OFX reader instead of `ofx-data-extractor` |
| [`0003-local-device-key.md`](./decisions/0003-local-device-key.md) | Where the secret that protects own Pix identifiers lives |
| [`0004-electron-packaging.md`](./decisions/0004-electron-packaging.md) | Desktop packaging with `electron-builder` (NSIS and AppImage) |
| [`0005-biome-and-playwright.md`](./decisions/0005-biome-and-playwright.md) | Biome linter and Playwright end-to-end tests |
| [`0006-pdf-import.md`](./decisions/0006-pdf-import.md) | Local PDF import with PDF.js text extraction, a versioned layout-reader registry and per-field confidence |
| [`0007-local-encrypted-backup.md`](./decisions/0007-local-encrypted-backup.md) | Local restore points and passphrase-encrypted backup, no cloud storage and no key recovery |
| [`0008-cloud-mfa-and-desktop-login.md`](./decisions/0008-cloud-mfa-and-desktop-login.md) | Two-step verification (TOTP) and desktop sign-in through the Worker (RFC 8252) |
| [`0009-local-vault-and-encrypted-database.md`](./decisions/0009-local-vault-and-encrypted-database.md) | Local password and recovery code, whole-database encryption with libSQL, the migration runner, sessions and auto-lock, TOTP, and desktop "Entrar com Google" |
