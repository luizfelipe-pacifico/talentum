/* Detecção de transferência entre contas próprias.

   Lacuna L-5 de docs/PRODUCT.md: enquanto o par não é conciliado, dinheiro que
   só mudou de conta aparece como gasto numa e receita na outra. Este módulo
   encontra os pares prováveis; a pessoa confirma, e a decisão `transfer` já
   existente faz a escrita. Nada aqui grava ou decide sozinho.

   Puro e sem banco. A comparação com as chaves PIX próprias usa o índice HMAC
   (src/server/pix.ts), calculado fora daqui: este módulo só extrai da descrição
   os trechos que têm forma de chave, sem nunca guardá-los. */

import { normalizePixKey, type PixKeyType } from './pix.ts';

export type TransferEntry = {
  id: string;
  accountId: string;
  occurredOn: Date;
  amountCents: bigint;
  /** A descrição cita uma chave PIX da própria pessoa (índice HMAC conferido). */
  mentionsOwnPix?: boolean;
};

export type TransferCandidate = { transactionId: string; confidence: number; dayDistance: number; ownPix: boolean };

/** Diferença máxima, em dias civis, entre a saída e a entrada do mesmo dinheiro. */
export const TRANSFER_WINDOW_DAYS = 3;

/** A partir desta confiança o item vai para a fila como transferência provável. */
export const TRANSFER_SUGGESTION_CONFIDENCE = 60;

const DAY_MS = 86_400_000;
const civilDay = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

/**
 * Pares prováveis de um lançamento, do mais para o menos provável.
 *
 * Um par exige o mesmo valor com sinal oposto, em outra conta da pessoa, dentro
 * da janela. A confiança parte de 60 e sobe com a proximidade da data e com a
 * menção a uma chave PIX própria, que é a evidência mais forte que o extrato dá.
 */
export function transferCandidates(target: TransferEntry, pool: readonly TransferEntry[]): TransferCandidate[] {
  if (target.amountCents === 0n) return [];
  const day = civilDay(target.occurredOn);
  const candidates: TransferCandidate[] = [];
  for (const entry of pool) {
    if (entry.id === target.id || entry.accountId === target.accountId) continue;
    if (entry.amountCents + target.amountCents !== 0n) continue;
    const dayDistance = Math.abs(civilDay(entry.occurredOn) - day);
    if (dayDistance > TRANSFER_WINDOW_DAYS) continue;
    const ownPix = Boolean(target.mentionsOwnPix || entry.mentionsOwnPix);
    const confidence = Math.min(100, 60 + (dayDistance === 0 ? 20 : dayDistance === 1 ? 10 : 0) + (ownPix ? 20 : 0));
    candidates.push({ transactionId: entry.id, confidence, dayDistance, ownPix });
  }
  return candidates.sort((left, right) => right.confidence - left.confidence || left.dayDistance - right.dayDistance);
}

/**
 * Trechos da descrição com forma de chave PIX, já normalizados.
 *
 * E-mail, chave aleatória, CNPJ, CPF e telefone, nessa ordem, para que um CNPJ
 * não seja lido também como CPF. Trecho mascarado pelo banco (`***.123.456-**`)
 * não tem dígitos suficientes e é ignorado: não há como compará-lo.
 */
export function pixKeyCandidates(description: string): { type: PixKeyType; normalized: string }[] {
  const found: { type: PixKeyType; normalized: string }[] = [];
  const seen = new Set<string>();
  const add = (type: PixKeyType, raw: string) => {
    try {
      const normalized = normalizePixKey(type, raw);
      const key = `${type}:${normalized}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ type, normalized });
      }
    } catch {
      // Não é uma chave válida desse tipo.
    }
  };
  let rest = description.slice(0, 300);
  for (const match of rest.matchAll(/[^\s@]+@[^\s@]+\.[^\s@]+/g)) add('email', match[0]);
  for (const match of rest.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) add('random', match[0]);
  rest = rest.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' ');
  // Cada forma consome o trecho que reconheceu, da mais longa para a mais
  // curta, sempre com fronteira de dígito: 14 dígitos nunca viram um CPF.
  const take = (pattern: RegExp, onMatch: (value: string) => void) => {
    rest = rest.replace(pattern, (value) => {
      onMatch(value);
      return ' ';
    });
  };
  take(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, (value) => add('cnpj', value));
  take(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, (value) => {
    // Onze dígitos podem ser CPF ou celular com DDD: os dois são conferidos.
    add('cpf', value);
    add('phone', value);
  });
  take(/(?<![\d+])(?:\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}(?!\d)/g, (value) => add('phone', value));
  return found;
}
