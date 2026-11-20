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
- **Current:** `electron/main.cjs` starts the packaged backend only when `app.isPackaged` is true and `TALENTUM_URL` is unset. It picks a free loopback port, runs `prisma migrate deploy` against the database in `userData`, spawns `.next/standalone/server.js` with `ELECTRON_RUN_AS_NODE`, waits up to 60 seconds for `GET /api/health/live` and only then loads the window. It also generates a per-run `TALENTUM_LOCAL_BOOTSTRAP_SECRET` for the backend.
- **Open:** the packaged startup runs `prisma migrate deploy` directly and does not run `scripts/migration-preflight.mjs`, so the destructive-migration backup gate applies only to `pnpm dev` and `pnpm dev:all`.
- **Open:** the bootstrap secret is placed only in the spawned server's environment, while `electron/preload.cjs` reads it from the renderer's own `process.env`. Whether the renderer can present it to `POST /api/action-codes` in a packaged build has not been verified; see the Electron layer of [ARCHITECTURE.md](../ARCHITECTURE.md).
- **Planned:** code signing, checksums published with the release and the GitHub Releases pipeline. No installer has been built in CI or published.
