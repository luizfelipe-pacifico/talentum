# Claude Instructions

## Start here

Before changing the project, read `README.md`, `docs/README.md`, `docs/MEMORY-AI.md` (how the maintainer thinks and works; update it whenever you learn a new preference or receive a correction), `docs/ARCHITECTURE.md`, and `docs/BEST_PRACTICES.md`. Read the Web or Electron layer of `docs/ARCHITECTURE.md` for affected work, `docs/PRODUCT.md` for feature and route work, `docs/DESIGN-SYSTEM.md` for interface work, `docs/DATABASE.md` before schema work, and `docs/SECURITY.md` before authentication, API, or data-handling work and before every commit and push. Their rules are mandatory. `docs/README.md` says which document owns each fact; change a fact in its owner and link to it elsewhere.

## Standing instructions from the user

Whenever the user says to always do something ("sempre execute isso", "sempre faça", "always do this", or any equivalent standing instruction), add it to this file as a mandatory rule in the same turn, without asking for confirmation. Put it in the most relevant section, or in this section when none fits, write it in English. `AGENTS.md` only points other agents to this file, so nothing is mirrored there. Once recorded, it binds every later session exactly like the rest of this file.

## Design, responsiveness and copy are mandatory

- Follow every design principle in `docs/DESIGN-SYSTEM.md` strictly and validate each interface change against all of them before calling it done. Report any principle a change does not meet.
- Before designing any interaction, navigation or layout, research the pattern that large, widely used products (major social networks, mail, maps, banking, streaming and operating-system apps, plus Apple HIG and Material Design) use for the same task, and follow it unless there is a documented reason not to. People already know those patterns (Jakob's law): swipe gestures, tab bars such as Home, Videos and Search, pull to refresh, search placement, filters and sheets should behave the way they expect. Record the reference you followed and any deliberate deviation.
- Responsiveness is a UX decision, not a fit-to-width exercise. For every layout, choose the best pattern for each context instead of only shrinking or wrapping it; for example, filters can sit side by side on desktop but become a dropdown or sheet on mobile, tablet and other small viewports.
- Validate every interface change on all twelve viewport classes defined in `docs/DESIGN-SYSTEM.md`: small, medium and large mobile; small, medium and large tablet; small, medium and large desktop; and small, medium and large TV. Validate each one in the light and the dark theme, never in only one: compare contrast, legibility, borders, illustrations and states, and report the result per viewport and theme. Theme-specific assets, such as the state illustrations, must exist for both themes and be checked in both.
- In the frontend, after building or changing a layout, always run the `impeccable` skill to rework and refine that layout.
- On the landing page (`apps/web`), always use the `impeccable` skill, the Emil Kowalski skills (`emil-design-eng` and the animation skills) and the `taste-skill` together.
- Write every interface text following the UX writing rules in `docs/DESIGN-SYSTEM.md`: words specific enough that the reader has no doubt about what they mean or what will happen.
- After finishing any piece of work (code, interface, copy or documentation), review it for AI slop (generic or templated layouts, filler words, vague or inflated copy, invented facts, decorative noise) and fix what you find before reporting.
- Always check and fix AI slop in everything that comes up during a task, including work you did not create, not only your own output. The one exception is the product interface shown inside a product film (motion): it must reproduce the system exactly as it is, so do not restyle it there. Everything else in a film (titles, composition, transitions, copy) follows the AI slop rules, and flat-design illustrations may be created to support a film's composition, following the illustration rules in `docs/DESIGN-SYSTEM.md`.

## Legal and policy review is part of every change

- For every change, check the legal and policy questions it raises and how they apply to the software: LGPD (Lei 13.709/2018) and the privacy policy and terms in `apps/web`, consumer law where it applies, open-source and font licenses of everything shipped, and the rules of each platform the change touches (Apple notarization and App Review guidelines, Microsoft SmartScreen and code signing, GitHub, Cloudflare, Vercel and Google terms). Record findings in the document that owns the fact and report them; legal text itself still needs review by a lawyer before publication.

## Self-review loop before reporting completion

- After doing anything, critically review everything you produced: correctness, the rules in this file, the design principles, UX writing, both themes, every viewport class, AI slop, tests and documentation.
- Give the work a score from 0 to 10 and list what keeps it from a 10. Score against named criteria, not impressions: the rules in this file, the checklists in `docs/DESIGN-SYSTEM.md` (principles, copy, AI slop, design review), the Definition of done in `docs/BEST_PRACTICES.md` and, for security, `docs/SECURITY.md`. Every point deducted names the item that failed, and the score rises only after a change fixes that item.
- If the score is below 8, fix the problems and review and score again. Repeat as many times as needed, even a hundred times; never report the work as finished while the score is below 8.
- Report completion only when the score is 8 or higher, and include the final score and the main remaining weaknesses in the report.

## Illustrations humanize the interface

- Use illustrations to humanize the system wherever they help the person understand a state or a step, following the illustration rules in `docs/DESIGN-SYSTEM.md`.
- When the system needs a new flat-design illustration, generate it with Gemini through the Claude in Chrome extension, download it, and move the file from the Downloads folder into the project (`design/` for masters).
- Always convert the downloaded image to SVG with a transparent background before using it, then generate the light and dark theme variants and validate both.
- Never send personal, financial or user data to Gemini; prompts describe only the generic scene.

## Security is tested before every commit and push

- Never trust the frontend or the user. Every action is requested from the backend, which authenticates, authorizes and validates the input before executing anything; the client only displays results.
- Keep authentication on short-lived access tokens with rotating refresh tokens, encrypt sensitive data in transit and at rest, and make every write idempotent.
- Test security and idempotency for every change: authentication, authorization, input validation, CSRF, replay, rate limiting and repeated or concurrent requests.
- Before every commit and every push, act as an ethical hacker: run the offensive security review in `docs/SECURITY.md` against the change and the surfaces it touches, look for attack surfaces and vulnerabilities, and fix them before sending. Report what you checked and what you found.
- Use every free protection the platforms offer. If the Cloudflare Turnstile challenge or a free firewall/WAF rule is not active where it applies, implement the part that lives in the repository (code, configuration, tests) in the same change; for settings that live in a provider dashboard or another remote resource, write the exact change into the report and apply it only after the user explicitly authorizes it (see Repository and safety).
- Keep the security checklist in `docs/SECURITY.md` up to date with current, researched practice (OWASP ASVS, OWASP Top 10, OWASP API Security Top 10, Electron security checklist, CWE Top 25).
- A credential that is exposed, even for a minute and even only in a log, terminal or chat, must be revoked and replaced immediately, following [Incident response](docs/SECURITY.md#incident-response).

## Document everything the user says

- Record every instruction, preference and piece of context the user gives, even if it seems minor, in `docs/MEMORY-AI.md` (and as a rule here when it is a standing instruction). After a `/clear`, a new session must be able to understand the whole context and how to act from the documentation alone.
- Keep the "Current work" section of `docs/MEMORY-AI.md` updated while a multi-step task is in progress.

### What must never be written to `docs/MEMORY-AI.md`

`docs/MEMORY-AI.md` is versioned and public, like the rest of this open-source repository. Record there only how the maintainer works: preferences, decisions, corrections and lessons, written generically. Never write:

- personal data about the maintainer or anyone else: names, e-mail addresses, phone numbers, addresses, documents (CPF, RG), location, employer, health, family or daily routine;
- financial data of any kind: balances, income, transactions, accounts, cards, Pix keys, investments or debts, even as examples;
- credentials and anything on the prohibited list of the [pre-commit gate](docs/SECURITY.md#mandatory-pre-commit-and-pre-push-security-gate) (passwords, tokens, keys, cookies, connection strings, environment-variable values);
- account identifiers and handles: usernames, user or account IDs, organization or project IDs in providers, OAuth subjects;
- details of the maintainer's machine and personal setup: operating system, editor and its configuration, dotfiles, private repositories, sync mechanisms, local paths, hostnames, IP addresses or device names;
- infrastructure and operational metadata the project does not need to build or run: private dashboards, internal URLs, deployment accounts, billing or quota details;
- content pasted from chats, e-mails or other people's messages, and screenshots.

When a preference depends on a private detail, record the preference and leave the detail out: "rebuild a familiar workflow when a tool lacks a feature", not which editor or which private repository. If something on this list is already in the file, remove it in the same turn; if it was a credential, follow [Incident response](docs/SECURITY.md#incident-response).

## Project context

Talentum is an early-stage, open-source, local-first financial application planned around TypeScript, pnpm, Next.js, Electron, Prisma/SQLite and a Cloudflare backend. Do not assume undocumented requirements or infrastructure.

## Architecture rules

- Every browser or Electron renderer operation calls a documented backend contract. Frontends never access a database or privileged provider directly.
- Except for the bootstrap endpoint that issues it and infrastructure liveness probes that return no application data and are never called by the interface (`GET /api/health/live` locally, `GET /health` on the Worker), every frontend-to-backend request uses a backend-issued, opaque, single-use action code with a short TTL.
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
- Use Bootstrap Icons for interface icons by default. When Bootstrap Icons has no suitable symbol, install and use Lucide (`lucide-react`) for that icon, and record the exception in `docs/DESIGN-SYSTEM.md`.

## Quality

- Add or update tests in proportion to the change.
- Run relevant checks and report validations and limitations: `pnpm typecheck`, `pnpm lint` and `pnpm test` always; `pnpm test:e2e` for any interface or local API change.
- Manual testing through the Claude in Chrome extension is mandatory for every interface or local API change, in addition to the automated tests, never instead of them. Start the isolated server with `pnpm test:manual` (fresh database, `http://127.0.0.1:3210`) and use the affected flows the way a person would: navigate, click, type, submit, undo, use the keyboard, and try wrong input and repeated clicks. Check the console and failed network requests, and check both themes. Use only synthetic data, never the maintainer's local database or real financial data, and avoid actions that open browser dialogs. Report each flow tested, its result and anything not covered. The procedure is in [Manual testing in the browser](docs/BEST_PRACTICES.md#manual-testing-in-the-browser).
- Before build, commit, push or deploy, scan source, configuration, documentation and history as appropriate for secrets and personal data.
- A feature is not done until implementation, tests and relevant documentation agree.

## Bug fixes are test-first

Every bug fix, without exception, follows the order in [Bug fixes and regression tests](docs/BEST_PRACTICES.md#bug-fixes-and-regression-tests): a regression test in `tests/regression/` named after the defect, confirmed to fail for the reason described, then the fix, then the regression test and the complete suite passing. Never delete or weaken an existing regression test to make a change pass. The whole suite must pass before every commit and every push; the versioned hooks in `.githooks/` enforce it (`pnpm hooks:install`). Never bypass them with `--no-verify`.


## Mandatory pre-commit and pre-push security gate

Never commit or push until every step of the [pre-commit and pre-push security gate](docs/SECURITY.md#mandatory-pre-commit-and-pre-push-security-gate) and the [offensive security review](docs/SECURITY.md#offensive-security-review-before-every-commit-and-push) in `docs/SECURITY.md` has completed successfully. Read that section before every commit and every push. The gate is mandatory even when the user asks to commit immediately, the repository is private, GitHub push protection is enabled, or the change appears documentation-only. Report which checks ran, their limitations and the classes of files excluded.

If sensitive data has already been committed or pushed, stop and follow [Incident response](docs/SECURITY.md#incident-response): revoke or rotate first, never repeat the value, and only then clean up.
