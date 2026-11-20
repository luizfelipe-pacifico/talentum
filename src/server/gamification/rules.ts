/* Gamificação: XP, níveis, missões e conquistas, todos derivados.

   Regra de produto (docs/ROADMAP.md, Stage 17): XP premia hábitos que mantêm
   os dados úteis — importar extratos, conferir a fila de conciliação, manter
   as contas em dia, revisar o mês, guardar um ponto de restauração. Nunca
   premia gastar, aportar ou qualquer valor: nenhuma entrada deste módulo tem
   valor monetário, de propósito. Não existe ranking nem comparação com outras
   pessoas.

   Tudo é calculado a partir de fatos que ainda existem. Desfazer uma
   importação tira o XP que ela deu; isso é honesto, e evita um placar que
   conta o que já não está lá. A única coisa gravada só para a gamificação é a
   revisão mensal (`MonthlyReview`), porque ela não deixa outro rastro.

   Tetos impedem fazer XP com repetição: uma importação por conta por semana,
   dez conferências por dia.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { civilDay, civilMonth, isoWeek } from '../notifications/engine.ts';

export const XP = {
  importWeek: 50,
  reconciliationDecision: 5,
  freshMonth: 100,
  monthReview: 100,
  restorePointMonth: 30,
} as const;

export const DECISIONS_PER_DAY_CAP = 10;

export const LEVELS = [
  { level: 1, title: 'Primeiros passos', floor: 0 },
  { level: 2, title: 'Rotina em construção', floor: 500 },
  { level: 3, title: 'Dados em dia', floor: 1500 },
  { level: 4, title: 'Controle consistente', floor: 3500 },
  { level: 5, title: 'Hábito consolidado', floor: 7000 },
] as const;

export type GamificationInput = {
  now: Date;
  activeAccounts: { id: string; name: string }[];
  imports: { accountId: string | null; accountName: string | null; importedAt: Date }[];
  /** Decisões de conciliação ainda válidas (não revertidas). */
  decisions: { createdAt: Date }[];
  pendingReconciliation: number;
  monthlyReviews: { month: string; createdAt: Date }[];
  /** Pontos de restauração criados pela própria pessoa. */
  manualRestorePoints: { createdAt: Date }[];
  /** Meses (AAAA-MM) com ao menos um lançamento: só eles podem ser revisados. */
  monthsWithTransactions: string[];
};

export type LedgerEntry = { date: string; xp: number; reason: string };

export type Badge = { id: string; title: string; description: string; unlockedAt: string | null };

export type Mission = {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  done: boolean;
  reward: string;
  href: string | null;
  /** Rótulo do link: verbo e objeto (docs/DESIGN-SYSTEM.md, UX writing 2). */
  actionLabel: string | null;
  /** Mês que a missão de revisão grava, quando a ação é feita nesta tela. */
  reviewMonth: string | null;
};

export type GamificationSummary = {
  xp: number;
  level: { level: number; title: string; floor: number; nextFloor: number | null; nextTitle: string | null };
  ledger: LedgerEntry[];
  badges: Badge[];
  missions: Mission[];
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `${MONTHS[number - 1]} de ${year}`;
}

export function previousMonth(date: Date): string {
  return civilMonth(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function levelFor(xp: number) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (xp >= LEVELS[i].floor) index = i;
  const next = LEVELS[index + 1] ?? null;
  return { ...LEVELS[index], nextFloor: next?.floor ?? null, nextTitle: next?.title ?? null };
}

/** Meses consecutivos (AAAA-MM) terminando em `month`, todos presentes em `set`. */
function consecutiveRunEndingAt(set: Set<string>, month: string): number {
  let run = 0;
  let [year, number] = month.split('-').map(Number);
  while (set.has(`${year}-${String(number).padStart(2, '0')}`)) {
    run += 1;
    number -= 1;
    if (number === 0) {
      number = 12;
      year -= 1;
    }
  }
  return run;
}

export function summarizeGamification(input: GamificationInput): GamificationSummary {
  const ledger: (LedgerEntry & { at: Date })[] = [];
  const activeIds = new Set(input.activeAccounts.map((account) => account.id));

  // Importação: uma por conta por semana ISO.
  const importWeeks = new Map<string, { at: Date; name: string }>();
  for (const batch of [...input.imports].sort((a, b) => a.importedAt.getTime() - b.importedAt.getTime())) {
    const key = `${batch.accountId ?? 'sem-conta'}|${isoWeek(batch.importedAt)}`;
    if (!importWeeks.has(key)) importWeeks.set(key, { at: batch.importedAt, name: batch.accountName ?? 'conta sem nome' });
  }
  for (const { at, name } of importWeeks.values())
    ledger.push({ at, date: at.toISOString(), xp: XP.importWeek, reason: `Extrato importado da conta ${name}` });

  // Conciliação: até dez decisões por dia.
  const perDay = new Map<string, Date[]>();
  for (const decision of input.decisions) {
    const day = civilDay(decision.createdAt);
    perDay.set(day, [...(perDay.get(day) ?? []), decision.createdAt]);
  }
  for (const dates of perDay.values()) {
    const counted = Math.min(dates.length, DECISIONS_PER_DAY_CAP);
    const at = dates.sort((a, b) => a.getTime() - b.getTime())[counted - 1];
    ledger.push({
      at,
      date: at.toISOString(),
      xp: counted * XP.reconciliationDecision,
      reason: counted === 1 ? '1 lançamento conferido na conciliação' : `${counted} lançamentos conferidos na conciliação`,
    });
  }

  // Mês em dia: toda conta ativa recebeu extrato no mês.
  const accountsByMonth = new Map<string, { accounts: Set<string>; last: Date }>();
  for (const batch of input.imports) {
    if (!batch.accountId || !activeIds.has(batch.accountId)) continue;
    const month = civilMonth(batch.importedAt);
    const entry = accountsByMonth.get(month) ?? { accounts: new Set<string>(), last: batch.importedAt };
    entry.accounts.add(batch.accountId);
    if (batch.importedAt > entry.last) entry.last = batch.importedAt;
    accountsByMonth.set(month, entry);
  }
  const freshMonths = new Set<string>();
  if (activeIds.size > 0) {
    for (const [month, entry] of accountsByMonth) {
      if (entry.accounts.size < activeIds.size) continue;
      freshMonths.add(month);
      ledger.push({ at: entry.last, date: entry.last.toISOString(), xp: XP.freshMonth, reason: `Todas as contas em dia em ${monthLabel(month)}` });
    }
  }

  for (const review of input.monthlyReviews)
    ledger.push({ at: review.createdAt, date: review.createdAt.toISOString(), xp: XP.monthReview, reason: `Mês revisado: ${monthLabel(review.month)}` });

  const restoreMonths = new Map<string, Date>();
  for (const point of input.manualRestorePoints) {
    const month = civilMonth(point.createdAt);
    const seen = restoreMonths.get(month);
    if (!seen || point.createdAt < seen) restoreMonths.set(month, point.createdAt);
  }
  for (const at of restoreMonths.values())
    ledger.push({ at, date: at.toISOString(), xp: XP.restorePointMonth, reason: 'Ponto de restauração criado' });

  ledger.sort((a, b) => b.at.getTime() - a.at.getTime());
  const xp = ledger.reduce((sum, entry) => sum + entry.xp, 0);

  const sortedImports = [...input.imports].sort((a, b) => a.importedAt.getTime() - b.importedAt.getTime());
  const sortedDecisions = [...input.decisions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const weeksInOrder = [...importWeeks.values()].map((week) => week.at).sort((a, b) => a.getTime() - b.getTime());
  const freshInOrder = [...freshMonths].sort();
  let threeFreshAt: Date | null = null;
  for (const month of freshInOrder) {
    if (consecutiveRunEndingAt(freshMonths, month) >= 3) {
      threeFreshAt = accountsByMonth.get(month)?.last ?? null;
      break;
    }
  }
  const firstReview = [...input.monthlyReviews].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const firstRestore = [...input.manualRestorePoints].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

  const badges: Badge[] = [
    { id: 'primeiro-extrato', title: 'Primeiro extrato', description: 'Importar o primeiro extrato.', unlockedAt: iso(sortedImports[0]?.importedAt) },
    { id: 'dez-semanas', title: 'Dez semanas de extrato', description: 'Importar extratos em dez semanas diferentes.', unlockedAt: iso(weeksInOrder[9]) },
    { id: 'conferente', title: 'Conferente', description: 'Conferir dez lançamentos na conciliação.', unlockedAt: iso(sortedDecisions[9]?.createdAt) },
    { id: 'tres-meses-em-dia', title: 'Três meses em dia', description: 'Manter todas as contas em dia por três meses seguidos.', unlockedAt: iso(threeFreshAt) },
    { id: 'mes-revisado', title: 'Mês revisado', description: 'Revisar um mês completo pela primeira vez.', unlockedAt: iso(firstReview?.createdAt) },
    { id: 'copia-guardada', title: 'Cópia guardada', description: 'Criar o primeiro ponto de restauração.', unlockedAt: iso(firstRestore?.createdAt) },
  ];

  const week = isoWeek(input.now);
  const month = civilMonth(input.now);
  const accountsThisWeek = new Set(input.imports.filter((b) => b.accountId && activeIds.has(b.accountId) && isoWeek(b.importedAt) === week).map((b) => b.accountId));
  const accountsThisMonth = accountsByMonth.get(month)?.accounts.size ?? 0;
  const lastMonth = previousMonth(input.now);
  const reviewed = new Set(input.monthlyReviews.map((review) => review.month));

  const missions: Mission[] = [];
  if (activeIds.size > 0) {
    missions.push({
      id: 'extrato-da-semana',
      title: 'Importe o extrato desta semana',
      description: 'Um extrato por conta mantém os gastos e o saldo atualizados.',
      current: accountsThisWeek.size,
      target: activeIds.size,
      done: accountsThisWeek.size >= activeIds.size,
      reward: `${XP.importWeek} XP por conta`,
      href: '/extratos/importar',
      actionLabel: 'Importar extrato',
      reviewMonth: null,
    });
    missions.push({
      id: 'mes-em-dia',
      title: `Deixe todas as contas em dia em ${monthLabel(month)}`,
      description: 'Cada conta ativa com ao menos um extrato importado neste mês.',
      current: Math.min(accountsThisMonth, activeIds.size),
      target: activeIds.size,
      done: accountsThisMonth >= activeIds.size,
      reward: `${XP.freshMonth} XP`,
      href: '/extratos/importar',
      actionLabel: 'Importar extrato',
      reviewMonth: null,
    });
  }
  if (input.pendingReconciliation > 0 || input.decisions.length > 0) {
    missions.push({
      id: 'fila-zerada',
      title: 'Zere a fila de conciliação',
      description: 'Confirme ou corrija os lançamentos que ficaram em dúvida.',
      current: input.pendingReconciliation === 0 ? 1 : 0,
      target: 1,
      done: input.pendingReconciliation === 0,
      reward: `${XP.reconciliationDecision} XP por lançamento, até ${DECISIONS_PER_DAY_CAP} por dia`,
      href: '/conciliacao',
      actionLabel: 'Abrir conciliação',
      reviewMonth: null,
    });
  }
  if (input.monthsWithTransactions.includes(lastMonth)) {
    missions.push({
      id: 'revisar-mes',
      title: `Revise ${monthLabel(lastMonth)}`,
      description: 'Confira no dashboard os gastos por categoria e o fluxo do mês, e marque o mês como revisado.',
      current: reviewed.has(lastMonth) ? 1 : 0,
      target: 1,
      done: reviewed.has(lastMonth),
      reward: `${XP.monthReview} XP`,
      href: '/dashboard',
      actionLabel: 'Abrir o dashboard',
      reviewMonth: lastMonth,
    });
  }
  const restoreThisMonth = restoreMonths.has(month);
  missions.push({
    id: 'ponto-do-mes',
    title: 'Crie um ponto de restauração neste mês',
    description: 'Uma cópia dos seus dados neste computador, para voltar a ela se algo der errado.',
    current: restoreThisMonth ? 1 : 0,
    target: 1,
    done: restoreThisMonth,
    reward: `${XP.restorePointMonth} XP`,
    href: '/perfil/privacidade',
    actionLabel: 'Criar ponto de restauração',
    reviewMonth: null,
  });

  const level = levelFor(xp);
  return {
    xp,
    level: { level: level.level, title: level.title, floor: level.floor, nextFloor: level.nextFloor, nextTitle: level.nextTitle },
    ledger: ledger.slice(0, 20).map(({ at: _at, ...entry }) => entry),
    badges,
    missions,
  };
}

/** A revisão só vale para o mês atual ou o anterior, e só para mês com lançamentos. */
export function canReviewMonth(month: string, now: Date, monthsWithTransactions: string[]): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  if (month !== civilMonth(now) && month !== previousMonth(now)) return false;
  return monthsWithTransactions.includes(month);
}
