/* Arquivo do cofre: as chaves embrulhadas, fora do banco e ao lado dele.

   Fica fora do banco porque é ele que abre o banco. Não contém nenhum segredo
   em claro: a DEK está cifrada sob a senha e sob o código de recuperação, e o
   segredo do autenticador está cifrado sob a DEK. O resto (contagem de
   tentativas, minutos de bloqueio automático) é metadado sem valor sozinho.

   Escrita atômica: arquivo temporário com modo 0600, fsync e rename. Uma queda
   no meio deixa o arquivo antigo inteiro, nunca um cofre pela metade. */

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { KdfParams, Wrapped } from './crypto.ts';

export type VaultFile = {
  format: 'talentum-vault';
  version: 1;
  createdAt: string;
  kdf: KdfParams;
  password: { salt: string; wrapped: Wrapped };
  recovery: { salt: string; wrapped: Wrapped; confirmed: boolean };
  mfa: {
    totp: null | {
      /** Segredo cifrado sob a subchave `totp-secret` da DEK. */
      secret: Wrapped;
      lastUsedStep: number | null;
      /** HMAC dos códigos reserva ainda não usados, sob a subchave `mfa-backup`. */
      backupCodes: string[];
      enabledAt: string;
    };
  };
  settings: { autoLockMinutes: number };
  /** Atraso progressivo entre tentativas erradas; sobrevive a reinícios. */
  throttle: { failures: number; nextAttemptAt: number };
};

export const DEFAULT_AUTO_LOCK_MINUTES = 10;

/** Caminho do banco, resolvido como o Prisma resolve `DATABASE_URL` (relativo a `prisma/`). */
export function databasePath(): string {
  const url = process.env.DATABASE_URL ?? 'file:../temp/talentum-local.db';
  const raw = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), 'prisma', raw);
}

export function vaultPath(): string {
  const override = process.env.TALENTUM_VAULT_FILE;
  if (override && override.trim().length > 0) return override.trim();
  return join(dirname(databasePath()), 'talentum-local.vault');
}

function isVaultFile(value: unknown): value is VaultFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<VaultFile>;
  return (
    candidate.format === 'talentum-vault' &&
    candidate.version === 1 &&
    candidate.kdf?.name === 'scrypt' &&
    typeof candidate.password?.salt === 'string' &&
    typeof candidate.recovery?.salt === 'string' &&
    typeof candidate.throttle?.failures === 'number'
  );
}

export async function readVault(path = vaultPath()): Promise<VaultFile | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (!isVaultFile(parsed)) throw new Error('VAULT_FILE_INVALID');
  return parsed;
}

export async function writeVault(vault: VaultFile, path = vaultPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(vault, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  try {
    await chmod(path, 0o600);
  } catch {
    /* sistema de arquivos sem modo POSIX; no Windows vale a ACL do perfil */
  }
}
