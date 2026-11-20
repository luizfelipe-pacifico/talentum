# ADR 0003 — Local device cryptographic key

- Status: accepted, with a planned evolution to the operating-system vault
- Date: 2026-09-12

## Context

Feature 2 in [PRODUCT.md](../PRODUCT.md) stores the person's own Pix keys to recognize transfers between their own accounts. The onboarding specification in the same document is explicit about how this must be done:

> A plain hash is not enough for CPF, phone and e-mail, because the value space is predictable; use an HMAC with a device secret key for the equality index, and authenticated encryption for eventual recovery/display.

The requirement is well founded. A SHA-256 of a CPF can be reversed by brute force in seconds: there are only 10^11 combinations, and the table fits on an ordinary disk. The same holds for Brazilian mobile numbers. The system therefore needs a **secret** that is not in the database.

The question is where that secret lives.

## Options

### A. Derive it from a user password

Stronger against device theft, because the secret lives nowhere while the application is closed. But it requires the person to type the password on every start, and losing the password means losing the ability to recognize their own transfers. The MVP has no local password flow and no recovery flow, and inventing one here would create a requirement nobody asked for.

### B. Keep it in the operating-system vault

This is what the Electron layer of [ARCHITECTURE.md](../ARCHITECTURE.md) already prescribes for the refresh token. Technically correct and more resistant.

The problem is architectural: the vault is reachable from the Electron main process, while the key is needed by the **local backend**, the Next.js route handlers. Connecting the two requires a new IPC channel, which does not exist today and which the Electron layer requires to stay minimal and validated. The application also runs through Docker and `pnpm dev`, where there is no vault at all.

### C. Keep it in its own file next to the database

A 32-byte secret in a file separate from SQLite, with restricted permissions, and subkeys derived by HKDF for each purpose.

## Decision

Adopt option **C**, with option **B** recorded as the evolution.

`src/server/local-key.ts` keeps the master key in `talentum-local.key`, in the same directory as the database, including inside the Docker volume, which is what keeps both together across container recreation. The path is derived from `DATABASE_URL` with the same rule Prisma uses, and can be overridden with `TALENTUM_LOCAL_KEY_FILE`.

Two subkeys are derived from the master key with HKDF-SHA256, each with a distinct `info`:

| Purpose | Use |
| --- | --- |
| `pix-index` | HMAC-SHA256 of the normalized value, for comparison |
| `pix-value` | AES-256-GCM of the normalized value, for display on request |

Separating purposes matters: compromising the comparison index does not yield the encryption key, and neither of them is the master key.

## What this protects, and what it does not

**It protects** against theft of the database alone: a `.db` copied to another machine, a backup forgotten in a synchronized folder, a file attached to a bug report. Without the key file, the identifiers are unreadable and the index cannot be reversed.

**It does not protect** against compromise of the whole device. Whoever can read the database file can also read the key file. This is stated in the module header and must not be presented otherwise in the interface.

This framing is consistent with [SECURITY.md](../SECURITY.md), which handles "theft of the local database" with operating-system permissions and no data in logs, and does not promise resistance against an attacker with full access to the machine.

## Consequences

- Permission `0600` is applied where the filesystem supports it. On Windows the call is a no-op and the effective control is the ACL of the user's directory.
- `.gitignore` covers `*.key` in addition to `temp/`, so the key is ignored by two independent rules.
- The key is created on first need with the `wx` flag, so two concurrent processes cannot generate two keys with one overwriting the other.
- **Losing the key file makes the Pix identifiers unreadable.** They are not primary financial data (they can be registered again), but the loss is silent until someone tries to view a key. A warning in the backup interface belongs to Stage 18 of [ROADMAP.md](../ROADMAP.md).
- Moving to the operating-system vault later is possible without changing the stored format: only the source of the master key moves, while HKDF stays.

## Verification

`tests/pix.test.mjs` covers, with a key created in a temporary directory:

- distinct subkeys per purpose;
- a deterministic index for the same key written in different ways;
- an index different from a plain SHA-256 of the value, the point that motivated this ADR;
- no collision between types for the same digits;
- reversible encryption with a fresh nonce per operation;
- tampered content failing the authentication tag instead of returning garbage.
