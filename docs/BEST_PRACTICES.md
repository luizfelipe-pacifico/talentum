# Best Practices and Development Guide

This document is the single development reference for Talentum: how the repository is organized, the engineering and documentation rules every change follows, and the practical guide to installing, configuring, running, testing and contributing to the project. It must evolve with the product requirements, architecture and technology stack. Statements carry the status labels defined in [README.md](README.md#status-labels). The architecture itself is described in [ARCHITECTURE.md](ARCHITECTURE.md), security rules in [SECURITY.md](SECURITY.md), the local schema in [DATABASE.md](DATABASE.md), interface rules in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), product scope in [PRODUCT.md](PRODUCT.md) and delivery order in [ROADMAP.md](ROADMAP.md).

## Contents

- [Repository state](#repository-state)
- [Project organization](#project-organization)
- [Documentation rules](#documentation-rules)
- [Product and planning](#product-and-planning)
- [Repository and dependencies](#repository-and-dependencies)
- [Icons and assets](#icons-and-assets)
- [Requirements and installation](#requirements-and-installation)
- [Environment and configuration files](#environment-and-configuration-files)
- [Commands](#commands)
- [Running locally](#running-locally)
- [Docker](#docker)
- [Local database workflow](#local-database-workflow)
- [Cloudflare development](#cloudflare-development)
- [Design tooling and agent skills](#design-tooling-and-agent-skills)
- [Tests](#tests)
- [Bug fixes and regression tests](#bug-fixes-and-regression-tests)
- [Git hooks](#git-hooks)
- [Automated quality](#automated-quality)
- [Branches and review](#branches-and-review)
- [Commits](#commits)
- [Implementation flow](#implementation-flow)
- [Security](#security)
- [Configuration and operations](#configuration-and-operations)
- [Releases](#releases)
- [Definition of done](#definition-of-done)
- [References](#references)

## Repository state

Status: **Current** (pre-alpha).

- A local Next.js application in `src/` renders the product UI and exposes 39 local API route handlers under `src/app/api` (see [ARCHITECTURE.md](ARCHITECTURE.md)). Server-only code lives in `src/server`, with the importer in `src/server/import/`.
- The local financial features 1 to 8 of [PRODUCT.md](PRODUCT.md) have a vertical implementation over local SQLite: onboarding, profile, institutions, accounts and own Pix keys, categories, income, obligations and merchant rules, CSV/OFX import with batch undo, the transaction listing and detail, reconciliation, the dashboard (formulas in `src/server/dashboard-metrics.ts`) and the timeline. The remaining routes under `src/app/` (cards, net worth, goals, news, profile) are empty-state screens awaiting implementation; `src/lib/demo-data.ts` holds only navigation configuration and labels, never financial data.
- Prisma/SQLite holds 37 models (see [DATABASE.md](DATABASE.md)) created by 15 migrations, in a database encrypted at rest with libSQL ([ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)).
- The Electron shell (`electron/main.cjs`, `electron/preload.cjs`) opens a hardened window on the local application and, when packaged, starts its own backend ([ADR 0004](decisions/0004-electron-packaging.md)).
- `apps/web/` (`@talentum/web`) holds the public landing page, its minimal BFF and the protected `/downloads` page.
- The Cloudflare Worker (`cloudflare/src/index.ts`) implements `/health`, Worker action codes, Google OAuth/OIDC with PKCE (`/api/auth/start`, `/api/auth/callback`), refresh-token rotation with reuse detection (`/api/auth/refresh`), logout, `/api/me`, `/api/releases` and release download grants, over four D1 migrations.
- The cloud track has contracts and an implementation, but configuring secrets and OAuth, producing signed artifacts and validating the published environment remain mandatory operational steps. Automatic categorization by merchant rules, PDF import, cards, net worth and the later stages are not implemented; `pdfjs-dist` is installed but unused.

## Project organization

Status: **Current**. The directory tree, with the responsibility of each top-level path, is in [ARCHITECTURE.md §1.4](ARCHITECTURE.md#14-repository-layout). The repository has no `packages/` directory and no `turbo.json`; `.github/` holds the CI workflow (`.github/workflows/ci.yml`) and the community files, and `LICENSE` is at the root.

### Organization rules

- There are two Next.js applications, and only two: the local application rooted at the repository root and the public landing page in `apps/web`. `apps/web` must stay free of Electron, Prisma/SQLite, parsers and the financial domain. Do not add further applications without an ADR.
- Keep one Next.js configuration per Next.js application: `next.config.ts` at the repository root for the local application and `apps/web/next.config.ts` for the landing page.
- The current source layout is layer-based: `src/server` (server-only code), `src/lib` (client utilities), `src/components` and `src/hooks`. Extend these directories rather than creating parallel trees.
- Keep entry points (route handlers, pages, Electron main) thin and move business rules into independently testable modules, as `src/server/dashboard-metrics.ts` does.
- All tests live in `tests/` as `*.test.mjs` files, matched by the `pnpm test` glob; regression tests live in `tests/regression/`. Do not place tests beside their sources, because the test runner would not find them.
- Store architectural decision records under `docs/decisions/` as described in [Documentation rules](#documentation-rules).
- Never store secrets in configuration, fixtures, examples, logs or documentation.
- Do not create empty directories in advance. Add each directory when it has a real responsibility.
- Before creating a new file or directory, check whether an equivalent one already exists and reuse or extend it instead of duplicating structure. Do not create empty directories or speculative abstractions.
- Markdown at the repository root is limited to `README.md`, `CLAUDE.md` and `AGENTS.md`. Every other Markdown document belongs in `docs/`; do not create per-app READMEs or instruction files. The only exception is `.claude/skills/` and `.claude/agents/`, because Claude Code discovers skills only at that path (see [Design tooling and agent skills](#design-tooling-and-agent-skills)).
- Keep a single local `.env` and its secret-free `.env.example` at the repository root. The Worker's own development secrets are the documented exception, in the ignored `cloudflare/.dev.vars` with the synthetic `cloudflare/.dev.vars.example`. Do not create other environment files inside individual directories unless the architecture is deliberately changed and documented.

### Layer-based vs. feature-based organization

There are two common ways to group source code, and the right choice depends on project size:

- **Layer-based** (package-by-type): files are grouped by technical role (`controllers/`, `models/`, `services/`). Simple and fine for small projects, but related code for a single feature ends up scattered across many folders as the app grows.
- **Feature-based** (package-by-feature or domain-driven): files are grouped by business capability (for example `modules/billing/`, `modules/auth/`), with each feature folder holding its own logic, tests and types. This keeps related code together, reduces merge conflicts between contributors and scales better with team size.

**Current:** Talentum's local application is layer-based (`src/server`, `src/lib`, `src/components`, `src/hooks`), which fits its present size.

**Planned:** as financial modules (import, categorization, reconciliation, obligations) grow, group them by capability. Start each module with a flat, simple internal structure and add sub-layers only once a module is large enough to need them. Do not pre-create layered scaffolding for empty modules; moving to feature-based modules is a deliberate, documented change, not something to start speculatively.

### Naming and depth conventions

- Use short, descriptive, unambiguous names (`email-templates`, not `templates`); avoid vague suffixes like `new`, `final` or `v2`.
- Keep folder nesting shallow; three or four levels deep is a reasonable ceiling before it should be reconsidered.
- Use consistent casing per ecosystem convention (`kebab-case` for folders and files in JS/TS) and keep it uniform. Product route segments and some script names are in Portuguese (for example `/extratos`, `scripts/gerar-estados.mjs`) and stay as they are in code.
- Give every top-level folder a single, clear responsibility; do not mix source code, documentation, configuration and generated assets in the same directory.

## Documentation rules

Rule.

- Documentation is part of the change: every material change updates the affected document in the same change set (see `CLAUDE.md`).
- Documents are few and comprehensive. Extend an existing document before creating a new one; create a new one only for a genuinely new responsibility, and update `docs/README.md` whenever a document is added, removed, renamed or changes responsibility.
- File names in `docs/` are uppercase English: `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DATABASE.md`, `DESIGN-SYSTEM.md`, `PRODUCT.md`, `ROADMAP.md`, `BEST_PRACTICES.md`, `MEMORY-AI.md` and `ARCA-VISION.md`.
- ADRs live in `docs/decisions/` and are named `NNNN-kebab-case.md` with a sequential four-digit number (for example `0001-web-hosting.md`). Record meaningful alternatives and consequences there.
- Content is written in English. Portuguese UI copy, route segments and code identifiers are quoted exactly as they appear in code.
- Mark every statement of state as **Current**, **Planned** or **Open**; never present planned work as implemented.
- Documentation must let contributors understand, reproduce, test and review the change without disclosing secrets, personal data, local paths or infrastructure metadata.
- Update the root `README.md` when setup, commands, product scope or onboarding change.

## Product and planning

- Record the problem, target audience, constraints and expected outcome before implementation.
- Split large requirements into small, independently verifiable deliveries.
- Define objective acceptance criteria for every feature.
- Record important architectural decisions and their trade-offs.

## Repository and dependencies

- Keep `README.md` synchronized with setup, commands, configuration and behavior.
- Declare and lock dependencies through `package.json` and `pnpm-lock.yaml`; the package manager is pinned with `packageManager` (`pnpm@11.1.2`) and the Node.js floor with `engines` (`>=22.13.0`).
- Do not rely on globally installed packages or undocumented machine state.
- Keep deploy-specific configuration in environment variables and provide a secret-free `.env.example`.
- Do not version generated artifacts, caches, installed dependencies, local databases or personal editor settings.

### Dependencies confirmed against the source document

Status: **Current** for what is installed; usage noted per item.

- Next.js App Router, React, Electron, Prisma/SQLite and PDF.js (`pdfjs-dist`) are installed. Tailwind CSS is installed and wired into PostCSS but not imported anywhere; the interface is hand-written CSS. `pdfjs-dist` is not used yet.
- The generic "Node-OFX" had been made concrete as `ofx-data-extractor`. When Feature 4 was implemented the library proved unsuitable: it fails on OFX 1.x/SGML, the format Brazilian banks export, and normalizes money to `number`, which [DATABASE.md](DATABASE.md) forbids. The dependency was **removed** and replaced by an own bounded reader in `src/server/import/ofx.ts`; the decision, with alternatives and consequences, is [ADR 0002](decisions/0002-own-ofx-parser.md).
- AES-256-GCM uses `node:crypto` and needs no extra library.
- **Planned:** Workers AI and Ollama are future HTTP integrations and need no SDK now.
- **Current:** `electron-builder` is the packager for the Windows NSIS installer and the Linux AppImage ([ADR 0004](decisions/0004-electron-packaging.md)).

## Icons and assets

- Use [Bootstrap Icons](https://icons.getbootstrap.com/) for interface icons instead of mixing icon sets, hand-drawn SVGs or assets copied from unrelated sites. **Current:** `bootstrap-icons` is the only icon dependency; the former `lucide-react` dependency has been removed.
- Bootstrap Icons is distributed under the MIT License. Keep its source and license traceable when assets are copied into the repository (the landing page icon map is generated from the package by `pnpm lp:icones`).
- When Bootstrap Icons genuinely lacks the required symbol, install and use Lucide (`lucide-react`, ISC License) for that icon and record it in the icon exceptions table in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). **Planned on need:** Lucide is not installed today.
- New flat illustrations are generated with Gemini through the Claude in Chrome extension, moved from the Downloads folder into `design/`, and vectorized to SVG with a transparent background before use; the full process is in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
- Brand marks and state illustrations are generated from versioned sources (`pnpm marca:gerar`, `pnpm estados:gerar`); every theme-specific asset must exist for both light and dark themes. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Requirements and installation

Requirements:

- Node.js 22.13 or later (required for native type stripping and `node:sqlite` in tests);
- pnpm 11.1.2;
- Git;
- Docker Desktop or Docker Engine with Compose, for the container flow;
- Windows or Linux for the initial targets.

Install:

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate
pnpm hooks:install
```

Never copy real values into `.env.example`. The local `.env` must not be versioned.

## Environment and configuration files

Status: **Current**.

| File | Responsibility | Versioned |
| --- | --- | --- |
| `.env` | local SQLite URL, SQLite path inside Docker, and the landing page/BFF access to the Worker | no |
| `.env.example` | the same names with synthetic placeholders | yes |
| `cloudflare/.dev.vars` | the Worker's own development secrets | no |
| `cloudflare/.dev.vars.example` | Worker variable names with synthetic placeholders | yes |
| `cloudflare/wrangler.jsonc` | `DB` binding, D1 `database_id` and public variables | yes |

The full list of variables, with kind, purpose and location in every environment, is in [ARCHITECTURE.md §3.7](ARCHITECTURE.md#37-configuration-variables-names-and-locations). What matters for local development (names only; values never appear in documentation):

- `DATABASE_URL` is the host SQLite database, resolved relative to `prisma/`. The default used by the dev script is `file:../temp/talentum-local.db`, that is `temp/talentum-local.db` at the repository root, which Git ignores.
- `DOCKER_DATABASE_URL` is the path inside the `talentum-local` container and must point into the `talentum-data` volume. Both exist because the host `temp/` directory does not exist inside the image; changing it without changing the Compose volume leaves the database outside the volume, and the data does not survive container recreation.
- `CLOUDFLARE_API_BASE_URL` is the Worker as seen from the host (the local `pnpm cloudflare:dev` Worker in development; in production the public Worker URL is configured in the Vercel runtime, not in `.env`).
- `DOCKER_CLOUDFLARE_API_BASE_URL` is the same Worker as seen from inside the `talentum-web` container (`host.docker.internal`), for the same reason as the two SQLite URLs.
- `CLOUDFLARE_BFF_SHARED_SECRET` authenticates the landing page BFF to the Worker and must be identical to the Worker's `BFF_SHARED_SECRET`; a mismatch makes every Worker route answer 403.

`CLOUDFLARE_API_BASE_URL` and `CLOUDFLARE_BFF_SHARED_SECRET` are the landing page's only access to the edge. No financial data is configured in or travels through the edge: D1 is accessed only by the Worker. The landing page reads the root `.env` even when it runs from `apps/web` (`process.loadEnvFile` in `apps/web/next.config.ts`); variables already set in the environment take precedence. In `cloudflare/.dev.vars`, `PUBLIC_WEB_URL` and `ALLOWED_ORIGIN` point to the local landing page and override the production values during `wrangler dev`. Secret handling and production Worker secrets are covered in [SECURITY.md](SECURITY.md).

## Commands

Status: **Current**. This table lists every script in the root `package.json`.

| Command | Current behavior |
| --- | --- |
| `pnpm dev` | runs `scripts/dev.mjs`: frees port 3000, waits for it, removes `.next` and starts `next dev` on `127.0.0.1:3000`. Migrations are applied by the backend at unlock, through the encrypted connection |
| `pnpm dev:all` | runs `scripts/dev-all.mjs`: opens Electron on `http://localhost:3000`, attaching to a server that already answers or starting its own |
| `pnpm desktop:prepare` | runs `scripts/desktop-prepare.mjs`: `prisma generate`, a standalone `next build` and a copy of `.next/static` and `public/` into the standalone output |
| `pnpm desktop:build:win` | `desktop:prepare`, then `electron-builder --win nsis --x64` into the ignored `release/` directory (unsigned) |
| `pnpm desktop:build:linux` | `desktop:prepare`, then `electron-builder --linux AppImage --x64` into `release/` (unsigned) |
| `pnpm desktop:build:mac` | on a Mac only: `desktop:prepare`, then `electron-builder --mac dmg zip` for the Mac's own architecture (`arm64` on Apple silicon, `x64` on Intel) into `release/`; unsigned and not notarized without an Apple Developer ID |
| `pnpm docker:build` | builds the isolated images of the local application and the landing page |
| `pnpm docker:up` | builds and starts the application on `127.0.0.1:3000` and the landing page on `127.0.0.1:3100` |
| `pnpm docker:up:detached` | starts both services in the background and waits for their healthchecks |
| `pnpm docker:down` | stops the containers without deleting the SQLite volume |
| `pnpm build` | runs `next build` for the local application |
| `pnpm start` | serves the build with `next start` on port 3000 |
| `pnpm lint` | runs the Biome linter (`biome lint .`) with the rules in `biome.json` |
| `pnpm format` | formats the code with Biome (`biome format --write .`); see Automated quality before running it on the whole tree |
| `pnpm format:check` | reports files whose formatting differs from `biome.json`, without changing them |
| `pnpm typecheck` | regenerates the Prisma Client only when the schema changed, then runs `tsc --noEmit` |
| `pnpm test` | runs `node --experimental-strip-types --test "tests/**/*.test.mjs"` |
| `pnpm test:e2e` | runs the Playwright end-to-end tests in `tests/e2e/` against an isolated server (see Tests) |
| `pnpm test:e2e:install` | downloads the Chromium build Playwright uses (once per machine) |
| `pnpm test:manual` | starts the isolated server (fresh encrypted database, `127.0.0.1:3210`, vault created with the synthetic test password) for manual testing through the Claude in Chrome extension |
| `pnpm prisma:generate` | runs `prisma generate` |
| `pnpm prisma:validate` | runs `prisma validate` |
| `pnpm prisma:migrate` | runs `scripts/migrate-dev.mjs`: `prisma migrate dev` against a disposable plaintext scratch database in `temp/`, to create a new migration folder; the encrypted database receives it at the next unlock |
| `pnpm lp:lut` | generates Talentum's default image LUT (`.cube`), matching the landing page's CSS and SVG image filter |
| `pnpm lp:icones` | generates the landing page SVG icon map from `bootstrap-icons` |
| `pnpm lp:telas` | generates the 640 px variants of the screenshots shown on the landing page |
| `pnpm cloudflare:dev` | starts the Worker with local D1 (`wrangler dev`) |
| `pnpm cloudflare:build` | validates and bundles the Worker without publishing (`wrangler deploy --dry-run`) |
| `pnpm cloudflare:types` | generates Worker binding types (`wrangler types`) |
| `pnpm cloudflare:migrations:list:local` | lists pending migrations on local D1 |
| `pnpm cloudflare:migrations:apply:local` | applies migrations to local D1 |
| `pnpm cloudflare:migrations:list:remote` | lists pending migrations on remote D1 |
| `pnpm cloudflare:migrations:apply:remote` | applies reviewed migrations to remote D1 |
| `pnpm cloudflare:deploy` | publishes the Worker (requires an authenticated Wrangler) |
| `pnpm cloudflare:test` | runs only `tests/cloud-contracts.test.mjs` (Worker contracts, runtime migration and landing page isolation) |
| `pnpm web:typecheck` | type-checks the isolated landing page/BFF |
| `pnpm web:build` | builds the isolated landing page intended for Vercel |
| `pnpm hooks:install` | runs `scripts/install-hooks.mjs`: sets `core.hooksPath` to `.githooks/` and marks the hooks executable (typecheck and tests before commit and push) |
| `pnpm marca:gerar` | generates the vector brand (light, dark and seal SVG) and the `.ico` files for the app, the landing page and the window |
| `pnpm estados:gerar` | generates the per-theme state illustrations from the masters in `design/estados-vetor/` |

The landing page has its own scripts in `apps/web/package.json`; run it on the host with `pnpm --dir apps/web dev` (port 3100). Commands that publish or change remote resources (`cloudflare:deploy`, `cloudflare:migrations:apply:remote`) run only when explicitly requested, per `CLAUDE.md`.

## Running locally

Status: **Current**.

- The local database is encrypted and opens only with the local password ([ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)). The first time you open `http://127.0.0.1:3000` the app asks you to create the password ("Proteja seus dados") and shows a recovery code once; an existing plaintext database in `temp/` is encrypted in that step. After that, every start shows "Desbloquear o Talentum". Pending migrations, including the destructive-migration gate (`TALENTUM_VERIFIED_BACKUP_ID`), are applied by the backend at unlock.
- `scripts/dev.mjs` terminates whatever process holds port 3000 (on Windows via `netstat`/`taskkill`, elsewhere via `lsof`/`kill`), waits up to five seconds for the port to be free, removes `.next` and starts `next dev` bound to `127.0.0.1:3000`. It no longer runs `prisma migrate deploy`, which would create a plaintext database beside the vault.
- Electron runs on the host and points to `http://localhost:3000`, both for `pnpm dev` and for the server started by Compose. `TALENTUM_URL` overrides the address when necessary.
- `pnpm dev:all` checks `GET /api/health/live` first. When the local backend already answers, the window attaches to it and no new server starts; closing the window in that mode does not stop the container or the other terminal. When nothing answers, the script starts the server and stops it together with the window.
- `pnpm start` runs `next start` on the host.

### Ports shared with other projects

Talentum's servers listen only on IPv4 loopback (`127.0.0.1`). Another local server started with `--hostname localhost` can hold the same port on IPv6 (`[::1]`), and the browser, which tries IPv6 first when resolving `localhost`, opens that other project. When `http://localhost:<port>` shows a page that is not Talentum, use `http://127.0.0.1:<port>` or stop the other server. To see who is listening, use `Get-NetTCPConnection -LocalPort 3000,3001,3100 -State Listen` on Windows or `lsof -iTCP -sTCP:LISTEN` on Linux.

## Docker

Status: **Current**. Docker is a **development tool only**. It is not a self-hosting option and not a way to distribute Talentum to people: the desktop installers for Windows, Linux and macOS never require Docker and never will ([ADR 0004](decisions/0004-electron-packaging.md), [ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)).

- `compose.yaml` defines two services: `talentum-local` (the local backend and desktop interface) published on `127.0.0.1:3000`, and `talentum-web` (only the landing page/BFF from `apps/web`) published on `127.0.0.1:3100`. Both have healthchecks and `restart: unless-stopped`.
- `Dockerfile` (local application) uses an Ubuntu 24.04 base with Node.js 22 copied from the official image, runs as a non-root user, installs only the system packages needed for TLS/Prisma, and serves the Next.js standalone output directly, avoiding pnpm symlink incompatibilities on Windows. On start the container only runs `node server.js`: the database `/data/talentum-local.db` is encrypted the same way as on the host, the vault file `talentum-local.vault` sits next to it in the volume, and migrations (with the destructive-migration gate) are applied by the backend at unlock. The port stays bound to `127.0.0.1` only. The named volume `talentum-data` preserves SQLite across container recreation. Electron does not run inside the image.
- `Dockerfile.web` (landing page) uses `node:22-bookworm-slim`, builds `apps/web` and runs its standalone output as a non-root user. Its build stage runs `COPY . .`, so the whole repository (minus `.dockerignore` entries) enters the build context; see the isolation finding in [decisions/0001-web-hosting.md](decisions/0001-web-hosting.md).
- Inside the container, the landing page reaches the Worker at `host.docker.internal:8787` by default (mapped with `extra_hosts` so it also works on Linux), overridable with `DOCKER_CLOUDFLARE_API_BASE_URL`. Local integration values belong in the ignored `.env`, never in the versioned Compose file.

### Local database inside Docker

To make `http://localhost:3000` use the database inside Docker, start the application through Compose (`pnpm docker:up:detached`). The encrypted SQLite file and its vault then live in the `talentum-data` volume (`/data/talentum-local.db`, `/data/talentum-local.vault`), not on the host; the first visit asks for a password for that volume, independent of the host's. Afterwards, `pnpm dev:all` detects the container through the healthcheck and only opens the Electron window on it. Do not run `pnpm dev` while the container is up: the script frees port 3000 by terminating the process that holds it, which includes Docker's port forwarding, and would switch to the host's `temp/talentum-local.db`. The database remains SQLite; replacing it with a database server would contradict the local-first model described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Local database workflow

Status: **Current**.

- The local schema is `prisma/schema.prisma`; see [DATABASE.md](DATABASE.md) before any schema work.
- Create migrations with `pnpm prisma:migrate --name <name>`. Do not use `prisma db push` as a project workflow.
- Migrations that were already applied are immutable; a contract test enforces this.
- The SQLite database already holds the profile, onboarding, financial core, obligations, income and rules, Pix identifiers, import details, transaction revisions, reconciliation, timeline and backup metadata (24 models). The local device key `talentum-local.key` and the vault file `talentum-local.vault` live next to the database file and are ignored by Git ([ADR 0003](decisions/0003-local-device-key.md), [ADR 0009](decisions/0009-local-vault-and-encrypted-database.md)). The database is encrypted, so `prisma studio` and SQLite tools cannot open it; inspect data through the app or the local API.
- `pnpm typecheck` compares `prisma/schema.prisma` with the copy stored in the generated client and runs `prisma generate` only when they differ. On Windows the development server locks the Prisma DLL, and regenerating while it was open failed with `EPERM`; if the schema changed, stop the server before running the typecheck.

## Cloudflare development

Status: **Current** for the commands; operational setup, deployment and secret provisioning are described in [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

- Copy `cloudflare/.dev.vars.example` to the ignored `cloudflare/.dev.vars` and fill it with local values (including `MFA_ENCRYPTION_KEY`; leave `TURNSTILE_SECRET_KEY` empty or use Cloudflare's documented test keys); then run `pnpm cloudflare:dev` to start the Worker with local D1. To see news locally, start the Worker with `pnpm exec wrangler dev --config cloudflare/wrangler.jsonc --test-scheduled` and trigger the cron with `curl "http://127.0.0.1:8787/__scheduled"`, and point the local app at the Worker with `TALENTUM_CLOUD_API_URL`.
- Apply D1 migrations locally with `pnpm cloudflare:migrations:apply:local` (list first with `:list:local`). D1 holds minimal identity, consents, sessions, encrypted two-step verification secrets, action codes, releases, download grants, community content and public news; it never holds financial data.
- Validate the bundle with `pnpm cloudflare:build` and the contracts with `pnpm cloudflare:test` before proposing Worker changes.
- Remote migrations and deploys (`:apply:remote`, `cloudflare:deploy`) change remote resources and run only on explicit request, after review.

## Design tooling and agent skills

Status: **Current**.

`.claude/skills/` and `.claude/agents/` version third-party design skills used by Claude Code in this repository. They are support tools, not normative sources: in any conflict, [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [PRODUCT.md](PRODUCT.md) and the other rules in `docs/` prevail. They are a deliberate exception to the rule of keeping Markdown only in `docs/`, because Claude Code discovers them only at that path.

| Source | License | Revision | Installed content |
| --- | --- | --- | --- |
| [`emilkowalski/skills`](https://github.com/emilkowalski/skills) | MIT | `2d22863` | the 15 skills from `skills/` (animation, design engineering, UI) |
| [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Apache-2.0 | `658b4ce` | `.claude/skills/impeccable` and the four `impeccable-*` agents |
| [`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill) | MIT | `12af471` | `skills/taste-skill` |

Each skill ships with its source `LICENSE`. Installation decisions:

- The Impeccable hooks (the source repository's `.claude/settings.json`) were **not** installed. They would run a downloaded binary on every edit and at the end of every session. Record the decision before enabling them.
- `.claude/skills/impeccable/scripts/impeccable` downloads its binary from GitHub Releases on first run and executes it only after checking the published SHA-256.
- The taste-skill scripts (including the inspector at `.claude/skills/taste-skill/scripts/inspect.mjs`) query public image APIs (Openverse, Wikimedia, the Met, AIC, Internet Archive, NASA) and write history to `~/.taste-skill`. No financial or repository data is sent.

To update a skill, clone the source into a temporary directory, review the diff (especially scripts, hooks and network access), replace the folder and update the revision in this table.

## Tests

Status: **Current**.

- `pnpm test` uses Node's built-in runner (`node --test`) with no extra library. Every test file lives in `tests/` and ends in `.test.mjs`; the glob `tests/**/*.test.mjs` picks up both top-level and `tests/regression/` files.
- The financial formulas live in `src/server/dashboard-metrics.ts`, a pure module without Prisma and without an implicit clock, and are tested directly: Node strips types natively and imports the `.ts` file without a build step. `--experimental-strip-types` is passed explicitly for compatibility from Node 22.13; from Node 22.18 it is unnecessary.
- Worker tests do not read the source text: `tests/regression/helpers/worker.mjs` builds an in-memory D1 with `node:sqlite` and the real migrations from `cloudflare/migrations`, and imports `cloudflare/src/index.ts` directly. This requires Node with `node:sqlite` (22.13 or later).
- Contract tests read the source code and check invariants that must not regress silently: the `X-Action-Code` requirement, `profileId` scoping in every `where` clause, no formatted monetary text in the backend, no Prisma in the frontend and immutability of applied migrations. Feature-level contract tests: `onboarding-contracts.test.mjs` (relational migration, action code, profile scoping, optimistic concurrency and the four steps), `financial-planning-contracts.test.mjs` (categories, income, obligations and deterministic rules), `transaction-detail-contracts.test.mjs` (detail, edit and history), `reconciliation-contracts.test.mjs`, `timeline-contracts.test.mjs` and `electron-security.test.mjs`.
- No test depends on a credential or a personal service.
- End-to-end tests use Playwright (`playwright.config.ts`, files `tests/e2e/*.spec.ts`, which the `pnpm test` glob does not pick up). `pnpm test:e2e` starts `scripts/e2e-server.mjs`: a fresh encrypted SQLite database in `temp/e2e/`, `next dev` on `127.0.0.1:3210` (`TALENTUM_E2E_PORT` changes the port for both the server and Playwright) and the build directory `.next-e2e`, so it never touches your database or a running `pnpm dev`. The server creates the vault with the synthetic test password (below) and sets auto-lock to 60 minutes; `tests/e2e/global-setup.ts` unlocks it and saves the session cookie to `temp/e2e/storage-state.json`, which every test loads. `tests/e2e/vault.spec.ts` and the `bloqueio` viewport case start without that cookie to check the lock screen. If something already answers on the port outside CI, Playwright reuses it. The global teardown restores `next-env.d.ts`, which Next rewrites for the other build directory.
- `tests/e2e/smoke.spec.ts` covers the basic flows on an empty database (Início without amounts, the empty Dashboard never showing `R$ 0,00`, action codes required and single-use, the not-found page). `tests/e2e/viewports.spec.ts` renders the main screens at the twelve viewport classes in both themes and fails on horizontal scroll or visible text below 12 px. It automates two checks of the visual QA procedure in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md#test-procedure); it does not replace looking at the screens.
- End-to-end tests are not in the Git hooks (they take about 35 seconds and need the downloaded browser). Run them before committing any interface or local API change.

### Manual testing in the browser

Status: **Current**. Mandatory for every interface or local API change, after the automated tests pass. It does not replace them: it finds what scripted tests do not look for, such as confusing copy, a step that feels broken, a missing focus state or an error the person cannot recover from.

1. Run `pnpm test:manual`. It starts the same isolated server as the end-to-end tests (`scripts/e2e-server.mjs`): a fresh encrypted SQLite database in `temp/e2e/`, `next dev` on `http://127.0.0.1:3210`, and `next-env.d.ts` restored when the server stops. Never test against `pnpm dev`, whose database may hold real data.
   - **Logging in.** As soon as the server answers, the script creates the vault with the synthetic test password `cofre sintetico de teste 3210` (defined in `scripts/e2e-vault.mjs`, overridable with `TALENTUM_E2E_VAULT_PASSWORD`, used only for this throwaway database) and sets auto-lock to 60 minutes. Open the app, type that password on "Desbloquear o Talentum" and select Desbloquear. The first unlock shows a new recovery code because the scripted setup did not keep the first one: check "Guardei o código" and continue.
   - **First run.** To test "Proteja seus dados" itself, start with `TALENTUM_E2E_SKIP_VAULT_SETUP=1 pnpm test:manual`: no vault is created and the first screen is the password setup.
2. Open the app through the Claude in Chrome extension in a new tab and use each affected flow from start to finish as a person would: reach it from the navigation, click, type, submit, cancel, undo, and use the keyboard (Tab, Enter, Esc).
3. Try what a person gets wrong: empty and invalid fields, double clicks on submit, the back button, reloading in the middle of a flow.
4. Read the console and the network requests; any error, failed request or rejected action code is a finding.
5. Repeat the main flow in the dark and the light theme and at least at one mobile and one desktop width.
6. Use only synthetic data. Avoid controls that open native browser dialogs (`alert`, `confirm`), which block the extension.
7. Report each flow tested, its result and what was not covered. A defect found here follows [Bug fixes and regression tests](#bug-fixes-and-regression-tests).

The statement importer is tested in layers:

| File | Layer | Needs a running server? |
| --- | --- | --- |
| `import-values.test.mjs` | monetary value and civil date | no |
| `import-csv.test.mjs` | dialect, quoting, mapping and encoding | no |
| `import-ofx.test.mjs` | OFX in SGML and in XML | no |
| `import-inspect.test.mjs` | full inspection and security limits | no |
| `import-e2e.test.mjs` | real HTTP flow and security controls | **yes** |

The dashboard, accounts and color validation have their own suites:

| File | Layer | Needs a running server? |
| --- | --- | --- |
| `dashboard-metrics.test.mjs` | indicator formulas | no |
| `dashboard-charts.test.mjs` | cash projection and monthly flow | no |
| `palette.test.mjs` | palette validator | no |
| `pix.test.mjs` | Pix identifier normalization and cryptography | no |
| `accounts-e2e.test.mjs` | accounts, balances and Pix keys | **yes** |

`tests/palette.test.mjs` does not only check that the validator runs: it requires its **verdicts to reproduce** those recorded in the dashboard specification of [PRODUCT.md](PRODUCT.md), the D-5 failures and the R-15 passes in both themes. If the validator disagrees with the document, one of the two is wrong and the test fails.

The end-to-end tests run against the running backend and are **skipped automatically** when no server answers, so `pnpm test` stays green offline. Because the database is encrypted, they also need a session (`tests/live-backend.mjs`): against the isolated server on port 3210 they unlock with the synthetic test password; against any other address only when `TALENTUM_E2E_VAULT_PASSWORD` is set, otherwise they are skipped without trying a password, so they never add failed attempts to your own vault. They never create a vault. They create their own synthetic profile and account and undo the batches they create. Use `TALENTUM_E2E_URL` to point to another address. CI does not start a backend, so these two files are skipped there.

The pure modules in `src/server/import/` use explicit `.ts` extensions in relative imports. This lets the Node runner import them directly without a build step, which is why `allowImportingTsExtensions` is enabled in `tsconfig.json`. For the same reason they do not use *parameter properties*: Node's `strip-only` mode does not support them.

### Minimum quality by area

- Financial rules: unit tests for limits and rounding.
- Persistence: migration and rollback tests. **Planned** for rollback; applied-migration immutability is **Current**.
- Importers: synthetic fixtures and duplicate-detection tests. **Current** for CSV and OFX (see the table above).
- External integrations: simulated in tests.
- Critical flows: integration coverage before distribution.

### Test data

Use only synthetic names, institutions, documents, accounts and values. Do not superficially anonymize a real statement; build an artificial fixture that represents the required format.

## Bug fixes and regression tests

Rule (mandatory; this section is the owner, and `CLAUDE.md` points here). Every bug fix follows this order, without exception:

1. Write a regression test that reproduces the bug and name it after the defect.
2. Run it and confirm it fails for the reason described. A test that passes before the fix does not reproduce the bug.
3. Fix the code.
4. Run the regression test again and confirm it passes, then run the complete suite.
5. Never delete or weaken an existing regression test to make a change pass.

Regression tests live in `tests/regression/` and run with `pnpm test`. The whole suite, regression tests included, must pass before every commit and every push so that a bug that already existed can never ship again.

## Git hooks

Status: **Current**.

`.githooks/pre-commit` and `.githooks/pre-push` run `pnpm typecheck`, `pnpm lint` and `pnpm test` and block the operation on any failure. Install them once per clone with `pnpm hooks:install`, which sets `core.hooksPath` and marks both hooks executable. Git silently skips a hook without the executable bit and only prints a `hint`, so the hooks are versioned as `100755` and `tests/regression/git-hooks-executable.test.mjs` keeps them that way. To confirm the installation, `git config --get core.hooksPath` must print `.githooks`. Never bypass them with `--no-verify`. The mandatory [security gate in SECURITY.md](SECURITY.md#mandatory-pre-commit-and-pre-push-security-gate) applies in addition to the hooks.

## Automated quality

- **Current:** type checking (`pnpm typecheck`), linting with Biome (`pnpm lint`, recommended rules; per-file exceptions are listed with their reason in `biome.json`), the Node test suite, the Playwright end-to-end suite and the Git hooks above. Third-party skills in `.claude/` are excluded from linting. Why Biome and Playwright: [decisions/0005-biome-and-playwright.md](decisions/0005-biome-and-playwright.md).
- **Current:** continuous integration in `.github/workflows/ci.yml`, on pushes to `main` and on pull requests, with read-only `contents` permission. On Ubuntu 24.04 with Node 22.13.0 and pnpm 11.1.2 it runs `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level high`, `prisma:generate`, `prisma:validate`, `typecheck`, `lint`, `test`, end-to-end tests (`playwright install --with-deps chromium`, then `test:e2e`), `build`, `web:typecheck`, `web:build`, the Vercel build isolation check (`node scripts/web-isolation-check.mjs`), `cloudflare:build` and `cloudflare:test`. A second workflow, `.github/workflows/security.yml`, runs gitleaks, dependency review (pull requests) and CodeQL, and `.github/dependabot.yml` schedules weekly npm and GitHub Actions updates. Its supply-chain hardening (actions pinned by SHA, `persist-credentials: false`) is owned by [SECURITY.md](SECURITY.md#supply-chain-ci-and-release-integrity).
- **Planned:** enforcing the Biome formatter. The formatter is configured in `biome.json` (2 spaces, single quotes, semicolons, trailing commas, 140 columns), but the existing code was never formatted consistently and a first run rewrites about 170 files. That one-time formatting commit waits until the `feat/conclusao-mvp` integration lands, so it does not conflict with it; after it, `pnpm format:check` joins the hooks. Until then, do not run `pnpm format` on the whole tree.
- **Planned:** the GitHub repository settings that enforce those workflows (required checks, push protection, Dependabot alerts).
- Cover business rules with unit tests and critical flows with integration or end-to-end tests.
- Do not use coverage percentage as the only quality measure; verify meaningful behavior and edge cases.
- Interface changes are validated in both the light and the dark theme, as required by `CLAUDE.md` and detailed in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Branches and review

- Keep `main` stable and use short-lived branches for features and fixes.
- Make pull requests small and include context, scope, risks and verification instructions.
- Require checks and review before merging application changes. CI exists (**Current**); making it a required status check through branch protection is a repository setting this repository cannot prove (**Open**). Until confirmed, the local hooks and reviewer verification remain the gate.
- Resolve review conversations and avoid unrelated refactors in the same change.
- Protect `main` against deletion, force pushes and merges that bypass required checks.
- Documentation-only changes may go directly to `main`; all other changes use a dedicated branch by default. When the maintainer explicitly asks for a commit to `main`, commit there; the hooks and the security gate still apply.

Suggested branch names:

```text
feat/short-name
fix/short-name
docs/short-name
refactor/short-name
```

## Commits

Keep commits small and self-contained. Use Conventional Commits:

```text
<type>(<optional-scope>): <description>
```

Common types include `feat`, `fix`, `docs`, `test`, `refactor`, `chore` and `ci`.

Example: `feat(auth): add password recovery`.

Never commit or push until the [security gate in SECURITY.md](SECURITY.md#mandatory-pre-commit-and-pre-push-security-gate) and its offensive security review have completed successfully.

## Implementation flow

1. Confirm the requirement in the product documentation ([PRODUCT.md](PRODUCT.md), [ROADMAP.md](ROADMAP.md)).
2. Update or create the necessary technical decision (ADR).
3. Implement a small vertical capability.
4. Add tests proportional to the risk; for bug fixes, follow the test-first order above.
5. Run the available checks: `pnpm typecheck`, `pnpm test`, the relevant builds (`pnpm build`, `pnpm web:build`, `pnpm cloudflare:build`) and, for Worker changes, `pnpm cloudflare:test`.
6. Update the affected source of truth in `docs/`. Before creating structure, search for an equivalent and add only directories with an immediate responsibility; the architecture overview is in [ARCHITECTURE.md](ARCHITECTURE.md).
7. Use Conventional Commits.

## Security

The normative rules, including the pre-commit gate, are in [SECURITY.md](SECURITY.md). Development baseline:

- Never commit passwords, tokens, keys, credentials or connection strings.
- Validate all untrusted input on the server, preferably with allowlists.
- Use parameterized queries and context-appropriate output encoding.
- Enforce authentication and authorization on trusted systems and apply least privilege.
- Keep dependencies current. **Current:** CI fails on high or critical production advisories (`pnpm audit`). **Planned:** dependency alerts, code scanning and secret scanning in CI.
- Never write sensitive data to logs. Rotate any exposed secret immediately.

## Configuration and operations

- Keep code separate from deploy-specific configuration.
- Make development, staging and production environments as similar as practical.
- Separate build, release and run stages.
- Produce structured logs with diagnostic context but no confidential information.
- Design services for fast startup and graceful shutdown.

## Releases

When the project has a public API, use Semantic Versioning in the `MAJOR.MINOR.PATCH` format:

- `MAJOR` for incompatible changes.
- `MINOR` for backward-compatible features.
- `PATCH` for backward-compatible fixes.

Never modify an already published version. Record meaningful changes in a changelog and tag releases in Git. **Planned:** signed Windows, Linux and macOS installers published to GitHub Releases (see [ROADMAP.md](ROADMAP.md)). The packager is `electron-builder` ([ADR 0004](decisions/0004-electron-packaging.md)); local builds are unsigned and for testing only.

Release assets must keep the names in `build.*.artifactName`, because the in-app update notice looks them up by name: `Talentum-<version>-Windows-x64.exe`, `Talentum-<version>-macOS-arm64.dmg`, `Talentum-<version>-macOS-x64.dmg` (plus the `.zip` of each Mac architecture) and `Talentum-<version>-Linux-x64.AppImage`. Each installer the app can install needs a `<file>.sig` asset with the Ed25519 signature of `talentum-update:v1:<file name>:<sha256>`, made with the release key, whose public half goes into `UPDATE_SIGNING_PUBLIC_KEY` in `electron/update-verify.cjs` (**Planned**: the key does not exist yet, so the app refuses to install and links to the release page).

**macOS (Planned for signing and notarization).** Building requires a Mac; build each architecture on a Mac of that architecture (Apple silicon for `arm64`, Intel for `x64`), so the Prisma engines bundled match. `build.mac` enables the hardened runtime with `packaging/entitlements.mac.plist` (only `com.apple.security.cs.allow-jit`) and `notarize: true`. Signing needs a Developer ID Application certificate in the Mac's keychain (or `CSC_LINK`/`CSC_KEY_PASSWORD`), and notarization reads Apple credentials only from the environment (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, preferred, or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). None of these values ever enters the repository, `.env.example` or a log. Without them the build is unsigned, Gatekeeper blocks it on other Macs, and it serves only for local testing.

## Definition of done

- [ ] Acceptance criteria are satisfied.
- [ ] The implementation is simple and readable.
- [ ] Appropriate tests exist (a failing-first regression test for every bug fix) and `pnpm typecheck` and `pnpm test` pass.
- [ ] Interface changes were validated in both the light and the dark theme.
- [ ] Interface and local API changes were tested by hand through the Claude in Chrome extension ([Manual testing in the browser](#manual-testing-in-the-browser)).
- [ ] No secrets, personal data or known vulnerabilities were introduced.
- [ ] Relevant documentation was updated in the same change set.
- [ ] The change was reviewed and can be safely released or reverted.

## References

- [GitHub Docs: Best practices for repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [GitHub Docs: Managing and standardizing pull requests](https://docs.github.com/en/pull-requests/reference/managing-and-standardizing-pull-requests)
- [GitHub Docs: Continuous integration](https://docs.github.com/en/actions/get-started/continuous-integration)
- [The Twelve-Factor App](https://12factor.net/)
- [Folder Structure Best Practices: The Complete Guide](https://www.suitefiles.com/guide/the-guide-to-folder-structures-best-practices-for-professional-service-firms-and-more/)
- [Organizing Project Folder Structure: Function-Based vs Feature-Based](https://medium.com/@ikonija.bogojevic/organizing-project-folder-structure-function-based-vs-feature-based-168596b6d169)
- [Standard Go Project Layout](https://github.com/golang-standards/project-layout)
- [Bootstrap Icons](https://icons.getbootstrap.com/)
- [OWASP Secure Coding Practices Checklist](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Semantic Versioning 2.0.0](https://semver.org/)
