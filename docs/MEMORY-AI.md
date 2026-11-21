# AI Working Memory

This document teaches AI agents (Claude Code, Codex and others) how the maintainer thinks, decides and expects work to be done on Talentum. Read it at the start of every session together with `CLAUDE.md`. It complements the rules there: `CLAUDE.md` says **what is mandatory**; this file explains **why**, shows the maintainer's way of thinking, and records lessons learned so each session works better than the last.

This file is versioned and public. It contains working style, preferences, decisions and lessons only, written generically. What must never be written here is listed in `CLAUDE.md` under "What must never be written to `docs/MEMORY-AI.md`": personal and financial data, credentials, account identifiers, details of the maintainer's machine and setup, and unnecessary operational metadata.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Communication](#communication)
- [How the maintainer thinks](#how-the-maintainer-thinks)
- [Quality bar](#quality-bar)
- [Design and UX philosophy](#design-and-ux-philosophy)
- [Copy and language](#copy-and-language)
- [Documentation philosophy](#documentation-philosophy)
- [Engineering and security posture](#engineering-and-security-posture)
- [Tools and environment](#tools-and-environment)
- [Decision patterns](#decision-patterns)
- [Security mindset](#security-mindset)
- [Current work](#current-work)
- [Lessons learned log](#lessons-learned-log)

## How to use this file

- Read it before planning. Apply it when a request is short or ambiguous: the maintainer often writes briefly and expects the agent to fill the gaps the way described here.
- Update it in the same turn whenever the maintainer states a preference, corrects you, approves an approach without hesitation, or reveals a way of thinking that is not yet recorded. Add a dated entry to the [lessons learned log](#lessons-learned-log) and, if the lesson is general, fold it into the relevant section.
- Standing instructions ("sempre…", "always…") go to `CLAUDE.md` as mandatory rules (`AGENTS.md` only points to it); this file records the reasoning behind them.
- Keep entries specific and checkable. Remove entries that turn out to be wrong instead of leaving contradictions.

## Communication

- The maintainer writes in Brazilian Portuguese, informally and fast, with typos. Read for intent, not spelling: "DESIG-SYSTEM" means `DESIGN-SYSTEM`, "BEST_PRACTICIES" means `BEST_PRACTICES`. Do not ask about obvious typos; mention the interpretation in one line.
- Answer in Brazilian Portuguese. Project files (docs, rules, code comments in new docs) are in English; interface copy is pt-BR.
- Messages often arrive while work is running and add scope. Treat each one as part of the current task, integrate it without restarting, and confirm what changed.
- Prefer a short, structured report: what was done, what was verified, what is pending, what needs a decision. Lead with the outcome.

## How the maintainer thinks

- **Do, don't just describe.** "Analise" usually means analyze and then act. "Se possível, faça também" means do it. Deliver end to end, then report.
- **Systems over one-offs.** When a preference appears once, the maintainer wants it institutionalized: a rule in `CLAUDE.md`, a section in the docs, an automated sync, a test. Ask "how does this keep happening without anyone remembering?".
- **Truth over appearance.** Documentation must match the code. Stale or optimistic claims are bugs. Mark everything **Current**, **Planned** or **Open**, and say plainly when something does not exist.
- **Consolidation.** Fewer, longer, well-organized documents beat many fragments. Merge overlap, keep every normative rule.
- **Familiar beats novel.** People already use large products every day; copy their patterns so Talentum feels intuitive (Jakob's law).
- **Context-specific UX.** The best form depends on the context (device, input, distance, task), not on what merely fits.
- **Human, not generic.** Illustrations humanize the product; AI slop (templated, vague, decorative, inflated) is unacceptable in layout, copy and docs.
- **Iterate until good.** Work is not finished at the first draft. Critique, score, redo.

## Quality bar

- Self-review loop (mandatory, see `CLAUDE.md`): critique everything you produced, score it from 0 to 10, and keep fixing until the score is at least 8, even if that takes many rounds. Report the final score and the main remaining weaknesses.
- "Garanta que está tudo feito e correto" means: re-verify against the code, run the full test suite, scan for broken links and stale references, and only then report.
- Verify subagent output before relaying it. Spot-check key claims against the code.
- Report limitations honestly: what was not tested, what could not be verified from the repository.
- Automated tests are not enough: every interface or local API change is also tested by hand through Claude in Chrome on the isolated local server, as a person would use it (`CLAUDE.md`, Quality).

## Design and UX philosophy

- Follow the design principles in `DESIGN-SYSTEM.md` strictly and validate every change against them.
- Base interactions, navigation and layout on patterns from large, widely used products and on Apple HIG and Material Design. Examples the maintainer gave: swipe gestures behave like in social networks; tab bars like Home, Videos, Search.
- Responsiveness is UX adaptation, not fitting. Example: filters side by side on desktop become a dropdown or sheet on mobile and tablet.
- Validate twelve viewport classes (mobile, tablet, desktop and TV, each small, medium and large) in both light and dark themes.
- Frontend layouts are refined with the `impeccable` skill; the landing page also uses the Emil Kowalski skills and `taste-skill`. The maintainer repeats this reminder; never skip any of the three on LP work.
- The landing page is a fixed mix of light and dark sections, the hero is always dark, and it has no theme selector (decision of 2026-11-20). Validating "both themes" on the LP means every light and dark section, plus an unchanged render with the operating system in dark mode.
- The system and the landing page run on distinct local ports (3000 and 3100) and the system never serves the LP; mixing them confused manual testing.
- Icons: Bootstrap Icons by default; Lucide is allowed when Bootstrap has no fit, as a recorded exception.
- Illustrations: flat style, generated with Gemini through the Claude in Chrome extension, moved from Downloads into `design/`, vectorized to SVG with a transparent background, produced for both themes. Prompts never contain user or financial data.

## Copy and language

- Every word must be specific enough that the reader has no doubt about what it means or what will happen. Buttons name the action and the object; errors say what happened, why and what to do next.
- Follow the UX writing rules in `DESIGN-SYSTEM.md`, researched from established content-design sources.
- No filler, no superlatives, no invented numbers.

## Documentation philosophy

- Docs live in `docs/`, in English, with uppercase names: `ARCHITECTURE.md` (two layers: Web and Electron), `SECURITY.md`, `DATABASE.md`, `PRODUCT.md`, `DESIGN-SYSTEM.md`, `ROADMAP.md`, `BEST_PRACTICES.md`, `MEMORY-AI.md`, the index `README.md`, and ADRs in `decisions/`.
- Extend an existing document before creating a new one. Update the index when responsibilities change.
- Audits are welcome: when asked what is obsolete, compare every claim to the code and report by file and line, grouped by severity.

## Engineering and security posture

- `CLAUDE.md` is strict on purpose: test-first bug fixes, mandatory pre-commit security gate, no secrets anywhere, local-first financial data. Never relax these to go faster.
- Never commit, push or change remote resources without an explicit request, even when the rest of the task was authorized.
- When a document claims a security control that does not exist, the fix is to say so (mark it **Planned** or **Open**) and surface the risk, not to hide it.

## Tools and environment

- Agents work in a terminal on Linux; write shell examples in POSIX `sh`/`bash`, not PowerShell.
- Claude Code has the Claude in Chrome extension available for research, provider dashboards and image generation with Gemini, under the safety rules in `CLAUDE.md`.
- The project uses pnpm, Node 22+, Docker Compose, Wrangler and the GitHub CLI.
- Several agent sessions may work in the same repository at the same time. Before rewriting a file, check `git status` and modification times; when another session is editing the same files, coordinate with it and never overwrite its changes.

## Decision patterns

- When the agent lists decisions, the maintainer often answers by approving and expanding scope in the same message. Treat approval of the direction as approval of the reasonable defaults that follow from it, and state the defaults you chose.
- Ambiguous but low-risk choices: pick the conventional option and say so. Destructive, remote or security-relevant choices: ask first.
- Unrelated files changed by the maintainer during a task are theirs: keep them as they are and mention them only if they conflict.

## Security mindset

- The maintainer treats security as non-negotiable and wants it tested, not assumed: never trust the frontend or the user, validate everything in the backend before executing, keep access and refresh tokens, encrypt, make writes idempotent.
- Before every commit and push, switch roles and act as an ethical hacker hunting for attack surfaces in what is about to ship. A clean scan is not enough; think like an attacker.
- Free protections must be on: Cloudflare Turnstile and free WAF/firewall rules wherever they apply.
- Any credential exposed even for a minute (log, terminal, chat, screenshot) is rotated immediately. No "it was only briefly visible" exceptions.

## Current work

Keep this section short and current so a session started after `/clear` can resume. Remove items when they are done.

- **2026-11-20: "execute the whole roadmap"** (request after `/clear`: read the docs and roadmap, execute all of it, leave the system complete and working). Plan, run as five parallel agents in isolated worktrees whose diffs are merged into the main worktree without commits (no commit or push was requested):
  1. MVP gaps: automatic categorization by merchant rules with confidence, own-transfer detection by Pix keys, quick cash entries, local due-date and stale-data alerts, L-4, parse timeout and `Content-Length` check, Prisma error mapper (SECURITY Open 18), local CSP, Electron fuses, the pre-MVP update notice.
  2. Stage 7 PDF import and Stage 8 cards, statements and benefits.
  3. Stages 9, 12, 13, 14: budget, goals, debts and survival mode, net worth and ARCA.
  4. Stages 10, 11, 17, 18 (local encrypted backup only), 19: notifications, restore points, gamification, backup, export and deletion.
  5. Cloud: CORS, Turnstile (repository part), per-route rate limits, security events, BFF Open items, terms, privacy, account deletion, Stage 15 news, Stage 16 AI summaries with fallback, Stage 20 community routes, CI secret scanning, dependency review and CodeQL.
  6. Added mid-task by the maintainer: a login in the downloaded app as well ("imagine a hacker gets access to the computer or phone"), the database encrypted at rest ("criptografe tudo"), the database in Docker, MFA with an authenticator app, and account creation through Google. Decisions taken in the maintainer's absence (ADR 0009): a local vault whose password-derived key wraps a random database key, plus a recovery code; the whole SQLite file is encrypted; a local session with idle auto-lock; optional local TOTP; TOTP MFA on the cloud account; desktop "Entrar com Google" through the system browser (RFC 8252), which never unlocks local data because no key is held in the cloud. Docker keeps the encrypted database in its volume; the desktop installer does not require Docker. The maintainer then confirmed: Docker is for development only. The maintainer also added a macOS (MacBook) release next to Windows and Linux (agent 1: electron-builder mac target; agent 5: macOS downloads). The cloud TOTP work went to agent 5; the local vault went to agent 6. The maintainer also authorized using the web (Chrome) to fetch and configure what is needed.
  **Done:** merged into `main` as PR #10 on 2026-11-20 (unit, end-to-end, manual Chrome, CodeQL, gitleaks and CI green). **Pending on the maintainer:** enable the dependency graph (dependency review fails with 403; the agent's attempt to enable it was blocked by the permission classifier), Cloudflare Workers Builds fails on every non-main branch (preview build settings, needs a dashboard login), provider settings in ARCHITECTURE §3.8 (Turnstile, Worker secrets, remote D1 migrations 0003/0004, WAF, Workers AI, domain), signing keys and signed installers, legal review of terms, privacy and debt copy.
  The maintainer authorized, for this task: when finished, commit, push, open a pull request and merge it into `main` without asking again (branch → PR → merge; hooks, security gate and end-to-end tests still run first).
  Not executed without a decision or an external resource: deploys and dashboard settings, signing certificates and published installers, Stage 21 beyond the notice, Stages 22, 23, 25 (Open, need ADRs) and 24.

## Lessons learned log

Add newest entries at the top. Format: date, what happened, the lesson.

- **2026-11-20** Fixed the known defect "a bill entered both as an obligation and as a card statement is subtracted twice" (test-first, `tests/regression/bill-as-obligation-and-card-statement-subtracted-twice.test.mjs`). The fix links an obligation to a card (`creditCardId`) and lets that card's statement of the same month win, instead of guessing by description or amount; survival mode had also been computing its own committed total without card statements. Lessons: for financial de-duplication prefer an explicit link the person sets over a heuristic, and keep every reading of the same number on one shared loader (`loadCommittedObligations`). A worktree without its own `node_modules` resolves packages from the main checkout, so `prisma generate` there rewrites the main checkout's client: install dependencies in the worktree before generating.

- **2026-11-20** While reconciling the encrypted database with restore points, `VACUUM INTO` and `ATTACH … KEY` on a libSQL-encrypted database were found to write **plaintext** copies. Lesson: never assume a copy of an encrypted database stays encrypted; assert the file header and absence of marker strings in tests for every copy path.
- **2026-11-20** The whole roadmap was executed by six agents in isolated worktrees, merged with `git apply --3way` and reconciled by a seventh. Lessons: give each agent disjoint files and forbid shared docs they do not own; expect collisions in ADR numbers, doc counts and Open-item numbers; run `git add -A` before each `git apply --3way` (it needs index blobs) and keep `.claude/worktrees/` in `.gitignore`; an agent that cannot see the others' work cannot reconcile cross-cutting design (startup, backup, sign-in), so plan one integration pass.
- **2026-11-20** Mid-task the maintainer asked for a login in the installed app, encryption of everything, MFA with an authenticator app, account creation with Google, Docker only for development and a macOS release. Lesson: security requests for the desktop mean protecting data at rest against someone with the device, not only the network.
- **2026-11-20** Asked to "use all the skills and improve the LP", then to commit, push and merge without waiting. The biggest defects were not visual: the LP announced PDF import, survival mode and ARCA as ready, called finished stages "planned" and said the `LICENSE` was missing. Lesson: on any LP change, first check every claim against `ROADMAP.md` and the route map (now enforced by `tests/regression/lp-claims-match-roadmap.test.mjs`), then polish. The maintainer also asked mid-task to validate everything through the Chrome extension on localhost and to separate the LP and system ports: integrate such messages into the running task. The extension's window cannot be narrowed to phone widths, so phone and tablet classes are checked with Playwright and the limitation is reported.

- **2026-11-20** The maintainer made manual testing through the Claude in Chrome extension on localhost mandatory, in addition to the existing tests, "para testar de maneira manual o que um usuário faria". Lesson: after the automated suite, open the isolated server (`pnpm test:manual`, fresh database) and use the changed flows like a person, never against the real local database; report the flows tested.
- **2026-11-20** The first run of the new Playwright suite on the merged MVP found that every screen opened at `127.0.0.1` showed "Não foi possível consultar o banco local": a security fix compared the browser `Origin` with `request.url`, which `next dev` builds as `localhost`. The BFF had the same defect earlier. Lesson: compare `Origin` with the requested `Host`, never with `request.url`; and run `pnpm test:e2e` before merging security fixes, because unit tests that read source code did not catch it.
- **2026-11-20** For the Biome and Playwright work the maintainer asked to push a branch, open a pull request and merge it without waiting for review ("Pode fazer sem eu validar"). Lesson: when that is requested, use branch → PR → merge instead of pushing to `main` directly; the hooks, the gate and the end-to-end tests still run first.

- **2026-11-20** While Biome and Playwright were being added, the maintainer said "vai fazendo commit e push para a main enquanto vai executando". Lesson: on long tasks, commit and push each coherent, verified step to `main` as it is finished (gate, hooks and end-to-end tests first) instead of one large commit at the end.
- **2026-11-20** `core.bare=true` kept appearing in the shared `.git/config` and broke the main worktree. Cause: the hooks regression test ran `git init` while inheriting `GIT_DIR` from the pre-commit hook, which reinitialized the real repository as bare. Lesson: any test that runs git must strip `GIT_*` variables, because the suite also runs inside hooks; check `git config core.bare` after commits when worktrees are shared.

- **2026-11-20** The maintainer asked for an explicit rule about what must not be exposed in this file. Lesson: this file is public; the list now lives in `CLAUDE.md`, and details of the maintainer's machine and personal setup were removed from it.
- **2026-11-20** The maintainer asked whether the docs were "a Frankenstein" and then delegated every fix ("decide o que for mais sensato"). Decisions taken, so later sessions do not reopen them: (1) MVP import formats are CSV and OFX; PDF is Stage 7. (2) Commits go on a dedicated branch by default, documentation-only changes may go to `main`, and an explicit request to commit to `main` is followed (hooks and gate still apply). (3) Turnstile and WAF: implement what lives in the repository; settings in a provider dashboard are prepared and applied only after explicit authorization. (4) Infrastructure liveness probes (`/api/health/live`, Worker `/health`) are a documented exception to the action-code rule. (5) `AGENTS.md` is a pointer to `CLAUDE.md`, so the two cannot diverge. (6) The self-review score is anchored to named checklists, and every deduction names a failed item. (7) Each fact has one owner document (`docs/README.md`). Lesson: when delegated, choose the option that removes the contradiction at its source, and record each decision once.

- **2026-11-20** The maintainer said "faça commit e push de tudo para a main" twice during long tasks. Lesson: commit and push to `main` directly when asked (the default otherwise is the branch rule in `BEST_PRACTICES.md`), in coherent commits, always through the hooks and the security gate; leave out only work that is clearly someone else's unfinished change and say so.
- **2026-11-20** The maintainer gave an exclusive Chrome browser for Claude to use freely (Claude in Chrome). Lesson: use it for research, dashboards (Cloudflare, GitHub, Vercel) and image generation (Gemini), following the safety rules in `CLAUDE.md`.
- **2026-11-20** Security instructions arrived: test security and idempotency, never trust the client, act as an ethical hacker before every commit and push, enable Turnstile and free firewall rules, rotate any exposed credential immediately, research security practice. Lesson: security review is part of every delivery, not a separate project.
- **2026-11-20** The maintainer asked to document everything said, "even if it looks silly", so a session after `/clear` understands all context. Lesson: write instructions and context to this file as they arrive, and keep [Current work](#current-work) updated during long tasks.
- **2026-11-20** Merging the unmerged branch revealed that the versioned hooks were stored without the execute bit, so previous commits skipped typecheck and tests. Lesson: verify that safety nets actually run, not only that they exist.

- **2026-11-20** Docs consolidation: 27 Markdown files were merged into 8 English documents. Code comments and one regression test referenced the old file names, and a first search missed them because `grep --include='*.{a,b}'` does not expand braces. Lesson: after renaming documents, search the whole repository without include filters, and run the full test suite.
- **2026-11-20** The maintainer asked "what is obsolete?" and then, in the next message, asked to merge, translate and rename everything. Lesson: an audit is usually the first step of a rewrite; collect findings in a form that writers can reuse directly.
- **2026-11-20** Several "always" instructions arrived in a row (design principles, responsiveness, skills, copy, AI slop, self-review score, illustrations, familiar patterns). Lesson: codify each one in `CLAUDE.md` and `AGENTS.md` immediately, and keep the reasoning here.
- **2026-11-20** An editor migration lacked a feature the maintainer relied on. Lesson: when a tool lacks a feature the maintainer is used to, rebuild the familiar workflow instead of only explaining the gap.
