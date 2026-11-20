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

## Design and UX philosophy

- Follow the design principles in `DESIGN-SYSTEM.md` strictly and validate every change against them.
- Base interactions, navigation and layout on patterns from large, widely used products and on Apple HIG and Material Design. Examples the maintainer gave: swipe gestures behave like in social networks; tab bars like Home, Videos, Search.
- Responsiveness is UX adaptation, not fitting. Example: filters side by side on desktop become a dropdown or sheet on mobile and tablet.
- Validate twelve viewport classes (mobile, tablet, desktop and TV, each small, medium and large) in both light and dark themes.
- Frontend layouts are refined with the `impeccable` skill; the landing page also uses the Emil Kowalski skills and `taste-skill`.
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

- **2026-11-20: branch `feat/conclusao-mvp` integrated into `main`** (worktree `talentum-integrate`, branch `integrate/conclusao-mvp`). Done: conflict resolution, test-first fixes (scoped and atomic writes, bootstrap secret over trusted IPC, chart class collision, state illustrations, explicit pnpm build-script decisions, bounded overrides), dependency upgrades (Next.js critical RCE), CI hardening, and the fixes from the offensive review (installer excludes `.env`, packaged app ignores `TALENTUM_URL`, key file `0600`, control/bidi stripping, amount ceiling, action-code Origin and Content-Type, Trojan Source guard). Remaining findings are SECURITY.md Open items 18–23.
- **Another session (`talentum-58`)** works on branch `chore/biome-playwright` in the main worktree (Biome and Playwright). Its `package.json` and `pnpm-lock.yaml` will conflict with this integration; regenerate the lockfile with `pnpm install` instead of hand-merging.
- **Next: Cloudflare Turnstile and free WAF rules** (user request), then the Worker/BFF Open items in SECURITY.md (refresh CSRF, missing-Origin acceptance, logout with expired token, download grants, rate-limit coverage, security events). Production LP should be redeployed with Next.js >= 15.5.29.
- **Untracked change left alone:** `apps/web/package.json` adds `zod` in the main worktree; no file imports it and it is not ours.

## Lessons learned log

Add newest entries at the top. Format: date, what happened, the lesson.

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
