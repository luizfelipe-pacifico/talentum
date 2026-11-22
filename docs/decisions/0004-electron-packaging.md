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

## Amendment (2026-11-21): packages built on their own system, Linux desktop entry and installer screens

Recorded when the maintainer asked for the Windows and macOS installers.

- **Decision: build in CI on each system, not cross-compile.** Only macOS can produce a DMG, and a package built elsewhere would carry the wrong libSQL and Prisma native binaries. `.github/workflows/desktop.yml` builds Windows x64, macOS arm64, macOS x64 and Linux x64 on their own GitHub runners, runs `pnpm desktop:smoke` against each package and keeps the files as workflow artifacts. It never publishes and reads no secret. Alternatives rejected: Wine and cross-builds on Linux (native modules and `hdiutil` cannot be reproduced), and a universal macOS binary (see the earlier amendment).
- **Unsigned macOS test builds are signed ad hoc** (`mac.identity=-`), because Apple silicon refuses to run unsigned code; the hardened runtime and notarization are turned off for them and stay on in `build.mac` for the Developer ID build.
- **Linux gets a `deb` next to the AppImage**, so installing creates a menu entry and the taskbar shows the Talentum icon. `desktopName` (`talentum.desktop`) with `linux.syncDesktopName` and `linux.executableName: talentum` makes Electron's WM_CLASS and app_id match the entry's `StartupWMClass`. An AppImage shows the icon only after desktop integration (for example AppImageLauncher) or on X11 through the window icon.
- **Window frame per system** (`electron/window-chrome.cjs`): native traffic lights on macOS, native caption buttons with the title bar overlay on Windows, drawn buttons following the desktop's layout on Linux (DESIGN-SYSTEM, Window controls). The window icon is `.ico` only on Windows; Electron cannot read `.ico` elsewhere.
- **Installer screens** with the brand (`packaging/instalador/`, DESIGN-SYSTEM, Installer screens); the NSIS installer runs in Brazilian Portuguese.
- **Found by the first run (2026-11-21):** the Windows package lost the pnpm symbolic links of the standalone `node_modules` (`Cannot find package '@libsql/core'`), and the macOS packages lacked the libSQL native package, whose name libsql builds at run time; Linux only had it because the libsql source names `linux-x64-gnu` literally. The workflow now sets `pnpm_config_node_linker=hoisted` for the whole job (a flat `node_modules`, as electron-builder recommends for pnpm; replacing the links with copies was tried and broke pnpm's resolution), and `scripts/desktop-prepare.mjs` copies `@libsql/<target>`. On the Ubuntu 24.04 runner the bare package aborted with the setuid sandbox message, so the Linux job installs the `deb`, whose post-install script sets up `chrome-sandbox` and the AppArmor profile, and tests the installed app; the bare AppImage stays subject to that restriction (Open, BEST_PRACTICES, Desktop packages).
- **Open:** Windows and macOS are validated by the first green run of the workflow.

## Amendment (2026-11-21): what people install is tested, Linux package per distribution, signing gate and licences

Recorded when the maintainer asked to fix what kept the installers from a 10, and to check the legal and platform questions of every change.

- **Installed apps are tested:** silent NSIS install, the app copied from the DMG to `/Applications`, the `deb` installed with `apt`, and the extracted AppImage, each smoke-tested; the NSIS wizard and the DMG window are photographed on every run.
- **Decision: Linux publishes the `deb` and the AppImage**, distinguished by `package_format` (D1 `0005`, generated from the file extension so it cannot diverge from the file). Alternatives rejected: shipping only the AppImage (does not start on Ubuntu 24.04+ without disabling the sandbox) and only the `deb` (excludes non-Debian distributions).
- **Signing gate:** `scripts/desktop-build.mjs` signs only when the repository secrets exist and the workflow passes them only to `main` and manual runs, never to pull requests; a signed build whose signature does not verify fails.
- **Licences:** every package carries `resources/licencas/THIRD_PARTY_NOTICES.txt` and `LICENSE.txt`.
- **Windows caption overlay** follows the surface under it (top bar or page background).
