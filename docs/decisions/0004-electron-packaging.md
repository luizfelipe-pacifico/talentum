# ADR 0004 — Desktop packaging with electron-builder

- Status: accepted
- Date: 2026-09-12

## Context

The MVP must produce an NSIS installer for Windows and an AppImage for Linux. The package must include the standalone Next.js server, Prisma, the migrations and the Electron shell, without depending on Node or pnpm being installed on the person's machine.

## Decision

Use `electron-builder`. `scripts/desktop-prepare.mjs` generates the standalone output and copies the static assets the Next.js server requires. In the package, the main process applies the versioned migrations to the SQLite database inside `app.getPath('userData')`, starts the server with the Node runtime embedded in Electron and opens the window only after the health check answers.

A locally generated artifact is **unsigned** and serves only for testing. A public release requires code signing configured in the protected environment of the pipeline, a SHA-256 checksum and publication of the matching metadata.

## Alternatives

- Electron Forge: suitable, but it would add another configuration layer with no advantage for the two current targets.
- A hand-made installer: rejected because it increases the risk of incorrect updates, uninstallation and signing.
- Requiring Docker or Node on the end user's computer: rejected; it would stop being an installable desktop application.

## Consequences

- Windows and Linux builds run on the target operating system.
- Certificates and passwords never enter the repository.
- The absence of a signature stays visible and prevents a test artifact from being classified as a release.
- `release/` stays ignored by Git.

## Implementation notes (verified 2026-11-20)

These notes were added when the ADR was translated; they describe the merged code, not the original decision.

- **Current:** the `build` section of the root `package.json` configures `electron-builder` (`appId`, NSIS for Windows, AppImage for Linux, output in `release/`, `asar: false`). `pnpm desktop:build:win` and `pnpm desktop:build:linux` run `pnpm desktop:prepare` first.
- **Current:** `electron/main.cjs` starts the packaged backend only when `app.isPackaged` is true and `TALENTUM_URL` is unset. It picks a free loopback port, points the backend at the encrypted database in `userData` and at the packaged migrations (`TALENTUM_MIGRATIONS_DIR`; the backend applies them at unlock, [ADR 0009](0009-local-vault-and-encrypted-database.md)), spawns `resources/standalone/server.js` with `ELECTRON_RUN_AS_NODE`, waits up to 60 seconds for `GET /api/health/live` and only then loads the window. It also generates a per-run `TALENTUM_LOCAL_BOOTSTRAP_SECRET` for the backend.
- **Superseded by [ADR 0009](0009-local-vault-and-encrypted-database.md) (2026-11-20):** the packaged startup no longer runs `prisma migrate deploy`; the migration runner, with the destructive-migration gate, runs inside the backend at unlock. **Linux validated (2026-11-20):** the AppImage passed the packaged smoke test (libSQL native binary, encrypted database, vault setup and unlock, onboarding, PDF import in the isolated thread). **Open:** the same test on Windows and macOS.
- **Amendment (2026-11-20), standalone layout.** The first real package never opened: `electron-builder` drops every `node_modules` folder matched by `files` or by a nested `extraResources` filter, so `.next/standalone/node_modules` (the generated Prisma client and the traced dependencies) was missing and every database route answered 500. The standalone output now ships through `extraResources` to `resources/standalone`, with a second entry whose root is `.next/standalone/node_modules` (the only form that copies it). `scripts/desktop-prepare.mjs` also copies `.next/server/chunks` (the PDF thread chunk, loaded by `new Worker(new URL(...))`, is not traced) and the real `pdfjs-dist` folder (external to the bundle and imported only by that thread). `next.config.ts` excludes `.claude`, `release`, `temp`, `design` and test output from file tracing, after agent worktrees were found traced into the package. Tests: `tests/regression/packaged-app-cannot-open-database.test.mjs`, `tests/regression/pdf-worker-missing-from-standalone.test.mjs`; with a package in `release/linux-unpacked` they inspect the package itself.
- **Resolved (2026-11-20):** the renderer obtains the bootstrap secret over the trusted IPC `app:bootstrap-secret` and presents it to `POST /api/action-codes`; verified in the Linux AppImage.
- **Planned:** code signing, checksums published with the release and the GitHub Releases pipeline. No installer has been built in CI or published.

## Amendment (2026-11-20): macOS target, fuses and update assets

Recorded when the maintainer added a macOS (MacBook) release to the scope. It extends the decision; the reasoning above still holds.

- **Current (configuration):** `build.mac` targets DMG and ZIP, artifact `Talentum-${version}-macOS-${arch}.${ext}`, category `public.app-category.finance`, icon `icon-badge-mac.png` (1024 px, generated by `scripts/gerar-marca.mjs` from the brand source; `electron-builder` converts it to `.icns`), hardened runtime with `packaging/entitlements.mac.plist` (only `com.apple.security.cs.allow-jit`) and `notarize: true`, which reads Apple credentials only from environment variables. `pnpm desktop:build:mac` builds the Mac's own architecture.
- **Decision: one build per architecture, not a universal binary.** A universal app would have to merge the native Prisma engines of both architectures; building `arm64` on Apple silicon and `x64` on Intel keeps each package with the engine it needs and smaller downloads. The update notice picks the `.dmg` of the running architecture.
- **Current (configuration):** `build.electronFuses` disables `NODE_OPTIONS`, `--inspect` arguments and extra `file://` privileges and enables cookie encryption. `runAsNode` stays on because the packaged backend and `prisma migrate deploy` are started with `ELECTRON_RUN_AS_NODE` (see [SECURITY.md](../SECURITY.md), Open item 20).
- **Current:** `icon-badge.png` (512 px), referenced by the Linux target, is now generated by the same script; before this it was referenced but not versioned.
- **Planned:** signing with an Apple Developer ID and notarization (requires a Mac and the account), Windows Authenticode signing, and the release key that the in-app updater requires.
- **Consequence:** macOS builds cannot be produced or verified on the Linux and Windows machines used so far; no macOS package has been built yet.
