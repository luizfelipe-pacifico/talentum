/* Alertas locais do Dashboard (MVP 6 de docs/ROADMAP.md).

   Dois tipos, ambos calculados a partir do que já está gravado no banco local,
   sem notificação externa nem telemetria:

   - **vencimento**: obrigação aberta vencida ou que vence nos próximos dias;
   - **dados desatualizados**: conta ativa cujo dado mais recente (saldo
     informado, fim do extrato importado ou último lançamento) ficou velho.

   Módulo puro: sem Prisma e sem relógio implícito. Recebe `now` e devolve a
   lista, que o teste do Node confere direto. */

export type AlertObligation = { id: string; description: string; amountCents: bigint; dueDate: Date; isEstimated: boolean };

export type AlertAccount = {
  id: string;
  name: string;
  /** Data do saldo informado mais recente. */
  lastBalanceAt: Date | null;
  /** Último dia coberto por um extrato importado. */
  lastStatementAt: Date | null;
  /** Data do lançamento mais recente, inclusive os registrados à mão. */
  lastEntryAt: Date | null;
};

/** Uma obrigação vence "em breve" se vence hoje ou nos próximos dias. */
export const DUE_SOON_DAYS = 3;

/** Conta sem dado novo há mais que isto é marcada como desatualizada. */
export const STALE_AFTER_DAYS = 30;

/** Itens listados por alerta; o total vem em `count`. */
export const ALERT_LIST_LIMIT = 5;

export type LocalAlert =
  | { kind: 'obligation_overdue'; severity: 'danger'; count: number; obligations: AlertObligation[] }
  | { kind: 'obligation_due_soon'; severity: 'warning'; count: number; obligations: AlertObligation[] }
  | { kind: 'stale_data'; severity: 'info'; count: number; accounts: { id: string; name: string; lastDataAt: Date }[] };

const DAY_MS = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** O dado mais recente da conta, ou `null` quando ela nunca recebeu nenhum. */
export function lastDataAt(account: AlertAccount): Date | null {
  const dates = [account.lastBalanceAt, account.lastStatementAt, account.lastEntryAt].filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function localAlerts(input: { now: Date; obligations: readonly AlertObligation[]; accounts: readonly AlertAccount[] }): LocalAlert[] {
  const today = startOfDay(input.now);
  const soonLimit = addDays(today, DUE_SOON_DAYS + 1);
  const byDueDate = (left: AlertObligation, right: AlertObligation) => left.dueDate.getTime() - right.dueDate.getTime();

  const overdue = input.obligations.filter((obligation) => obligation.dueDate < today).sort(byDueDate);
  const dueSoon = input.obligations.filter((obligation) => obligation.dueDate >= today && obligation.dueDate < soonLimit).sort(byDueDate);

  // Conta que nunca recebeu dado já aparece como "saldo desconhecido" no
  // veredito; alertar de novo aqui seria repetir o mesmo aviso.
  const staleBefore = new Date(today.getTime() - STALE_AFTER_DAYS * DAY_MS);
  const stale = input.accounts
    .map((account) => ({ id: account.id, name: account.name, lastDataAt: lastDataAt(account) }))
    .filter((account): account is { id: string; name: string; lastDataAt: Date } => account.lastDataAt !== null && account.lastDataAt < staleBefore)
    .sort((left, right) => left.lastDataAt.getTime() - right.lastDataAt.getTime());

  const alerts: LocalAlert[] = [];
  if (overdue.length > 0) alerts.push({ kind: 'obligation_overdue', severity: 'danger', count: overdue.length, obligations: overdue.slice(0, ALERT_LIST_LIMIT) });
  if (dueSoon.length > 0) alerts.push({ kind: 'obligation_due_soon', severity: 'warning', count: dueSoon.length, obligations: dueSoon.slice(0, ALERT_LIST_LIMIT) });
  if (stale.length > 0) alerts.push({ kind: 'stale_data', severity: 'info', count: stale.length, accounts: stale.slice(0, ALERT_LIST_LIMIT) });
  return alerts;
}
