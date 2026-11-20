/* Primitivas do cofre local (docs/decisions/0009-local-vault-and-encrypted-database.md).

   - DEK: chave aleatória de 256 bits que cifra o banco inteiro.
   - KEK: chave derivada da senha (ou do código de recuperação) com scrypt.
   - Envelope: a DEK é cifrada com AES-256-GCM sob cada KEK. O tag autentica o
     resultado, então senha errada não "abre" uma chave errada: falha.

   Só usa node:crypto, para rodar no servidor e direto nos testes. */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, scrypt } from 'node:crypto';

export const DEK_BYTES = 32;

/** Parâmetros do scrypt: N = 2^17, r = 8, p = 1 (OWASP Password Storage Cheat Sheet). */
export type KdfParams = { name: 'scrypt'; N: number; r: number; p: number; keyLength: 32 };
export const DEFAULT_KDF: KdfParams = { name: 'scrypt', N: 2 ** 17, r: 8, p: 1, keyLength: 32 };

export type Wrapped = { iv: string; ciphertext: string; tag: string };

/** Deriva a chave de embrulho. O segredo chega já normalizado (NFKC ou código canônico). */
export function deriveKek(secret: string, salt: Buffer, params: KdfParams = DEFAULT_KDF): Promise<Buffer> {
  // 128 * N * r bytes de memória; folga de 2x para o próprio Node.
  const maxmem = 256 * params.N * params.r;
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, params.keyLength, { N: params.N, r: params.r, p: params.p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function seal(plaintext: Buffer, key: Buffer, aad: string): Wrapped {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

/** Devolve `null` quando a chave não confere ou o conteúdo foi alterado; nunca lança por isso. */
export function open(wrapped: Wrapped, key: Buffer, aad: string): Buffer | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(wrapped.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, 'base64')), decipher.final()]);
  } catch {
    return null;
  }
}

/** Subchave por finalidade, para que a DEK nunca seja usada direto em dois papéis. */
export function subkey(dek: Buffer, purpose: 'database' | 'totp-secret' | 'mfa-backup'): Buffer {
  return Buffer.from(hkdfSync('sha256', dek, 'talentum-vault-v1', purpose, 32));
}

export function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/* Código de recuperação: 160 bits em Base32 de Crockford (sem I, L, O, U),
   em 8 grupos de 4. Legível em voz alta e sem letras que se confundem. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockford(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += CROCKFORD[(value << (5 - bits)) & 31];
  return output;
}

function group(code: string, size: number): string {
  return code.match(new RegExp(`.{1,${size}}`, 'g'))?.join('-') ?? code;
}

export function generateRecoveryCode(): string {
  return group(crockford(randomBytes(20)), 4);
}

/** Forma canônica: maiúsculas, sem separadores, com as trocas de Crockford (O→0, I/L→1). */
export function canonicalRecoveryCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (cleaned.length !== 32) return null;
  for (const char of cleaned) if (!CROCKFORD.includes(char)) return null;
  return cleaned;
}

/** Códigos reserva do autenticador: 40 bits, 2 grupos de 4. */
export function generateBackupCode(): string {
  return group(crockford(randomBytes(5)), 4);
}

export function canonicalBackupCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (cleaned.length !== 8) return null;
  for (const char of cleaned) if (!CROCKFORD.includes(char)) return null;
  return cleaned;
}
