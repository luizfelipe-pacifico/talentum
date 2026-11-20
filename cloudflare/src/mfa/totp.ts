/* TOTP (RFC 6238) sobre HOTP (RFC 4226), com Web Crypto.

   Padrão dos apps autenticadores: SHA-1, 6 dígitos, passo de 30 s. A
   verificação aceita o passo atual e um de cada lado (±30 s de relógio) e só
   um passo maior que o último aceito, o que recusa repetir o mesmo código. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('BASE32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export type HashName = 'SHA-1' | 'SHA-256' | 'SHA-512';

export async function hotp(secret: Uint8Array, counter: number, digits = 6, hash: HashName = 'SHA-1'): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash }, false, ['sign']);
  const message = new Uint8Array(8);
  let rest = counter;
  for (let i = 7; i >= 0; i -= 1) {
    message[i] = rest & 255;
    rest = Math.floor(rest / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = mac[mac.length - 1] & 15;
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export const STEP_SECONDS = 30;
export const stepAt = (unixSeconds: number) => Math.floor(unixSeconds / STEP_SECONDS);

export async function totp(secret: Uint8Array, unixSeconds: number, digits = 6, hash: HashName = 'SHA-1') {
  return hotp(secret, stepAt(unixSeconds), digits, hash);
}

/**
 * Passo em que o código vale (atual ±1), desde que maior que `lastUsedStep`;
 * `null` quando não vale. Compara todos os candidatos para não variar o tempo.
 */
export async function matchingStep(secret: Uint8Array, code: string, unixSeconds: number, lastUsedStep: number): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepAt(unixSeconds);
  let found: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = await hotp(secret, step);
    let diff = 0;
    for (let i = 0; i < 6; i += 1) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0 && step > lastUsedStep && found === null) found = step;
  }
  return found;
}

export function otpauthUri(secretBase32: string, accountLabel: string): string {
  const label = encodeURIComponent(`Talentum:${accountLabel}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer: 'Talentum', algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
