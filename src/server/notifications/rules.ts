/* Regras puras das fontes de notificação que vêm com o aplicativo.

   Cada função recebe só o que leu do banco e o instante atual, e devolve
   candidatas. Nenhum texto leva valor monetário formatado: o valor vai em
   `amountCents` e a interface formata (docs/ARCHITECTURE.md, §4.8).

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { civilDay, civilDaysBetween, civilMonth, isoWeek, type NotificationCandidate, type NotificationKindInfo } from './engine.ts';

export const DUE_SOON_DAYS = 3;
export const STALE_IMPORT_DAYS = 30;
export const STALE_RESTORE_POINT_DAYS = 30;
export const RECENT_IMPORT_ISSUE_DAYS = 30;

export const BUILTIN_KINDS = {
  obligations: [
    { kind: 'obligation_overdue', label: 'Obrigações vencidas', description: 'Uma obrigação em aberto passou da data de vencimento.' },
    { kind: 'obligation_due', label: 'Obrigações a vencer', description: `Uma obrigação em aberto vence nos próximos ${DUE_SOON_DAYS} dias.` },
  ],
  reconciliation: [
    { kind: 'reconciliation_pending', label: 'Conciliação pendente', description: 'Há lançamentos esperando confirmação na fila de conciliação.' },
  ],
  imports: [
    { kind: 'import_stale', label: 'Extrato desatualizado', description: `O último extrato de uma conta cobre até mais de ${STALE_IMPORT_DAYS} dias atrás.` },
    { kind: 'import_issues', label: 'Linhas não lidas', description: 'Uma importação recente tem linhas que não puderam ser lidas.' },
  ],
  backup: [
    { kind: 'backup_stale', label: 'Ponto de restauração antigo', description: `Nenhum ponto de restauração foi criado nos últimos ${STALE_RESTORE_POINT_DAYS} dias.` },
  ],
} as const satisfies Record<string, readonly NotificationKindInfo[]>;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** `18 de novembro`, com o ano quando não é o ano corrente (docs/DESIGN-SYSTEM.md, UX writing 6). */
export function formatDay(date: Date, now: Date): string {
  const base = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} de ${date.getFullYear()}`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export type ObligationInput = { id: string; description: string; amountCents: bigint; dueDate: Date };

export function deriveObligationNotifications(obligations: ObligationInput[], now: Date): NotificationCandidate[] {
  const result: NotificationCandidate[] = [];
  for (const obligation of obligations) {
    const days = civilDaysBetween(now, obligation.dueDate);
    if (days > DUE_SOON_DAYS) continue;
    const period = civilDay(obligation.dueDate);
    const when = formatDay(obligation.dueDate, now);
    if (days < 0) {
      result.push({
        kind: 'obligation_overdue',
        subject: obligation.id,
        period,
        severity: 'critical',
        title: `${obligation.description} venceu em ${when}`,
        body: 'A obrigação continua em aberto e entra no Saldo Livre de Risco. Marque como paga ou corrija a data.',
        href: '/extratos/recorrencias',
        actionLabel: 'Ver obrigações',
        occurredAt: obligation.dueDate,
        amountCents: obligation.amountCents,
      });
    } else {
      const label = days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : `vence em ${days} dias`;
      result.push({
        kind: 'obligation_due',
        subject: obligation.id,
        period,
        severity: 'warning',
        title: `${obligation.description} ${label}, ${when}`,
        body: 'A obrigação está em aberto. Quando pagar, marque como paga para o saldo refletir o pagamento.',
        href: '/extratos/recorrencias',
        actionLabel: 'Ver obrigações',
        occurredAt: now,
        amountCents: obligation.amountCents,
      });
    }
  }
  return result;
}

export function deriveReconciliationNotification(pendingCount: number, oldestPendingAt: Date | null, now: Date): NotificationCandidate[] {
  if (pendingCount <= 0) return [];
  return [
    {
      kind: 'reconciliation_pending',
      subject: 'queue',
      period: isoWeek(now),
      severity: 'info',
      title: `${plural(pendingCount, 'lançamento aguarda', 'lançamentos aguardam')} conferência`,
      body: 'Confirme ou corrija cada um na fila de conciliação para que gastos e saldo fiquem certos.',
      href: '/conciliacao',
      actionLabel: 'Abrir conciliação',
      occurredAt: oldestPendingAt ?? now,
    },
  ];
}

export type AccountImportInput = { id: string; name: string; lastCoveredDay: Date | null };

export function deriveStaleImportNotifications(accounts: AccountImportInput[], now: Date): NotificationCandidate[] {
  const result: NotificationCandidate[] = [];
  for (const account of accounts) {
    // Conta sem nenhum extrato não é "desatualizada": nada foi prometido sobre ela.
    if (!account.lastCoveredDay) continue;
    const days = civilDaysBetween(account.lastCoveredDay, now);
    if (days <= STALE_IMPORT_DAYS) continue;
    result.push({
      kind: 'import_stale',
      subject: account.id,
      period: civilMonth(now),
      severity: 'info',
      title: `O extrato de ${account.name} cobre até ${formatDay(account.lastCoveredDay, now)}`,
      body: `Faz ${days} dias sem lançamentos importados nesta conta. Importe um extrato mais recente para os gastos do mês ficarem completos.`,
      href: '/extratos/importar',
      actionLabel: 'Importar extrato',
      occurredAt: account.lastCoveredDay,
    });
  }
  return result;
}

export type ImportIssueInput = { id: string; fileName: string | null; importedAt: Date; errorCount: number };

export function deriveImportIssueNotifications(batches: ImportIssueInput[], now: Date): NotificationCandidate[] {
  return batches
    .filter((batch) => batch.errorCount > 0 && civilDaysBetween(batch.importedAt, now) <= RECENT_IMPORT_ISSUE_DAYS)
    .map((batch) => ({
      kind: 'import_issues',
      subject: batch.id,
      period: 'once',
      severity: 'warning' as const,
      title: `${plural(batch.errorCount, 'linha não foi lida', 'linhas não foram lidas')} na importação de ${formatDay(batch.importedAt, now)}`,
      body: `${batch.fileName ? `O arquivo ${batch.fileName}` : 'O arquivo'} tem linhas que ficaram fora dos lançamentos. Confira quais são e, se precisar, lance à mão.`,
      href: `/extratos/importar/${batch.id}`,
      actionLabel: 'Ver importação',
      occurredAt: batch.importedAt,
    }));
}

export function deriveRestorePointNotification(lastRestorePointAt: Date | null, hasData: boolean, now: Date): NotificationCandidate[] {
  if (!hasData) return [];
  if (lastRestorePointAt && civilDaysBetween(lastRestorePointAt, now) <= STALE_RESTORE_POINT_DAYS) return [];
  return [
    {
      kind: 'backup_stale',
      subject: 'device',
      period: civilMonth(now),
      severity: 'info',
      title: lastRestorePointAt
        ? `O último ponto de restauração é de ${formatDay(lastRestorePointAt, now)}`
        : 'Nenhum ponto de restauração criado',
      body: 'Um ponto de restauração guarda uma cópia dos seus dados neste computador e permite voltar a ela se algo der errado.',
      href: '/perfil/privacidade',
      actionLabel: 'Criar ponto de restauração',
      occurredAt: lastRestorePointAt ?? now,
    },
  ];
}
