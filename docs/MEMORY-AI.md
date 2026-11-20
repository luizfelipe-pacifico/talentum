# AI Working Memory

This document teaches AI agents (Claude Code, Codex and others) how the maintainer thinks, decides and expects work to be done on Talentum. Read it at the start of every session together with `CLAUDE.md`. It complements the rules there: `CLAUDE.md` says **what is mandatory**; this file explains **why**, shows the maintainer's way of thinking, and records lessons learned so each session works better than the last.

It contains working style and preferences only. Never add personal data, credentials, account identifiers, financial values or anything covered by the prohibited list in `CLAUDE.md`.

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
- [Lessons learned log](#lessons-learned-log)

## How to use this file

- Read it before planning. Apply it when a request is short or ambiguous: the maintainer often writes briefly and expects the agent to fill the gaps the way described here.
- Update it in the same turn whenever the maintainer states a preference, corrects you, approves an approach without hesitation, or reveals a way of thinking that is not yet recorded. Add a dated entry to the [lessons learned log](#lessons-learned-log) and, if the lesson is general, fold it into the relevant section.
- Standing instructions ("sempre…", "always…") go to `CLAUDE.md` and `AGENTS.md` as mandatory rules; this file records the reasoning behind them.
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

- Development machine: Arch Linux, editor Zed (configuration synced through a private GitHub repository with a systemd timer), previously VS Code with GitHub Settings Sync. Claude Code is used in the terminal with the Claude in Chrome extension; Gemini is used in the browser for image generation.
- GitHub CLI (`gh`) is authenticated; the project uses pnpm, Node 22+, Docker Compose and Wrangler.

## Decision patterns

- When the agent lists decisions, the maintainer often answers by approving and expanding scope in the same message. Treat approval of the direction as approval of the reasonable defaults that follow from it, and state the defaults you chose.
- Ambiguous but low-risk choices: pick the conventional option and say so. Destructive, remote or security-relevant choices: ask first.
- Unrelated files changed by the maintainer during a task are theirs: keep them as they are and mention them only if they conflict.

## Lessons learned log

Add newest entries at the top. Format: date, what happened, the lesson.

- **2026-11-20** Docs consolidation: 27 Markdown files were merged into 8 English documents. Code comments and one regression test referenced the old file names, and a first search missed them because `grep --include='*.{a,b}'` does not expand braces. Lesson: after renaming documents, search the whole repository without include filters, and run the full test suite.
- **2026-11-20** The maintainer asked "what is obsolete?" and then, in the next message, asked to merge, translate and rename everything. Lesson: an audit is usually the first step of a rewrite; collect findings in a form that writers can reuse directly.
- **2026-11-20** Several "always" instructions arrived in a row (design principles, responsiveness, skills, copy, AI slop, self-review score, illustrations, familiar patterns). Lesson: codify each one in `CLAUDE.md` and `AGENTS.md` immediately, and keep the reasoning here.
- **2026-11-20** Zed setup: VS Code extensions synced through GitHub were mapped to Zed equivalents with `auto_install_extensions`, and a GitHub-backed sync was built because Zed has no native settings sync. Lesson: when a tool lacks a feature the maintainer is used to, rebuild the familiar workflow instead of only explaining the gap.
