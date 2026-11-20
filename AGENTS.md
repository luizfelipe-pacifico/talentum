# Codex Instructions

## Start here

Read `CLAUDE.md` first and follow it as well. It holds the same project rules shared with Claude Code; when the two files differ, apply the stricter rule and point out the divergence so both files can be reconciled.

Before changing the project, read `README.md`, `docs/README.md`, `docs/MEMORY-AI.md` (how the maintainer thinks and works; update it whenever you learn a new preference or receive a correction), `docs/ARCHITECTURE.md`, and `docs/BEST_PRACTICES.md`. Read the Web or Electron layer of `docs/ARCHITECTURE.md` for affected work, `docs/PRODUCT.md` for feature and route work, `docs/DESIGN-SYSTEM.md` for interface work, `docs/DATABASE.md` before schema work, and `docs/SECURITY.md` before authentication, API, or data-handling work. Their rules are mandatory.

## Standing instructions from the user

Whenever the user says to always do something ("sempre execute isso", "sempre faça", "always do this", or any equivalent standing instruction), add it to `CLAUDE.md` and to this file as a mandatory rule in the same turn, without asking for confirmation. Put it in the most relevant section, write it in English, and treat it as binding in every later session.

## Design, responsiveness and copy are mandatory

- Follow every design principle in `docs/DESIGN-SYSTEM.md` strictly and validate each interface change against all of them before calling it done. Report any principle a change does not meet.
- Before designing any interaction, navigation or layout, research the pattern that large, widely used products (major social networks, mail, maps, banking, streaming and operating-system apps, plus Apple HIG and Material Design) use for the same task, and follow it unless there is a documented reason not to. People already know those patterns (Jakob's law): swipe gestures, tab bars such as Home, Videos and Search, pull to refresh, search placement, filters and sheets should behave the way they expect. Record the reference you followed and any deliberate deviation.
- Responsiveness is a UX decision, not a fit-to-width exercise. For every layout, choose the best pattern for each context instead of only shrinking or wrapping it; for example, filters can sit side by side on desktop but become a dropdown or sheet on mobile, tablet and other small viewports.
- Validate every interface change on all twelve viewport classes defined in `docs/DESIGN-SYSTEM.md`: small, medium and large mobile; small, medium and large tablet; small, medium and large desktop; and small, medium and large TV. Validate each one in the light and the dark theme, and report the result per viewport and theme.
- In the frontend, after building or changing a layout, always run the `impeccable` skill (in `.claude/skills/`) to rework and refine that layout.
- On the landing page (`apps/web`), always use the `impeccable` skill, the Emil Kowalski skills (`emil-design-eng` and the animation skills) and the `taste-skill` together.
- Write every interface text following the UX writing rules in `docs/DESIGN-SYSTEM.md`: words specific enough that the reader has no doubt about what they mean or what will happen.
- After finishing any piece of work (code, interface, copy or documentation), review it for AI slop (generic or templated layouts, filler words, vague or inflated copy, invented facts, decorative noise) and fix what you find before reporting.

## Self-review loop before reporting completion

- After doing anything, critically review everything you produced: correctness, the rules in this file, the design principles, UX writing, both themes, every viewport class, AI slop, tests and documentation.
- Give the work a score from 0 to 10 and list what keeps it from a 10.
- If the score is below 8, fix the problems and review and score again. Repeat as many times as needed, even a hundred times; never report the work as finished while the score is below 8.
- Report completion only when the score is 8 or higher, and include the final score and the main remaining weaknesses in the report.

## Illustrations humanize the interface

- Use illustrations to humanize the system wherever they help the person understand a state or a step, following the illustration rules in `docs/DESIGN-SYSTEM.md`.
- When the system needs a new flat-design illustration, generate it with Gemini through the Claude in Chrome extension, download it, and move the file from the Downloads folder into the project (`design/` for masters).
- Always convert the downloaded image to SVG with a transparent background before using it, then generate the light and dark theme variants and validate both.
- Never send personal, financial or user data to Gemini; prompts describe only the generic scene.

## Project context

Talentum is an early-stage, open-source, local-first financial application planned around TypeScript, pnpm, Next.js, Electron, Prisma/SQLite and a Cloudflare backend. Do not invent undocumented requirements, commands, dependencies, APIs, credentials or infrastructure.

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

- Search before creating; extend canonical paths and avoid parallel trees.
- Preserve user changes and remain within scope.
- Never expose, version, log, quote, screenshot or emit passwords, tokens, cookies, API keys, connection strings, private keys, database values, OAuth values or environment-variable values.
- `.env.example` contains names and unmistakably synthetic placeholders only.
- Never render internal documentation, local paths, diagnostics, infrastructure metadata or staff identities in public UI.
- Redact sensitive output and logs.
- Use Bootstrap Icons for interface icons by default. When Bootstrap Icons has no suitable symbol, install and use Lucide (`lucide-react`) for that icon, and record the exception in `docs/DESIGN-SYSTEM.md`.
- Commit, push, migration, deployment and release require explicit user authorization.

## Quality

- Add or update tests in proportion to the change.
- Run relevant checks and report validations and limitations.
- Before build, commit, push or deploy, scan source, configuration, documentation and history as appropriate for secrets and personal data.
- A feature is not done until implementation, tests and relevant documentation agree.

## Interface validation covers both themes

- Validate every layout change in the light theme and in the dark theme, never in only one. Render both, compare contrast, legibility, borders, illustrations and states, and report the result for each theme.
- Theme-specific assets, such as the state illustrations, must exist for both themes and be checked in both.

## Bug fixes are test-first

Every bug fix follows this order, without exception:

1. Write a regression test that reproduces the bug and name it after the defect.
2. Run it and confirm it fails for the reason described. A test that passes before the fix does not reproduce the bug.
3. Fix the code.
4. Run the regression test again and confirm it passes, then run the complete suite.
5. Never delete or weaken an existing regression test to make a change pass.

Regression tests live in `tests/regression/` and run with `pnpm test`. The whole suite, regression tests included, must pass before every commit and every push so that a bug that already existed can never ship again. The versioned Git hooks in `.githooks/` enforce this; install them once with `pnpm hooks:install`. Never bypass them with `--no-verify`.


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
