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


## Mandatory pre-commit and pre-push security gate

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

If sensitive data has already been committed or pushed:

1. stop further publication and do not merely delete the value in a later commit;
2. revoke or rotate the credential first;
3. assess exposure and notify the user without repeating the value;
4. remove it from current files and, when required, coordinate Git history cleanup;
5. add a preventive ignore rule or scanner check;
6. verify forks, caches, CI logs, release artifacts and provider logs as applicable;
7. document the incident response without recording the secret.

Authoritative references:

- [GitHub — Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
- [GitHub — Secret scanning scope and limitations](https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-scope)
- [GitHub — Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Cloudflare — Environment variables and secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Cloudflare — Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
