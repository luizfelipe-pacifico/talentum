# ADR 0007 — Local restore points and passphrase-encrypted backup, without cloud storage or key recovery

- Status: accepted
- Date: 2026-11-20

## Context

Roadmap stages 11 (history and restoration) and 18 (E2EE backup) need a way to copy the local SQLite database, verify the copy and put it back. [SECURITY.md](../SECURITY.md#end-to-end-encrypted-backup) required authenticated encryption, a versioned header and validation before replacing the active database, and left two questions open: where an encrypted backup is stored, and how a lost key is recovered (Open item 12). [DATABASE.md](../DATABASE.md) also required an automatic backup before a destructive migration, and nothing created one (SECURITY Open item 17).

Two facts shape the design:

1. The running app keeps the SQLite file open through Prisma. On Windows an open file cannot be replaced, and on every platform replacing it under a live connection risks a torn database.
2. Own Pix identifiers are protected by a device key that lives next to the database ([ADR 0003](0003-local-device-key.md)). A copy of the database without that key restores unreadable Pix values.

## Options

### Storage of the encrypted backup

- **A cloud provider (R2, Drive, S3).** Off-device copies, but needs an account, a provider ADR, D1 metadata and a reviewed upload path. Stage 18 says a provider needs its own ADR.
- **Local file only.** The app writes the encrypted file as a download; the person decides where to keep it (USB drive, their own cloud folder). No new remote surface.

### Key source

- **Device key or OS vault.** Opens without a password, but a backup that leaves with the device key next to it protects nothing.
- **Key derived from a passphrase.** The file is useful only with the passphrase; nothing secret is stored by Talentum.

### Key recovery

- **Escrow or recovery codes.** Needs somewhere to keep them, which brings back the storage question, or a second secret the person must also keep.
- **None.** Losing the passphrase loses the backup.

### Applying a restore

- **Swap the file in the running process** (disconnect Prisma, rename, reconnect). Races with in-flight requests and fails on Windows.
- **Schedule the swap for the next start.** The startup script applies it before migrations, while nothing has the file open.

## Decision

1. **Restore points** are verified local copies: `VACUUM INTO` writes a consistent copy of the live database to `talentum-backups/<id>.sqlite` next to the database file, with a copy of the device key (`<id>.key`) and a manifest (`<id>.json`: kind, instant, schema version, SHA-256 of copy and key). The manifest on disk is the source of truth for the list, because restoring an older copy would otherwise erase from the screen the point that undoes the restore. `DatabaseBackup` rows are the in-database index. Paths are derived on the server from `DATABASE_URL`; only UUIDs are variable. At most 20 points are kept; the oldest automatic ones go first and manual ones are never removed automatically.
2. **Automatic points** are created before a pending migration (`pre_migration`, at vault setup and every unlock in `pnpm dev`, Docker and the packaged app; see the amendment below), before a restore (`pre_restore`) and before deleting all local data (`pre_deletion`). The automatic `pre_migration` point satisfies the destructive-migration gate.
3. **Restoring** verifies SHA-256, SQLite `quick_check` and that every migration applied in the copy is known to the running app, creates a `pre_restore` point and **schedules** the swap (`pending-restore.*`, manifest written last). On the next unlock the open path verifies the staged copy again, creates another `pre_restore` point of the database as it is at that moment, removes stale `-journal`/`-wal`/`-shm` files and swaps with `rename`. A staged restore that fails verification is discarded and the current database stays in use. Restoring therefore **requires locking and unlocking, or restarting, the app**.
4. **Encrypted backup** is local only and is a download. Format version 2 (version 1 is refused; see the amendment): magic `TALENTUM-BACKUP\n`, header length, JSON header `{v, alg: "AES-256-GCM", kdf: "scrypt", N, r, p, salt, nonce, createdAt}`, ciphertext and the 16-byte GCM tag. The whole header is additional authenticated data. The plaintext holds an inner manifest (schema version, sizes, SHA-256 of the database), the database bytes (a libSQL-encrypted copy), the 32-byte key of that copy and the device key. Key derivation: scrypt with N = 2^17, r = 8, p = 1 and a random 16-byte salt (the OWASP minimum for scrypt); the passphrase is NFC-normalized and must have 12 to 1024 characters. Readers accept N only between 2^14 and 2^20 so a forged file cannot request unbounded memory. The nonce is 96 random bits and the key is new per file.
5. **No key recovery.** Losing the passphrase loses the backup. The interface says so before the file is generated and asks the person to confirm they understood.
6. **No cloud storage** in this decision. A provider remains Open and needs its own ADR.

## Consequences

- Restore points and encrypted backups work offline, in development, Docker and the packaged app, with no new remote surface.
- Restore points are as safe as the database itself: they sit next to it, with the device key, under the same OS permissions. They protect against mistakes and failed migrations, not against device theft. Only the encrypted backup protects a copy that leaves the device.
- A restore is not instant: the person must lock and unlock, or close and reopen, Talentum, and the screen says so.
- Restore points use disk space, bounded by the 20-point retention.
- This is not "zero knowledge" and must not be advertised that way; no audit has been made.
- **Encrypted database at rest (seam for a parallel change).** All reads of database *content* go through `DatabaseFileAdapter` (`snapshot`, `inspect`) in `src/server/backup/restore-core.ts`; the rest copies, renames and checks SHA-256 of file **bytes**, which works for an encrypted file too. The startup script detects a file that is not plaintext SQLite (no `SQLite format 3` header) and treats it as opaque bytes: it applies a staged restore by checksum and manifest schema version, takes a byte copy as the `pre_restore` point, skips the `pre_migration` point (it cannot read applied migrations without the key) and still refuses any destructive migration without `TALENTUM_VERIFIED_BACKUP_ID`. When the database becomes encrypted, the app adapter must open copies with the unlocked key, and the startup gate must move to a place where the key is available.
- **Platforms.** Paths come from `DATABASE_URL` (Electron `userData` in the packaged app on Windows, Linux and macOS) through `node:path`; no platform-specific path is assumed. Docker is a development convenience only.

## Amendment: encrypted database (ADR 0009)

Status: **Current**. The local database became encrypted at rest with libSQL ([ADR 0009](0009-local-vault-and-encrypted-database.md)), and the seam above was used as planned:

- **The startup script is gone.** `scripts/migration-preflight.mjs` could not read an encrypted file. Its three responsibilities moved to the database open path, `src/server/backup/startup.ts`, called by `openDatabase` at vault setup and every unlock, while the key is in memory and no connection is open: apply the scheduled restore (now verified by opening the copy with the key: SHA-256, `quick_check`, known schema), create the `pre_migration` point and its `DatabaseBackup` row, then run the migration runner, which honours the destructive gate.
- **Copies stay encrypted.** libSQL's `VACUUM INTO` writes a **plaintext** copy of an encrypted database, and `ATTACH … KEY` also creates a plaintext file (checked with `@libsql/client` 0.8.1). `src/server/backup/libsql-file.ts` therefore copies schema and rows inside a read transaction into a file opened with the database key. Restore points, the staged restore and the pre-restore point are encrypted with the database key and open only with this vault; a plaintext or wrongly keyed copy fails inspection and is never applied. Plaintext points and staged restores left by earlier builds are converted at vault setup and the plaintext files overwritten before removal.
- **Encrypted backup format 2.** The database inside the backup is a libSQL-encrypted copy under a random key made for that file, and the file carries that key next to the device key, all inside the passphrase-encrypted payload. The vault key never leaves the device, and a restore does not depend on the vault password in use when the backup was made: the app opens the copy with the file key and rewrites it under the current database key before staging. Format 1 carried a plaintext database and existed only in pre-vault development builds; it is refused with `UNSUPPORTED_VERSION`.
- **When the swap happens.** At the next unlock: after a manual lock, after auto-lock or after restarting.

## References

- OWASP Password Storage Cheat Sheet (scrypt parameters).
- NIST SP 800-38D (GCM, nonce uniqueness).
- SQLite `VACUUM INTO` and `PRAGMA quick_check` documentation.
