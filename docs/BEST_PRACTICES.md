# Development Best Practices

This guide establishes the development baseline for Talentum. It must evolve with the product requirements, architecture, and technology stack.

## Project organization

Use the established root Next.js application with reusable capabilities in `packages/` and product documentation in `docs/`:

```text
talentum/
├── src/                     # Full-stack Next.js application
│   ├── app/                 # App Router pages, layouts, and route boundaries
│   ├── components/          # Components owned only by the web application
│   └── modules/             # Future business capabilities, grouped by domain
├── packages/
│   ├── config/              # Shared TypeScript configuration
│   ├── db/                  # Prisma schema, migrations, and database client
│   ├── env/                 # Server and browser environment validation
│   └── ui/                  # Shared UI primitives, styles, hooks, and utilities
├── docs/                         # Architecture, decisions, guides, and project policies
│   ├── CLAUDE.md                # Claude-specific working rules
│   ├── CODEX.md                 # Codex-specific working rules
│   └── HOW-IT-WORKS.md          # Architecture and runtime flow
├── .github/                      # CI workflows and GitHub templates, when added
├── README.md                    # Project overview and onboarding
├── package.json                 # Root scripts and workspace dependencies
├── pnpm-workspace.yaml          # Workspace packages and dependency catalog
├── turbo.json                   # Task graph and cache outputs
└── .gitignore                   # Files excluded from version control
```

Organization rules:

- Group web business code by domain or capability under `src/modules/` as the application grows.
- Do not recreate `apps/web`; the only deployable application is rooted at `/talentum`.
- Add a new directory under `packages/` only for code or configuration reused across workspace applications.
- Keep entry points thin and move business rules into independently testable modules.
- Put code in `shared/` only when it is genuinely reused; do not turn it into a catch-all.
- Keep unit tests close to their source when supported by the ecosystem. Use `tests/` for cross-module, integration, and end-to-end tests.
- Store architectural decision records under `docs/decisions/` with sequential names such as `0001-use-postgresql.md`.
- Never store secrets in `config/`, fixtures, examples, logs, or documentation.
- Do not create empty directories in advance. Add each directory when it has a real responsibility.
- Before creating a new file or directory, check whether an equivalent one already exists and reuse or extend it instead of duplicating structure.
- Keep only `README.md` at the repository root. Every other Markdown document belongs in `docs/`; do not create per-app READMEs or instruction files.
- Keep a single local `.env` and its secret-free `.env.example` at the repository root. Do not create environment files inside individual workspaces unless the architecture is deliberately changed and documented.
- Keep Next.js configuration files at the repository root beside the root application.

### Layer-based vs. feature-based organization

There are two common ways to group source code, and the right choice depends on project size:

- **Layer-based** (a.k.a. package-by-type): files are grouped by technical role (`controllers/`, `models/`, `services/`). Simple and fine for small projects, but related code for a single feature ends up scattered across many folders as the app grows.
- **Feature-based** (a.k.a. package-by-feature or domain-driven): files are grouped by business capability (e.g. `modules/billing/`, `modules/auth/`), with each feature folder holding its own logic, tests, and types. This keeps related code together, reduces merge conflicts between contributors, and scales better with team size.

Talentum's target application layout (`src/modules/`) is feature-based. Start each module with a flat, simple internal structure and only add sub-layers (for example, `modules/transactions/data/` or `modules/transactions/components/`) once a module is large enough to need them. Do not pre-create layered scaffolding for empty modules.

General naming and depth conventions:

- Use short, descriptive, unambiguous names (`email-templates`, not `templates`); avoid vague suffixes like `new`, `final`, or `v2`.
- Keep folder nesting shallow — three or four levels deep is a reasonable ceiling before it should be reconsidered.
- Use consistent casing per ecosystem convention (e.g. `kebab-case` for folders/files in JS/TS projects) and keep it uniform across the repository.
- Give every top-level folder a single, clear responsibility; do not mix source code, documentation, configuration, and generated assets in the same directory.

## Product and planning

- Record the problem, target audience, constraints, and expected outcome before implementation.
- Split large requirements into small, independently verifiable deliveries.
- Define objective acceptance criteria for every feature.
- Record important architectural decisions and their trade-offs.

## Repository and dependencies

- Keep `README.md` synchronized with setup, commands, configuration, and behavior.
- Declare and lock dependencies through the selected ecosystem's manifest and lockfile.
- Do not rely on globally installed packages or undocumented machine state.
- Keep deploy-specific configuration in environment variables and provide a secret-free `.env.example`.
- Do not version generated artifacts, caches, installed dependencies, or personal editor settings.

## Icons and assets

- Use [Bootstrap Icons](https://icons.getbootstrap.com/) for interface icons instead of mixing icon sets, hand-drawn SVGs, or assets copied from unrelated sites.
- Bootstrap Icons is distributed under the MIT License. Keep its source and license traceable when assets are copied into the repository.
- Only reach for a different icon source when Bootstrap Icons genuinely lacks the required symbol, and document the exception where it is used. The existing `lucide-react` dependency is legacy scaffolding and must not define new interface work.

## Branches and review

- Keep `main` stable and use short-lived branches for features and fixes.
- Make pull requests small and include context, scope, risks, and verification instructions.
- Require automated checks and review before merging application changes.
- Resolve review conversations and avoid unrelated refactors in the same change.
- Protect `main` against deletion, force pushes, and merges that bypass required checks.
- Documentation-only changes may go directly to `main`; all other changes must use a dedicated branch.

Suggested branch names:

```text
feat/short-name
fix/short-name
docs/short-name
refactor/short-name
```

## Commits

Keep commits small and self-contained. Use Conventional Commits:

```text
<type>(<optional-scope>): <description>
```

Common types include `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, and `ci`.

Example: `feat(auth): add password recovery`.

## Automated quality

- Use reproducible formatting and linting rules.
- Cover business rules with unit tests and critical flows with integration or end-to-end tests.
- Add a regression test for every fixed bug when practical.
- Run formatting, static analysis, tests, and builds in continuous integration.
- Do not use coverage percentage as the only quality measure; verify meaningful behavior and edge cases.

## Security

- Never commit passwords, tokens, keys, credentials, or connection strings.
- Validate all untrusted input on the server, preferably with allowlists.
- Use parameterized queries and context-appropriate output encoding.
- Enforce authentication and authorization on trusted systems and apply least privilege.
- Keep dependencies current and enable dependency alerts, code scanning, and secret scanning.
- Never write sensitive data to logs. Rotate any exposed secret immediately.

## Configuration and operations

- Keep code separate from deploy-specific configuration.
- Make development, staging, and production environments as similar as practical.
- Separate build, release, and run stages.
- Produce structured logs with diagnostic context but no confidential information.
- Design services for fast startup and graceful shutdown.

## Releases

When the project has a public API, use Semantic Versioning in the `MAJOR.MINOR.PATCH` format:

- `MAJOR` for incompatible changes.
- `MINOR` for backward-compatible features.
- `PATCH` for backward-compatible fixes.

Never modify an already published version. Record meaningful changes in a changelog and tag releases in Git.

## Definition of done

- [ ] Acceptance criteria are satisfied.
- [ ] The implementation is simple and readable.
- [ ] Appropriate tests exist and all checks pass.
- [ ] No secrets or known vulnerabilities were introduced.
- [ ] Relevant documentation was updated.
- [ ] The change was reviewed and can be safely released or reverted.

## References

- [GitHub Docs: Best practices for repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [GitHub Docs: Managing and standardizing pull requests](https://docs.github.com/en/pull-requests/reference/managing-and-standardizing-pull-requests)
- [GitHub Docs: Continuous integration](https://docs.github.com/en/actions/get-started/continuous-integration)
- [The Twelve-Factor App](https://12factor.net/)
- [Folder Structure Best Practices: The Complete Guide](https://www.suitefiles.com/guide/the-guide-to-folder-structures-best-practices-for-professional-service-firms-and-more/)
- [Organizing Project Folder Structure: Function-Based vs Feature-Based](https://medium.com/@ikonija.bogojevic/organizing-project-folder-structure-function-based-vs-feature-based-168596b6d169)
- [Standard Go Project Layout](https://github.com/golang-standards/project-layout)
- [Bootstrap Icons](https://icons.getbootstrap.com/)
- [OWASP Secure Coding Practices Checklist](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Semantic Versioning 2.0.0](https://semver.org/)
