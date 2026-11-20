# ADR 0005 — Biome for linting and formatting, Playwright for end-to-end tests

- Status: accepted
- Date: 2026-11-20

## Context

`pnpm lint` only ran the TypeScript compiler, there was no formatter, and no test exercised the app in a browser. The roadmap requires linting (MVP 0) and end-to-end tests of the import flow (MVP 6). The design system requires every interface change to be checked at twelve viewport classes in two themes, which by hand is slow and error-prone. The maintainer asked to add Biome and Playwright.

## Options

### Linting and formatting

- **ESLint and Prettier.** The most common pair; it needs two tools, several plugins (TypeScript, React, hooks, accessibility, Next.js) and configuration kept in sync between them.
- **Biome.** One dependency, one configuration file, linting and formatting in a single fast binary. Its recommended rules already cover React hooks, accessibility and suspicious patterns. It has fewer framework-specific rules than the ESLint ecosystem (for example, no Next.js plugin).

### End-to-end tests

- **Playwright.** Runs Chromium, Firefox and WebKit, emulates viewports, touch and color scheme, supports Electron, and starts the app server itself.
- **Cypress.** A comparable browser runner, but it has no Electron support and weaker multi-viewport parallelism.

## Decision

Use **Biome** (`biome.json`) for linting now and for formatting after a one-time formatting commit, and **Playwright** (`playwright.config.ts`, `tests/e2e/`) for end-to-end tests. Both are pinned exact versions in `devDependencies`.

- Lint runs in the Git hooks. Third-party skills in `.claude/`, generated assets and stylesheets are excluded. Rules that do not fit a specific file are switched off for that file only, in `biome.json` overrides; a single exception in code uses a `biome-ignore` comment with its reason.
- The formatter is configured but not enforced: the existing code was never formatted consistently, and formatting it now would conflict with the `feat/conclusao-mvp` integration. The formatting commit follows that integration.
- End-to-end tests run against an isolated server (fresh SQLite database, port 3210, build directory `.next-e2e`) and are not in the Git hooks.

## Consequences

- `pnpm lint` now means the Biome linter; type checking stays in `pnpm typecheck`.
- Contributors download Chromium once with `pnpm test:e2e:install` (about 125 MB) before running end-to-end tests.
- Next.js rewrites `next-env.d.ts` for the e2e build directory; the Playwright global teardown restores it, and `tsconfig.json` already lists `.next-e2e/types`.
- Adding Next.js-specific lint rules would require ESLint alongside Biome; revisit only if a concrete defect slips through.
