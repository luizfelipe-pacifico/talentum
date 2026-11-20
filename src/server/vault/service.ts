/* Casos de uso do cofre local: configurar, desbloquear, recuperar, trocar senha,
   código de recuperação, autenticador e bloqueio automático.

   Toda operação que lê e regrava o arquivo do cofre passa por uma fila única
   (`serialized`): duas tentativas simultâneas não podem perder uma contagem de
   erro nem gravar dois cofres. Erros saem com código estável; a mensagem
   pública é decidida na rota. */

import { randomBytes } from 'node:crypto';
import { assessPassword, normalizePassword, type PasswordProblem } from '../../lib/password-policy.ts';
import {
  canonicalBackupCode,
  canonicalRecoveryCode,
  DEFAULT_KDF,
  DEK_BYTES,
  deriveKek,
  generateBackupCode,
  generateRecoveryCode,
  hmacHex,
  open,
  seal,
  subkey,
} from './crypto.ts';
import { legacyPlaintextSource, openDatabase, prepareEncryptedDatabase } from './database.ts';
import {
  currentDek,
  isUnlocked,
  lock,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  setAutoLockMinutes,
  unlockWith,
} from './session.ts';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.ts';
import { DEFAULT_AUTO_LOCK_MINUTES, readVault, type VaultFile, writeVault } from './vault-file.ts';

export type VaultErrorCode =
  | 'VAULT_NOT_SET_UP'
  | 'VAULT_ALREADY_SET_UP'
  | 'VAULT_LOCKED'
  | 'INVALID_CREDENTIALS'
  | 'UNLOCK_THROTTLED'
  | 'WEAK_PASSWORD'
  | 'TOTP_NOT_PENDING'
  | 'TOTP_ALREADY_ENABLED'
  | 'TOTP_NOT_ENABLED'
  | 'INVALID_TOTP';

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly retryAfterSeconds?: number;
  readonly passwordProblem?: PasswordProblem;

  constructor(code: VaultErrorCode, extra: { retryAfterSeconds?: number; passwordProblem?: PasswordProblem } = {}) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.passwordProblem = extra.passwordProblem;
  }
}

const AAD_PASSWORD = 'talentum-vault-v1:dek:password';
const AAD_RECOVERY = 'talentum-vault-v1:dek:recovery';
const AAD_TOTP = 'talentum-vault-v1:totp-secret';
const BACKUP_CODE_COUNT = 10;
const PENDING_TOTP_TTL_MS = 10 * 60_000;

/* Atraso progressivo: cinco tentativas livres, depois 30 s dobrando até 1 hora. */
export const FREE_ATTEMPTS = 5;
export function throttleDelayMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(30_000 * 2 ** (failures - FREE_ATTEMPTS), 60 * 60_000);
}

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

type PendingTotp = { secret: Buffer; createdAt: number };
const pendingStore = globalThis as typeof globalThis & { talentumPendingTotp?: { value: PendingTotp | null } };
pendingStore.talentumPendingTotp ??= { value: null };
const pending = pendingStore.talentumPendingTotp;

function requirePolicy(password: string) {
  const assessment = assessPassword(password);
  if (!assessment.acceptable) throw new VaultError('WEAK_PASSWORD', { passwordProblem: assessment.problems[0] ?? 'TOO_SHORT' });
}

async function wrapForSecret(dek: Buffer, secret: string, aad: string) {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, DEFAULT_KDF);
  try {
    return { salt: salt.toString('base64'), wrapped: seal(dek, kek, aad) };
  } finally {
    kek.fill(0);
  }
}

async function unwrapWith(vault: VaultFile, which: 'password' | 'recovery', secret: string): Promise<Buffer | null> {
  const entry = which === 'password' ? vault.password : vault.recovery;
  const kek = await deriveKek(secret, Buffer.from(entry.salt, 'base64'), vault.kdf);
  try {
    const dek = open(entry.wrapped, kek, which === 'password' ? AAD_PASSWORD : AAD_RECOVERY);
    return dek && dek.length === DEK_BYTES ? dek : null;
  } finally {
    kek.fill(0);
  }
}

async function loadVault(): Promise<VaultFile> {
  const vault = await readVault();
  if (!vault) throw new VaultError('VAULT_NOT_SET_UP');
  return vault;
}

function requireDek(): Buffer {
  const dek = currentDek();
  if (!dek) throw new VaultError('VAULT_LOCKED');
  return dek;
}

/* Segundo fator: código de 6 dígitos do autenticador ou um código reserva. */
function checkSecondFactor(vault: VaultFile, dek: Buffer, code: string | undefined, now: number): VaultFile['mfa']['totp'] | false {
  const totp = vault.mfa.totp;
  if (!totp) return null;
  if (!code) return false;
  const secret = open(totp.secret, subkey(dek, 'totp-secret'), AAD_TOTP);
  if (!secret) return false;
  const step = verifyTotp(secret, code, now, totp.lastUsedStep);
  secret.fill(0);
  if (step !== null) return { ...totp, lastUsedStep: step };
  const backup = canonicalBackupCode(code);
  if (!backup) return false;
  const hash = hmacHex(subkey(dek, 'mfa-backup'), backup);
  if (!totp.backupCodes.includes(hash)) return false;
  // Código reserva vale uma vez.
  return { ...totp, backupCodes: totp.backupCodes.filter((stored) => stored !== hash) };
}

function retryAfter(vault: VaultFile, now: number): number {
  return Math.max(0, Math.ceil((vault.throttle.nextAttemptAt - now) / 1000));
}

async function recordFailure(vault: VaultFile, now: number): Promise<never> {
  const failures = vault.throttle.failures + 1;
  const next = { ...vault, throttle: { failures, nextAttemptAt: now + throttleDelayMs(failures) } };
  await writeVault(next);
  const wait = retryAfter(next, now);
  throw new VaultError('INVALID_CREDENTIALS', wait > 0 ? { retryAfterSeconds: wait } : {});
}

export type VaultStatus = {
  state: 'uninitialized' | 'locked' | 'unlocked';
  totpEnabled: boolean;
  retryAfterSeconds: number;
  /** Só no primeiro uso: existe um banco antigo em claro que será cifrado. */
  hasExistingData: boolean;
};

export async function vaultStatus(hasSession: boolean, now = Date.now()): Promise<VaultStatus> {
  const vault = await readVault();
  if (!vault) return { state: 'uninitialized', totpEnabled: false, retryAfterSeconds: 0, hasExistingData: (await legacyPlaintextSource()) !== null };
  return {
    state: hasSession && isUnlocked() ? 'unlocked' : 'locked',
    totpEnabled: vault.mfa.totp !== null,
    retryAfterSeconds: retryAfter(vault, now),
    hasExistingData: false,
  };
}

export type SecuritySettings = {
  autoLockMinutes: number;
  recoveryConfirmed: boolean;
  totpEnabled: boolean;
  backupCodesRemaining: number;
};

export async function securitySettings(): Promise<SecuritySettings> {
  requireDek().fill(0);
  const vault = await loadVault();
  return {
    autoLockMinutes: vault.settings.autoLockMinutes,
    recoveryConfirmed: vault.recovery.confirmed,
    totpEnabled: vault.mfa.totp !== null,
    backupCodesRemaining: vault.mfa.totp?.backupCodes.length ?? 0,
  };
}

/** Primeiro uso: cria a DEK, o cofre e o banco cifrado (trazendo o banco antigo, se houver). */
export function setupVault(password: string): Promise<{ sessionToken: string; recoveryCode: string; migratedExistingData: boolean }> {
  return serialized(async () => {
    if (await readVault()) throw new VaultError('VAULT_ALREADY_SET_UP');
    requirePolicy(password);
    const dek = randomBytes(DEK_BYTES);
    try {
      const recoveryCode = generateRecoveryCode();
      const passwordEntry = await wrapForSecret(dek, normalizePassword(password), AAD_PASSWORD);
      const recoveryEntry = await wrapForSecret(dek, canonicalRecoveryCode(recoveryCode) as string, AAD_RECOVERY);
      const prepared = await prepareEncryptedDatabase(dek);
      const vault: VaultFile = {
        format: 'talentum-vault',
        version: 1,
        createdAt: new Date().toISOString(),
        kdf: DEFAULT_KDF,
        password: passwordEntry,
        recovery: { ...recoveryEntry, confirmed: false },
        mfa: { totp: null },
        settings: { autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES },
        throttle: { failures: 0, nextAttemptAt: 0 },
      };
      await writeVault(vault);
      await prepared.finish();
      await openDatabase(dek);
      const sessionToken = unlockWith(dek, vault.settings.autoLockMinutes);
      return { sessionToken, recoveryCode, migratedExistingData: prepared.migrated };
    } finally {
      dek.fill(0);
    }
  });
}

/** Mesmo erro para senha e código errados: a resposta não diz qual fator falhou. */
export function unlockVault(password: string, code: string | undefined, now = Date.now()): Promise<{ sessionToken: string; recoveryCode: string | null }> {
  return serialized(async () => {
    const vault = await loadVault();
    const wait = retryAfter(vault, now);
    if (wait > 0) throw new VaultError('UNLOCK_THROTTLED', { retryAfterSeconds: wait });
    const dek = await unwrapWith(vault, 'password', normalizePassword(password));
    if (!dek) return recordFailure(vault, now);
    try {
      const totp = checkSecondFactor(vault, dek, code, now);
      if (totp === false) return recordFailure(vault, now);
      let next: VaultFile = { ...vault, throttle: { failures: 0, nextAttemptAt: 0 }, mfa: { totp: totp ?? null } };
      // Código de recuperação mostrado e nunca confirmado: troca por um novo, mostrado agora.
      let recoveryCode: string | null = null;
      if (!vault.recovery.confirmed) {
        recoveryCode = generateRecoveryCode();
        next = { ...next, recovery: { ...(await wrapForSecret(dek, canonicalRecoveryCode(recoveryCode) as string, AAD_RECOVERY)), confirmed: false } };
      }
      await writeVault(next);
      await openDatabase(dek);
      return { sessionToken: unlockWith(dek, next.settings.autoLockMinutes, now), recoveryCode };
    } finally {
      dek.fill(0);
    }
  });
}

/** Esqueceu a senha: o código de recuperação abre o cofre, define senha nova e é trocado por outro. */
export function recoverVault(recoveryInput: string, newPassword: string, code: string | undefined, now = Date.now()): Promise<{ sessionToken: string; recoveryCode: string }> {
  return serialized(async () => {
    const vault = await loadVault();
    const wait = retryAfter(vault, now);
    if (wait > 0) throw new VaultError('UNLOCK_THROTTLED', { retryAfterSeconds: wait });
    requirePolicy(newPassword);
    const canonical = canonicalRecoveryCode(recoveryInput);
    const dek = canonical ? await unwrapWith(vault, 'recovery', canonical) : null;
    if (!dek) return recordFailure(vault, now);
    try {
      const totp = checkSecondFactor(vault, dek, code, now);
      if (totp === false) return recordFailure(vault, now);
      const recoveryCode = generateRecoveryCode();
      const next: VaultFile = {
        ...vault,
        password: await wrapForSecret(dek, normalizePassword(newPassword), AAD_PASSWORD),
        recovery: { ...(await wrapForSecret(dek, canonicalRecoveryCode(recoveryCode) as string, AAD_RECOVERY)), confirmed: false },
        mfa: { totp: totp ?? null },
        throttle: { failures: 0, nextAttemptAt: 0 },
      };
      await writeVault(next);
      await openDatabase(dek);
      return { sessionToken: unlockWith(dek, next.settings.autoLockMinutes, now), recoveryCode };
    } finally {
      dek.fill(0);
    }
  });
}

/* Operações com o cofre aberto. As que mudam um fator pedem a senha atual de novo
   (reautenticação para ação de alto risco, docs/SECURITY.md). */

async function reauthenticate(vault: VaultFile, password: string, now: number): Promise<Buffer> {
  const wait = retryAfter(vault, now);
  if (wait > 0) throw new VaultError('UNLOCK_THROTTLED', { retryAfterSeconds: wait });
  const dek = await unwrapWith(vault, 'password', normalizePassword(password));
  if (!dek) return recordFailure(vault, now);
  const current = requireDek();
  const same = current.equals(dek);
  current.fill(0);
  if (!same) {
    dek.fill(0);
    throw new VaultError('INVALID_CREDENTIALS');
  }
  return dek;
}

export function changePassword(currentPassword: string, newPassword: string, now = Date.now()): Promise<void> {
  return serialized(async () => {
    const vault = await loadVault();
    requirePolicy(newPassword);
    const dek = await reauthenticate(vault, currentPassword, now);
    try {
      await writeVault({ ...vault, password: await wrapForSecret(dek, normalizePassword(newPassword), AAD_PASSWORD), throttle: { failures: 0, nextAttemptAt: 0 } });
    } finally {
      dek.fill(0);
    }
  });
}

export function regenerateRecoveryCode(password: string, now = Date.now()): Promise<{ recoveryCode: string }> {
  return serialized(async () => {
    const vault = await loadVault();
    const dek = await reauthenticate(vault, password, now);
    try {
      const recoveryCode = generateRecoveryCode();
      await writeVault({
        ...vault,
        recovery: { ...(await wrapForSecret(dek, canonicalRecoveryCode(recoveryCode) as string, AAD_RECOVERY)), confirmed: false },
        throttle: { failures: 0, nextAttemptAt: 0 },
      });
      return { recoveryCode };
    } finally {
      dek.fill(0);
    }
  });
}

export function confirmRecoveryCode(): Promise<void> {
  return serialized(async () => {
    requireDek().fill(0);
    const vault = await loadVault();
    if (!vault.recovery.confirmed) await writeVault({ ...vault, recovery: { ...vault.recovery, confirmed: true } });
  });
}

export function startTotpEnrollment(password: string, now = Date.now()): Promise<{ secret: string; uri: string }> {
  return serialized(async () => {
    const vault = await loadVault();
    if (vault.mfa.totp) throw new VaultError('TOTP_ALREADY_ENABLED');
    const dek = await reauthenticate(vault, password, now);
    dek.fill(0);
    pending.value?.secret.fill(0);
    const secret = generateTotpSecret();
    pending.value = { secret, createdAt: now };
    const encoded = base32Encode(secret);
    return { secret: encoded, uri: otpauthUri(encoded) };
  });
}

export function confirmTotpEnrollment(code: string, now = Date.now()): Promise<{ backupCodes: string[] }> {
  return serialized(async () => {
    const vault = await loadVault();
    if (vault.mfa.totp) throw new VaultError('TOTP_ALREADY_ENABLED');
    const enrollment = pending.value;
    if (!enrollment || now - enrollment.createdAt > PENDING_TOTP_TTL_MS) throw new VaultError('TOTP_NOT_PENDING');
    const step = verifyTotp(enrollment.secret, code, now, null);
    if (step === null) throw new VaultError('INVALID_TOTP');
    const dek = requireDek();
    try {
      const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
      const backupKey = subkey(dek, 'mfa-backup');
      await writeVault({
        ...vault,
        mfa: {
          totp: {
            secret: seal(enrollment.secret, subkey(dek, 'totp-secret'), AAD_TOTP),
            lastUsedStep: step,
            backupCodes: backupCodes.map((value) => hmacHex(backupKey, canonicalBackupCode(value) as string)),
            enabledAt: new Date(now).toISOString(),
          },
        },
      });
      enrollment.secret.fill(0);
      pending.value = null;
      return { backupCodes };
    } finally {
      dek.fill(0);
    }
  });
}

export function disableTotp(password: string, code: string, now = Date.now()): Promise<void> {
  return serialized(async () => {
    const vault = await loadVault();
    if (!vault.mfa.totp) throw new VaultError('TOTP_NOT_ENABLED');
    const dek = await reauthenticate(vault, password, now);
    try {
      const totp = checkSecondFactor(vault, dek, code, now);
      if (totp === false) return recordFailure(vault, now);
      await writeVault({ ...vault, mfa: { totp: null }, throttle: { failures: 0, nextAttemptAt: 0 } });
    } finally {
      dek.fill(0);
    }
  });
}

export function updateAutoLock(minutes: number): Promise<void> {
  return serialized(async () => {
    requireDek().fill(0);
    if (!Number.isInteger(minutes) || minutes < MIN_AUTO_LOCK_MINUTES || minutes > MAX_AUTO_LOCK_MINUTES) throw new Error('INVALID_AUTO_LOCK');
    const vault = await loadVault();
    await writeVault({ ...vault, settings: { ...vault.settings, autoLockMinutes: minutes } });
    setAutoLockMinutes(minutes);
  });
}

export function lockVault(): Promise<void> {
  pending.value?.secret.fill(0);
  pending.value = null;
  return lock();
}
