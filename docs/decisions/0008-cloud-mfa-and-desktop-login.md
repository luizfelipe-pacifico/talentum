# ADR 0008: Two-step verification and desktop sign-in in the cloud

Status: **Accepted** (2026-11-20). Implemented in the Worker and the BFF; the Electron side of desktop sign-in is Planned.

## Context

The maintainer asked for a second factor on the cloud login, preferably an authenticator app, and for Google sign-in in the desktop app, with first sign-in from the desktop creating the account and recording consent. The Worker is the only Google OAuth client today; its redirect URI is the LP callback (`<PUBLIC_WEB_URL>/api/auth/callback`). The desktop app is a public client: anything in the installer is public.

## Decision

1. **TOTP (RFC 6238)** as the second factor, optional per account: secret generated in the Worker, stored with AES-GCM under a new Worker secret `MFA_ENCRYPTION_KEY` (account ID as associated data), activation by a first valid code, ten single-use recovery codes stored as hashes and shown once, a single-use 5-minute "pending verification" challenge between the Google callback and the session, ±1 step window, replay refused through `last_used_step`, lockout doubling from 5 minutes to 1 hour.
2. **Desktop sign-in through the Worker, with a loopback redirect to the app (RFC 8252 §7.3)**: the app sends its own PKCE S256 challenge and a loopback redirect; the system browser starts at the BFF (`/api/auth/desktop?handoff=`) so the `state` is bound to that browser like the web login; Google still returns to the LP callback; the Worker then hands a 60-second single-use code to the app's loopback, redeemable only with the app's verifier. Desktop sessions are a separate kind (`DESKTOP`).

## Alternatives considered

- **Direct loopback to Google with a separate "Desktop app" OAuth client.** The app would exchange the Google code itself; Google treats the desktop client secret as non-confidential. Rejected: the app would hold Google tokens and ID tokens, the Worker would need a second trust path to accept them, and two OAuth clients would need registration and rotation.
- **Custom URL scheme (`talentum://`).** Rejected for now: any app can register the same scheme on Linux, and registration differs per OS (Windows, Linux, macOS).
- **WebAuthn/passkeys as the second factor.** Stronger against phishing, but needs per-domain registration while the production domain is undecided (ARCHITECTURE §3.4) and more browser UI. Kept as a future option.
- **SMS or e-mail codes.** Rejected: weaker, and would add a provider and more personal data.
- **Storing the TOTP secret hashed.** Impossible: the server must compute codes from the secret, so it is encrypted, not hashed.

## Consequences

- A new secret (`MFA_ENCRYPTION_KEY`) must exist before two-step verification works; rotating it forces re-enrollment (no re-encryption path yet).
- The desktop flow adds one `GET` that starts state (the handoff). Forcing it gives an attacker nothing: the result goes to the loopback registered by whoever started the request.
- The Google OAuth client configuration does not change.
- Consent is recorded the same way for web and desktop sign-ups.
- Tests: `tests/regression/worker-mfa-desktop.test.mjs` (RFC 6238 vectors, replay, lockout, pending-state expiry, PKCE mismatch, non-loopback redirects refused).
