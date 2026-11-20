import type { Env } from '../env.ts';

/* Primitivas criptográficas do Worker: aleatoriedade, hashes com pimenta e
   AES-GCM. Nada aqui registra valores. */

const enc = new TextEncoder();

export const b64 = (x: Uint8Array) =>
  btoa(String.fromCharCode(...x))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const rnd = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n)));

export const now = (add = 0) => new Date(Date.now() + add).toISOString();

export const sha = async (x: string) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(x))));

/** Hash com pimenta: o que o D1 guarda no lugar de tokens, códigos e chaves de balde. */
export const th = (e: Env, x: string) => sha(`${e.TOKEN_HASH_PEPPER}:${x}`);

/** Igualdade em tempo constante entre duas strings (via digest, comprimento fixo). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha(`cmp:${a}`), sha(`cmp:${b}`)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && x.length === y.length;
}

async function aesKey(material: string, usage: 'encrypt' | 'decrypt') {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(material));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

/** AES-GCM com IV aleatório; `aad` amarra o texto cifrado ao seu dono. */
export async function seal(material: string, plain: string, aad = ''): Promise<string> {
  const key = await aesKey(material, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plain)),
  );
  return `${b64(iv)}.${b64(out)}`;
}

export async function open(material: string, sealed: string, aad = ''): Promise<string> {
  const key = await aesKey(material, 'decrypt');
  const [iv, data] = sealed.split('.').map(fromB64);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, data));
}

/** PKCE S256: BASE64URL(SHA-256(verifier)). */
export const s256 = sha;
