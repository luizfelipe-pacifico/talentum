/* Identificadores PIX próprios.

   Servem a um propósito só: reconhecer transferência entre contas da própria
   pessoa, que não é receita nem despesa e não pode inflar nenhum agregado
   (docs/ONBOARDING.md).

   Três regras que o documento fixa e que este módulo implementa:

   1. o valor fica **cifrado** no dispositivo, nunca em texto puro;
   2. a comparação usa **HMAC com segredo do dispositivo**, não hash simples —
      CPF, telefone e e-mail têm espaço de valores previsível;
   3. a exibição é **mascarada**, e o valor em claro nunca vai para log,
      timeline, analytics, D1 ou mensagem de erro.

   A normalização é o que faz a comparação funcionar: `(11) 98888-7777` e
   `+5511988887777` são a mesma chave e precisam produzir o mesmo índice. */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
/* Import relativo com extensão, não pelo alias `@/`: é o que permite ao
   executor de testes do Node importar este módulo direto, sem etapa de build
   (docs/DEVELOPMENT.md). */
import { deriveKey } from './local-key.ts';

export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

export const PIX_KEY_TYPES: readonly PixKeyType[] = ['cpf', 'cnpj', 'phone', 'email', 'random'];

export type PixParseErrorCode = 'INVALID_PIX_KEY' | 'INVALID_PIX_TYPE';

export class PixParseError extends Error {
  readonly code: PixParseErrorCode;

  constructor(code: PixParseErrorCode) {
    super(code);
    this.name = 'PixParseError';
    this.code = code;
  }
}

const digitsOf = (value: string) => value.replace(/\D/g, '');

/**
 * Normaliza a chave para a forma canônica usada na comparação.
 *
 * Sem isto, a mesma chave digitada de dois jeitos geraria índices diferentes e
 * a transferência própria deixaria de ser reconhecida — aparecendo como despesa
 * numa conta e receita na outra, exatamente o erro que a lacuna L-5 de
 * `docs/DASHBOARD.md` descreve.
 */
export function normalizePixKey(type: PixKeyType, raw: string): string {
  const value = (raw ?? '').trim();
  if (value.length === 0) throw new PixParseError('INVALID_PIX_KEY');

  switch (type) {
    case 'cpf': {
      const digits = digitsOf(value);
      if (digits.length !== 11) throw new PixParseError('INVALID_PIX_KEY');
      return digits;
    }
    case 'cnpj': {
      const digits = digitsOf(value);
      if (digits.length !== 14) throw new PixParseError('INVALID_PIX_KEY');
      return digits;
    }
    case 'phone': {
      const digits = digitsOf(value);
      // Aceita com ou sem o código do país e devolve sempre em E.164.
      if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
      if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;
      throw new PixParseError('INVALID_PIX_KEY');
    }
    case 'email': {
      const lowered = value.toLowerCase();
      // Validação deliberadamente simples: o objetivo é comparar, não atestar
      // que o endereço existe.
      if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(lowered) || lowered.length > 320) {
        throw new PixParseError('INVALID_PIX_KEY');
      }
      return lowered;
    }
    case 'random': {
      const lowered = value.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lowered)) {
        throw new PixParseError('INVALID_PIX_KEY');
      }
      return lowered;
    }
    default:
      throw new PixParseError('INVALID_PIX_TYPE');
  }
}

/**
 * Rótulo mascarado, seguro para a tela.
 *
 * Mostra o suficiente para a pessoa reconhecer a própria chave e insuficiente
 * para alguém reconstruí-la a partir de uma captura de tela.
 */
export function maskPixKey(type: PixKeyType, normalized: string): string {
  switch (type) {
    case 'cpf':
      return `•••.•••.${normalized.slice(6, 9)}-${normalized.slice(9)}`;
    case 'cnpj':
      return `••.•••.•••/${normalized.slice(8, 12)}-${normalized.slice(12)}`;
    case 'phone':
      return `+55 (${normalized.slice(3, 5)}) ••••-${normalized.slice(-4)}`;
    case 'email': {
      const [local, domain] = normalized.split('@');
      const head = local.slice(0, 1);
      return `${head}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
    }
    case 'random':
      return `${normalized.slice(0, 8)}–••••–${normalized.slice(-4)}`;
    default:
      return '••••';
  }
}

/**
 * Índice de comparação.
 *
 * HMAC-SHA256 com subchave do dispositivo. O tipo entra no cálculo para que o
 * mesmo dígito não colida entre tipos diferentes.
 */
export async function pixIndexOf(type: PixKeyType, normalized: string): Promise<string> {
  const key = await deriveKey('pix-index');
  return createHmac('sha256', key).update(`${type}:${normalized}`).digest('hex');
}

/** Comparação de índices em tempo constante. */
export function pixIndexEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const CIPHER_VERSION = 'v1';

/**
 * Cifra o valor normalizado com AES-256-GCM.
 *
 * O formato traz versão, nonce e tag de autenticação. A versão existe para que
 * uma troca futura de algoritmo consiga distinguir o que já está gravado, em
 * vez de tentar decifrar com a construção errada.
 */
export async function encryptPixKey(normalized: string): Promise<string> {
  const key = await deriveKey('pix-value');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

/**
 * Decifra o valor.
 *
 * Usada apenas quando a pessoa pede explicitamente para ver a própria chave. A
 * tag de autenticação faz a decifragem falhar em conteúdo adulterado, em vez de
 * devolver lixo.
 */
export async function decryptPixKey(payload: string): Promise<string> {
  const [version, iv, ciphertext, tag] = payload.split('.');
  if (version !== CIPHER_VERSION || !iv || !ciphertext || !tag) throw new PixParseError('INVALID_PIX_KEY');

  const key = await deriveKey('pix-value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export type PreparedPixKey = {
  type: PixKeyType;
  valueIndex: string;
  valueCiphertext: string;
  maskedValue: string;
};

/** Prepara uma chave para persistência: normaliza, indexa, cifra e mascara. */
export async function preparePixKey(type: PixKeyType, raw: string): Promise<PreparedPixKey> {
  if (!PIX_KEY_TYPES.includes(type)) throw new PixParseError('INVALID_PIX_TYPE');
  const normalized = normalizePixKey(type, raw);
  const [valueIndex, valueCiphertext] = await Promise.all([
    pixIndexOf(type, normalized),
    encryptPixKey(normalized),
  ]);
  return { type, valueIndex, valueCiphertext, maskedValue: maskPixKey(type, normalized) };
}
