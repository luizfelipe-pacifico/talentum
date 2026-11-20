/* Consultas e validação compartilhadas por orçamento, metas, dívidas e
   patrimônio (Stages 9, 12, 13 e 14).

   Toda consulta é escopada por `profileId` (docs/DATABASE.md). As fórmulas
   moram nos módulos puros; aqui só se carrega o que elas consomem. */

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/server/db';
import { committedCents, endOfMonth, riskFreeBalanceCents, type TransactionInput } from '@/server/dashboard-metrics';
import { loadConsolidatedBalance, loadCoverage, loadOpenObligations, toTransactionInput, transactionSelect } from '@/server/dashboard-queries';
import { survivalStatus } from '@/server/debt-metrics';

/* ── Validação de entrada ──────────────────────────────────────── */

/** Centavos inteiros e positivos, como string (BigInt não viaja em JSON). Teto de R$ 100 bilhões. */
export const positiveCents = z
  .string()
  .regex(/^\d{1,13}$/)
  .transform(BigInt)
  .refine((value) => value > 0n);

export const nonNegativeCents = z.string().regex(/^\d{1,13}$/).transform(BigInt);

export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Data civil `AAAA-MM-DD`, gravada ao meio-dia local para não trocar de dia por fuso. */
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  // Data inexistente (30 de fevereiro) seria rolada em silêncio para março.
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    return year >= 1970 && year <= 2200 && date.getMonth() === month - 1 && date.getDate() === day;
  })
  .transform((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  });

/** Chave de idempotência gerada pelo cliente para cada intenção de escrita. */
export const idempotencyKey = z.string().uuid();

export const shortName = z.string().trim().min(1).max(80);

/** Erro do Prisma por violação de unicidade. Tratado aqui até existir o mapeador comum. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Registro alvo de update/delete não existe mais. */
export function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/* ── Serialização ──────────────────────────────────────────────── */

/** Centavos e datas para o fio: BigInt vira string e Date vira ISO 8601. */
export function toWire(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), toWire(item)]));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toWire(item)]));
  }
  return value;
}

/** Data civil local em `AAAA-MM-DD`, sem passar por UTC. */
export function civilDay(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

/* ── Leituras ──────────────────────────────────────────────────── */

/** Lançamentos do perfil no intervalo, só com as colunas que as fórmulas usam. */
export async function loadTransactions(profileId: string, start: Date, end: Date): Promise<TransactionInput[]> {
  const rows = await db.transaction.findMany({
    where: { profileId, occurredOn: { gte: start, lte: end } },
    select: transactionSelect,
  });
  return rows.map(toTransactionInput);
}

export { loadCoverage };

/**
 * Saldo Livre de Risco até o fim do mês corrente, ou `null` quando nenhuma
 * conta tem saldo informado: sem base, o sistema não afirma falta de dinheiro.
 */
export async function loadRiskFreeBalance(profileId: string, today: Date): Promise<bigint | null> {
  const balance = await loadConsolidatedBalance(profileId);
  if (balance.knownAccounts === 0) return null;
  const obligations = await loadOpenObligations(profileId, endOfMonth(today));
  return riskFreeBalanceCents(balance.cents, committedCents(obligations, endOfMonth(today)));
}

/** Situação do modo sobrevivência, compartilhada por dívidas, patrimônio e aportes. */
export async function loadSurvival(profileId: string, today: Date) {
  const [riskFree, debts] = await Promise.all([
    loadRiskFreeBalance(profileId, today),
    db.debt.findMany({ where: { profileId, status: 'open' }, select: { overdueCents: true } }),
  ]);
  return { riskFreeBalanceCents: riskFree, ...survivalStatus({ riskFreeBalanceCents: riskFree, debts }) };
}

/** Evento de linha do tempo redigido: sem valor, sem nome digitado. */
export function planningEvent(profileId: string, title: string, description: string) {
  return { profileId, kind: 'planning', title, description, reversible: false };
}
