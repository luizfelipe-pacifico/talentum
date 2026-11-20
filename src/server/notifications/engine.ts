/* Central de notificações: núcleo puro.

   Notificação aqui é **derivada**: nasce dos dados locais a cada consulta
   (obrigação vencendo, fila de conciliação, extrato antigo) e desaparece
   sozinha quando a situação deixa de existir. Só o que a pessoa faz com ela —
   ler, dispensar — é gravado, em `NotificationState`, pela chave estável.

   A chave é `tipo:assunto:período`. O período decide quando a mesma situação
   volta a avisar: uma obrigação vencida avisa uma vez por vencimento; a fila de
   conciliação, uma vez por semana. Duas fontes que gerem a mesma chave viram
   uma notificação só (deduplicação).

   Outras funcionalidades (orçamento, cartões) entram implementando
   `NotificationSource` e registrando a fonte em `registry.ts`; este núcleo não
   conhece nenhuma delas.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

export type Severity = 'info' | 'warning' | 'critical';

export type NotificationKindInfo = {
  kind: string;
  /** Nome curto da preferência, em português. */
  label: string;
  /** O que dispara a notificação, para a tela de preferências. */
  description: string;
};

export type NotificationCandidate = {
  kind: string;
  /** ID opaco do assunto (obrigação, conta, lote) ou um nome fixo (`queue`). */
  subject: string;
  /** Janela que distingue repetições: dia, semana ISO, mês, `once`. */
  period: string;
  severity: Severity;
  title: string;
  body: string;
  /** Rota interna onde a pessoa resolve a situação. */
  href: string;
  actionLabel: string;
  occurredAt: Date;
  /** Valor relacionado, em centavos, formatado só na interface. */
  amountCents?: bigint;
};

export interface NotificationSource<TInput = unknown> {
  id: string;
  kinds: readonly NotificationKindInfo[];
  /** Lê do banco local o mínimo de que a fonte precisa. Sempre escopado por perfil. */
  load(profileId: string): Promise<TInput>;
  /** Regra pura: mesma entrada e mesmo instante, mesmas notificações. */
  derive(input: TInput, now: Date): NotificationCandidate[];
}

export type NotificationStateRow = { key: string; readAt: Date | null; dismissedAt: Date | null };

export type NotificationPreferences = { quiet: boolean; disabledKinds: ReadonlySet<string> };

export type Notification = {
  key: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
  occurredAt: string;
  amountCents: string | null;
  read: boolean;
};

export type NotificationCenter = {
  notifications: Notification[];
  unreadCount: number;
  /** Número no sino. Em modo silencioso, `null`: a lista continua, o sino não chama. */
  badgeCount: number | null;
  quiet: boolean;
  dismissedCount: number;
};

const SEGMENT = /[^A-Za-z0-9-]/g;
export const KEY_PATTERN = /^[a-z][a-z_]{1,40}:[A-Za-z0-9-]{1,64}:[A-Za-z0-9-]{1,20}$/;
const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function notificationKey(candidate: Pick<NotificationCandidate, 'kind' | 'subject' | 'period'>): string {
  const subject = candidate.subject.replace(SEGMENT, '').slice(0, 64) || 'none';
  const period = candidate.period.replace(SEGMENT, '').slice(0, 20) || 'once';
  return `${candidate.kind}:${subject}:${period}`;
}

function isInternalHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}

/** Junta candidatas, estado salvo e preferências no que a interface mostra. */
export function buildNotificationCenter(
  candidates: NotificationCandidate[],
  states: NotificationStateRow[],
  preferences: NotificationPreferences,
): NotificationCenter {
  const byKey = new Map<string, NotificationCandidate>();
  for (const candidate of candidates) {
    if (preferences.disabledKinds.has(candidate.kind) || !isInternalHref(candidate.href)) continue;
    const key = notificationKey(candidate);
    const current = byKey.get(key);
    // Deduplicação: a mesma chave fica com a versão mais grave.
    if (!current || RANK[candidate.severity] < RANK[current.severity]) byKey.set(key, candidate);
  }

  const stateByKey = new Map(states.map((state) => [state.key, state]));
  let dismissedCount = 0;
  const notifications: Notification[] = [];
  for (const [key, candidate] of byKey) {
    const state = stateByKey.get(key);
    if (state?.dismissedAt) {
      dismissedCount += 1;
      continue;
    }
    notifications.push({
      key,
      kind: candidate.kind,
      severity: candidate.severity,
      title: candidate.title,
      body: candidate.body,
      href: candidate.href,
      actionLabel: candidate.actionLabel,
      occurredAt: candidate.occurredAt.toISOString(),
      amountCents: candidate.amountCents === undefined ? null : candidate.amountCents.toString(),
      read: Boolean(state?.readAt),
    });
  }

  notifications.sort(
    (a, b) =>
      Number(a.read) - Number(b.read) ||
      RANK[a.severity] - RANK[b.severity] ||
      (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0) ||
      (a.key < b.key ? -1 : 1),
  );

  const unreadCount = notifications.filter((item) => !item.read).length;
  return { notifications, unreadCount, badgeCount: preferences.quiet ? null : unreadCount, quiet: preferences.quiet, dismissedCount };
}

/* Preferências gravadas em `UserPreference`, uma linha por chave. */
export const QUIET_PREFERENCE = 'notifications.quiet';
export const KIND_PREFERENCE_PREFIX = 'notifications.kind.';

export function preferencesFromRows(rows: { key: string; value: string }[]): NotificationPreferences {
  const disabledKinds = new Set<string>();
  let quiet = false;
  for (const row of rows) {
    if (row.key === QUIET_PREFERENCE) quiet = row.value === 'on';
    else if (row.key.startsWith(KIND_PREFERENCE_PREFIX) && row.value === 'off') disabledKinds.add(row.key.slice(KIND_PREFERENCE_PREFIX.length));
  }
  return { quiet, disabledKinds };
}

/* Datas civis no fuso do dispositivo: é nele que a pessoa vê o vencimento. */
export function civilDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function civilMonth(date: Date): string {
  return civilDay(date).slice(0, 7);
}

/** Semana ISO 8601 (`2026-W47`): segunda a domingo, a semana 1 contém a primeira quinta-feira. */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Dias civis inteiros de `from` até `to` (negativo quando `to` é anterior). */
export function civilDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}
