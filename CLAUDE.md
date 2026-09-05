# Claude Instructions

## Start here

Before changing the project, read `README.md`, `docs/README.md`, `docs/HOW-IT-WORKS.md`, `docs/ARCHITECTURE.md`, and `docs/BEST_PRACTICES.md`. Read the specific Web or Electron architecture for affected work, `docs/BRANDING.md` for interface work, `docs/DATA_MODEL.md` before schema work, and `docs/API.md`, `docs/AUTHENTICATION.md`, and `docs/SECURITY.md` before authentication, API, or data-handling work. Their rules are mandatory.

## Project context

Talentum is an early-stage, open-source, local-first financial application planned around TypeScript, pnpm, Next.js, Electron, Prisma/SQLite and a Cloudflare backend. Do not assume undocumented requirements or infrastructure.

## Architecture rules

- Every browser or Electron renderer operation calls a documented backend contract. Frontends never access a database or privileged provider directly.
- Except for the bootstrap endpoint that issues it, every frontend-to-backend request uses a backend-issued, opaque, single-use action code with a short TTL.
- The action code contains no user data, is not used for analytics or tracking, and does not replace authentication, authorization, CSRF protection, idempotency or rate limiting.
- Every persisted table, including join tables, has an opaque `id`; relations use foreign-key IDs.
- Financial data remains local unless an explicit, documented and reviewed requirement says otherwise.

## Documentation is part of the change

- Document every material change in the same change set.
- Update the affected architecture, runtime flow, API contract, data model, security rule, development guide, branding guide or ADR.
- Update `docs/README.md` when adding, removing, renaming or changing the responsibility of a document.
- Update the root `README.md` when setup, commands, product scope or onboarding changes.
- Mark statements as **current**, **planned**, or **open**. Never present planned work as implemented.
- Record meaningful alternatives and consequences in an ADR.
- Documentation must let contributors understand, reproduce, test and review the change without disclosing secrets or personal data.

## Repository and safety

- Search before creating; extend canonical paths and avoid duplicate trees.
- Preserve user changes and remain within scope.
- Never expose, version, log, quote, screenshot or emit passwords, tokens, cookies, API keys, connection strings, private keys, database values, OAuth values or environment-variable values.
- `.env.example` contains names and unmistakably synthetic placeholders only.
- Never render internal documentation, local paths, diagnostics, infrastructure metadata or staff identities in public UI.
- Redact sensitive output and logs.
- Never commit, push, migrate, deploy, release, merge, rebase or change remote resources unless explicitly requested.
- Use Bootstrap Icons for interface icons; document any necessary exception.

## Quality

- Add or update tests in proportion to the change.
- Run relevant checks and report validations and limitations.
- Before build, commit, push or deploy, scan source, configuration, documentation and history as appropriate for secrets and personal data.
- A feature is not done until implementation, tests and relevant documentation agree.
