# Claude Instructions

## Start here

Read, in order, the root `README.md`, `docs/HOW-IT-WORKS.md`, `docs/ARCHITECTURE.md`, and `docs/BEST_PRACTICES.md` before changing the project. Read `docs/BRANDING.md` for interface work, `docs/DATA_MODEL.md` before touching the schema, and `docs/SECURITY.md` before writing any authentication, API, or data-handling code — its rules are mandatory, not suggestions.

## Project context

Tabularium is an early-stage TypeScript monorepo using pnpm, Turborepo, Next.js, PostgreSQL, and Prisma. Do not assume requirements or infrastructure that are not documented in the repository.

## Canonical organization

- `src/` contains the root Next.js application.
- `packages/` contains reusable workspace packages: `config`, `db`, `env`, and `ui`.
- `docs/` contains every Markdown document except the root `README.md`.
- The root `.env` is the only local environment file. Keep `.env.example` secret-free and synchronized with required variables.
- Generated files, caches, logs, installed dependencies, screenshots, extracted references, and experiments are not source code. Do not duplicate them into `apps/` or `packages/`.
- Before creating any path, search the repository for an existing equivalent and extend it.

## Mandatory safety rules

- Never expose, version, log, quote, screenshot, or place in tool output any secret or credential, including passwords, tokens, cookies, API keys, connection strings, private keys, database fields, OAuth/OIDC values, and environment-variable values.
- Treat internal information as confidential even when it is not a credential: personal names, usernames, emails, absolute local paths, repository/account/team/project identifiers, deployment IDs, private URLs, infrastructure details, internal file names, architecture notes, roadmaps, diagnostics, and operational metadata.
- Keep `.env.example` limited to required variable names with empty values or unmistakably synthetic placeholders. Never copy values from `.env`, provider dashboards, CLI output, logs, or a real deployment into examples or Markdown.
- Never render internal documentation, source paths, component names, design/debug guides, environment data, deployment metadata, or staff identities in a public page. Internal guides belong only in `docs/`, never in `src/app` or another production route.
- Do not create public debug, style-guide, playground, diagnostics, admin, preview, or internal-reference routes unless the user explicitly requests them and access control is implemented.
- Redact sensitive portions before sharing command output or error logs. If a value is not required to answer the user, do not read or print it.
- Never create commits or push changes unless explicitly requested.
- Never run migrations, deployments, releases, merges, rebases, or destructive Git commands without explicit authorization.
- Never change remote resources, production data, cloud infrastructure, or repository settings without explicit authorization.
- Preserve existing user changes and keep modifications within scope.

## Working guidelines

- Prefer simple, readable solutions consistent with the feature-based layout in `docs/BEST_PRACTICES.md`.
- Put app-owned components and modules in root `src/`; put genuinely shared code in the appropriate package.
- Do not create a second app, package, documentation tree, environment file, or component library for work that fits an existing location.
- Use environment variables for deploy-specific configuration.
- Update `README.md` and `docs/HOW-IT-WORKS.md` when setup, commands, architecture, or runtime flow changes.
- Use `lucide-react` for all UI icons — the project's single icon family, already wired into shadcn (`components.json`: `"iconLibrary": "lucide"`) and every existing component; document any exception.

## Quality and verification

- Add or update tests in proportion to the change.
- Run available type checks and builds, plus relevant linting/tests when introduced.
- Report what was validated and any remaining limitation.
- Before every build or deploy, scan public source and documentation for credentials, personal data, absolute paths, internal IDs, internal-only routes, and implementation details exposed as UI copy. Remove findings or stop the deployment.
- Suggest Conventional Commit messages when useful, but do not commit unless requested.
