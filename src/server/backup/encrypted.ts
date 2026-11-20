/* Backup cifrado com senha, gerado e lido só neste dispositivo.

   Formato versão 2 (docs/decisions/0007-local-encrypted-backup.md):

     MAGIC (16 bytes, "TALENTUM-BACKUP\n")
     comprimento do cabeçalho (uint32 big-endian)
     cabeçalho JSON em UTF-8:
       { v: 2, alg: "AES-256-GCM", kdf: "scrypt", N, r, p, salt, nonce, createdAt }
     texto cifrado
     tag de autenticação GCM (16 bytes)

   O cabeçalho inteiro (MAGIC, comprimento e JSON) entra como dado adicional
   autenticado: trocar um parâmetro do KDF ou o nonce invalida a tag.

   O texto em claro é: comprimento do manifesto interno (uint32), manifesto
   JSON `{ schemaVersion, databaseBytes, databaseSha256, databaseKeyBytes,
   keyBytes }`, os bytes do banco, a chave do banco e os bytes da chave do
   dispositivo. O SHA-256 do banco fica do lado de dentro, cifrado: no
   cabeçalho ele permitiria confirmar um palpite sobre o conteúdo sem a senha.

   Os bytes do banco são uma cópia cifrada pelo libSQL com uma chave aleatória
   gerada só para este arquivo (a "chave do banco" acima), nunca a chave do
   cofre: quem tem a senha do backup lê esta cópia, mas não o banco em uso.
   Assim o banco não fica em claro nem no disco nem dentro do backup, e a
   restauração não depende da senha do cofre de quando o backup foi feito: o
   aplicativo abre a cópia com a chave do arquivo e regrava os dados com a
   chave do cofre atual. A chave do dispositivo vai junto porque, sem ela, as
   chaves PIX gravadas na cópia ficariam ilegíveis.

   A versão 1 levava o banco em claro dentro do arquivo e só existiu em versões
   de desenvolvimento anteriores ao cofre; é recusada com UNSUPPORTED_VERSION.

   A chave vem da senha por scrypt (N = 2^17, r = 8, p = 1, sal aleatório de
   16 bytes), o mínimo recomendado pela OWASP para scrypt. Não existe
   recuperação: sem a senha, o arquivo não abre. Isso é dito na interface.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { MAX_BACKUP_BYTES } from './limits.ts';
import { sha256Buffer } from './restore-core.ts';

export const MAGIC = Buffer.from('TALENTUM-BACKUP\n', 'utf8');
export const FORMAT_VERSION = 2;
export const DEFAULT_KDF = { N: 2 ** 17, r: 8, p: 1 } as const;
export const PASSPHRASE_MIN = 12;
export const PASSPHRASE_MAX = 1024;
export { MAX_BACKUP_BYTES };

const MAX_HEADER_BYTES = 4096;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class EncryptedBackupError extends Error {
  readonly code: 'NOT_A_BACKUP' | 'UNSUPPORTED_VERSION' | 'WRONG_PASSPHRASE_OR_DAMAGED' | 'WEAK_PASSPHRASE';
  constructor(code: EncryptedBackupError['code']) {
    super(code);
    this.name = 'EncryptedBackupError';
    this.code = code;
  }
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

/* Parâmetros do KDF vêm do arquivo, que é entrada não confiável: limites
   fechados impedem que um arquivo forjado peça gigabytes de memória. */
const headerSchema = z
  .object({
    v: z.literal(FORMAT_VERSION),
    alg: z.literal('AES-256-GCM'),
    kdf: z.literal('scrypt'),
    N: z
      .number()
      .int()
      .min(2 ** 14)
      .max(2 ** 20)
      .refine((n) => (n & (n - 1)) === 0),
    r: z.literal(8),
    p: z.number().int().min(1).max(4),
    salt: base64url,
    nonce: base64url,
    createdAt: z.string().datetime(),
  })
  .strict();

const innerSchema = z
  .object({
    schemaVersion: z.string().regex(/^\d{14}_[a-z0-9_]+$/),
    databaseBytes: z.number().int().positive(),
    databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    databaseKeyBytes: z.literal(32),
    keyBytes: z.number().int().min(0).max(1024),
  })
  .strict();

export type KdfParams = { N: number; r: number; p: number };

function deriveKey(passphrase: string, salt: Buffer, kdf: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem cobre 128 * N * r com folga; o teto de N acima limita o pior caso.
    scryptCallback(passphrase.normalize('NFC'), salt, KEY_BYTES, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r + 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export function assertPassphrase(passphrase: string) {
  const length = [...passphrase.normalize('NFC')].length;
  if (length < PASSPHRASE_MIN || length > PASSPHRASE_MAX) throw new EncryptedBackupError('WEAK_PASSPHRASE');
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

/** `database`: cópia cifrada pelo libSQL com `databaseKey` (32 bytes). `key`: chave do dispositivo. */
export type BackupContent = { schemaVersion: string; database: Buffer; databaseKey: Buffer; key: Buffer | null };

export async function encryptBackup(content: BackupContent, passphrase: string, options: { kdf?: KdfParams; now?: Date } = {}): Promise<Buffer> {
  assertPassphrase(passphrase);
  const kdf = options.kdf ?? DEFAULT_KDF;
  const salt = randomBytes(16);
  // Nonce aleatório de 96 bits por arquivo; a chave também é nova a cada
  // arquivo (sal novo), então o par chave/nonce nunca se repete.
  const nonce = randomBytes(12);
  const header = Buffer.from(
    JSON.stringify({
      v: FORMAT_VERSION,
      alg: 'AES-256-GCM',
      kdf: 'scrypt',
      N: kdf.N,
      r: kdf.r,
      p: kdf.p,
      salt: salt.toString('base64url'),
      nonce: nonce.toString('base64url'),
      createdAt: (options.now ?? new Date()).toISOString(),
    }),
    'utf8',
  );
  const prefix = Buffer.concat([MAGIC, uint32(header.length), header]);

  if (content.databaseKey.length !== 32) throw new Error('DATABASE_KEY_INVALID');
  const key = content.key ?? Buffer.alloc(0);
  const inner = Buffer.from(
    JSON.stringify({
      schemaVersion: content.schemaVersion,
      databaseBytes: content.database.length,
      databaseSha256: sha256Buffer(content.database),
      databaseKeyBytes: content.databaseKey.length,
      keyBytes: key.length,
    }),
    'utf8',
  );
  const plaintext = Buffer.concat([uint32(inner.length), inner, content.database, content.databaseKey, key]);

  const derived = await deriveKey(passphrase, salt, kdf);
  try {
    const cipher = createCipheriv('aes-256-gcm', derived, nonce);
    cipher.setAAD(prefix);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([prefix, ciphertext, cipher.getAuthTag()]);
  } finally {
    derived.fill(0);
  }
}

/** Lê só o cabeçalho, sem senha: serve para recusar cedo um arquivo que não é backup. */
export function readHeader(file: Buffer) {
  if (file.length < MAGIC.length + 4 + TAG_BYTES || !timingSafeEqual(file.subarray(0, MAGIC.length), MAGIC)) {
    throw new EncryptedBackupError('NOT_A_BACKUP');
  }
  const length = file.readUInt32BE(MAGIC.length);
  if (length <= 0 || length > MAX_HEADER_BYTES || MAGIC.length + 4 + length + TAG_BYTES > file.length) {
    throw new EncryptedBackupError('NOT_A_BACKUP');
  }
  const raw = file.subarray(MAGIC.length + 4, MAGIC.length + 4 + length);
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new EncryptedBackupError('NOT_A_BACKUP');
  }
  if ((json as { v?: unknown })?.v !== FORMAT_VERSION) throw new EncryptedBackupError('UNSUPPORTED_VERSION');
  const parsed = headerSchema.safeParse(json);
  if (!parsed.success) throw new EncryptedBackupError('NOT_A_BACKUP');
  const salt = Buffer.from(parsed.data.salt, 'base64url');
  const nonce = Buffer.from(parsed.data.nonce, 'base64url');
  if (salt.length !== 16 || nonce.length !== 12) throw new EncryptedBackupError('NOT_A_BACKUP');
  return { header: parsed.data, salt, nonce, prefixLength: MAGIC.length + 4 + length };
}

export async function decryptBackup(file: Buffer, passphrase: string): Promise<BackupContent> {
  const { header, salt, nonce, prefixLength } = readHeader(file);
  if (passphrase.length === 0 || passphrase.length > PASSPHRASE_MAX * 4) throw new EncryptedBackupError('WRONG_PASSPHRASE_OR_DAMAGED');

  const derived = await deriveKey(passphrase, salt, header);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-gcm', derived, nonce);
    decipher.setAAD(file.subarray(0, prefixLength));
    decipher.setAuthTag(file.subarray(file.length - TAG_BYTES));
    plaintext = Buffer.concat([decipher.update(file.subarray(prefixLength, file.length - TAG_BYTES)), decipher.final()]);
  } catch {
    // Senha errada e arquivo alterado são indistinguíveis no GCM, e é bom que sejam.
    throw new EncryptedBackupError('WRONG_PASSPHRASE_OR_DAMAGED');
  } finally {
    derived.fill(0);
  }

  try {
    const innerLength = plaintext.readUInt32BE(0);
    const inner = innerSchema.parse(JSON.parse(plaintext.subarray(4, 4 + innerLength).toString('utf8')));
    const start = 4 + innerLength;
    if (start + inner.databaseBytes + inner.databaseKeyBytes + inner.keyBytes !== plaintext.length) throw new Error('LENGTH');
    const database = plaintext.subarray(start, start + inner.databaseBytes);
    if (sha256Buffer(database) !== inner.databaseSha256) throw new Error('CHECKSUM');
    const databaseKey = plaintext.subarray(start + inner.databaseBytes, start + inner.databaseBytes + inner.databaseKeyBytes);
    const key = inner.keyBytes > 0 ? plaintext.subarray(start + inner.databaseBytes + inner.databaseKeyBytes) : null;
    const result = { schemaVersion: inner.schemaVersion, database: Buffer.from(database), databaseKey: Buffer.from(databaseKey), key: key ? Buffer.from(key) : null };
    plaintext.fill(0);
    return result;
  } catch {
    throw new EncryptedBackupError('WRONG_PASSPHRASE_OR_DAMAGED');
  }
}
