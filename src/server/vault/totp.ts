/* TOTP (RFC 6238) sobre HOTP (RFC 4226), para aplicativos autenticadores.

   SHA-1, 6 dígitos e passo de 30 segundos: o único perfil que todos os
   aplicativos (Google Authenticator, Microsoft Authenticator, 1Password,
   Bitwarden, Aegis) leem sem configuração. Aceita o passo anterior e o
   seguinte (relógio fora de sincronia) e recusa um passo já usado. */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const RFC4648 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += RFC4648[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += RFC4648[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = RFC4648.indexOf(char);
    if (index === -1) throw new Error('INVALID_BASE32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Confere um código. Devolve o passo aceito, ou `null`.
 *
 * `lastUsedStep` impede repetir o mesmo código (nem um anterior a ele) dentro
 * da janela: quem viu o código na tela não o reutiliza.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastUsedStep: number | null): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const current = totpStep(nowMs);
  let accepted: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    // Compara todas as janelas, sem sair cedo, em tempo constante.
    if (timingSafeEqual(expected, Buffer.from(digits)) && accepted === null) accepted = step;
  }
  if (accepted === null) return null;
  if (lastUsedStep !== null && accepted <= lastUsedStep) return null;
  return accepted;
}

/** URI lida pelos aplicativos autenticadores. O rótulo não carrega dado pessoal. */
export function otpauthUri(secretBase32: string): string {
  const label = encodeURIComponent('Talentum:Cofre local');
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: 'Talentum',
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
