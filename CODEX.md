# Codex Instructions

## Start here

Read, in order, the root `README.md`, `docs/HOW-IT-WORKS.md`, `docs/ARCHITECTURE.md`, and `docs/BEST_PRACTICES.md` before changing the project. Read `docs/BRANDING.md` for interface work, `docs/DATA_MODEL.md` before touching the schema, and `docs/SECURITY.md` before writing any authentication, API, or data-handling code — its rules are mandatory, not suggestions.

## Project context

Tabularium is an early-stage TypeScript monorepo using pnpm, Turborepo, Next.js, PostgreSQL, and Prisma. Do not invent undocumented requirements, commands, dependencies, APIs, credentials, or infrastructure.

## Canonical organization

- The deployable Next.js application lives at the repository root, with code in `src/`.
- `packages/` is only for reusable workspace capabilities: `config`, `db`, `env`, and `ui`.
- `docs/` contains every Markdown document except the root `README.md`.
- The root `.env` is the single local source of environment variables; `.env.example` contains names and safe placeholders only.
- Never create parallel folders such as another `src`, `components`, `docs`, `app`, or copied project tree when an existing canonical location can be extended.
- Search before creating. Reuse or update an equivalent file or directory instead of adding a duplicate.

## Working rules

- Preserve user changes and remain within the requested scope.
- Keep business capabilities feature-based under `src/modules` as they are introduced.
- Keep app-only components in `src/components` and shared UI primitives in `packages/ui/src/components`.
- Keep database schema/client concerns in `packages/db` and environment validation in `packages/env`.
- Never expose, version, log, quote, screenshot, or emit through tools any password, token, cookie, API key, connection string, private key, database value, OAuth/OIDC value, or environment-variable value.
- Treat personal names, usernames, emails, absolute local paths, provider/account/team/project identifiers, deployment IDs, private URLs, infrastructure details, internal file names, architecture notes, roadmaps, diagnostics, and operational metadata as confidential internal information.
- Keep `.env.example` to required variable names with empty values or clearly fake placeholders. Never derive its values from `.env`, provider dashboards, CLI output, logs, or production.
- Never put internal documentation, source paths, component/file names, design/debug guides, environment data, deployment metadata, or staff identities in public UI copy.
- Never add a public debug, style-guide, playground, diagnostics, admin, preview, or internal-reference route without an explicit request and appropriate access control. Documentation stays in `docs/`.
- Redact sensitive command output and logs before reporting them. Avoid reading or printing secret values when names/presence checks are sufficient.
- Update `README.md` and `docs/HOW-IT-WORKS.md` whenever setup, architecture, commands, or behavior changes.
- Use `lucide-react` for all UI icons — the project's single icon family, already wired into shadcn (`components.json`: `"iconLibrary": "lucide"`) and every existing component; document any exception.

## Quality and verification

- Add or update tests in proportion to the change.
- Run available type checks and builds, plus relevant linting/tests when introduced.
- Clearly report validations and remaining limitations.
- Before every build or deploy, scan public source and documentation for secrets, personal data, absolute paths, internal IDs, internal-only routes, and implementation details exposed as UI copy. Remove findings or stop the deployment.
- Use Conventional Commits only when the user requests a commit.
