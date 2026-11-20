import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Gamificação (Stage 17): XP por hábitos úteis, com tetos, nunca por valores.
   Fatos sintéticos; o "agora" é fixo. */

const rules = await import('../src/server/gamification/rules.ts');
const NOW = new Date(2026, 10, 20, 10, 0, 0);
const at = (d, m = 10, h = 12) => new Date(2026, m, d, h, 0, 0);

const empty = {
  now: NOW,
  activeAccounts: [],
  imports: [],
  decisions: [],
  pendingReconciliation: 0,
  monthlyReviews: [],
  manualRestorePoints: [],
  monthsWithTransactions: [],
};

test('sem fatos, sem XP: nível 1 e conquistas bloqueadas', () => {
  const summary = rules.summarizeGamification(empty);
  assert.equal(summary.xp, 0);
  assert.equal(summary.level.level, 1);
  assert.equal(summary.level.nextFloor, 500);
  assert.ok(summary.badges.every((badge) => badge.unlockedAt === null));
});

test('importar várias vezes na mesma semana e conta conta uma vez', () => {
  const account = { id: 'a1', name: 'Conta sintética' };
  const summary = rules.summarizeGamification({
    ...empty,
    activeAccounts: [account],
    imports: [
      { accountId: 'a1', accountName: account.name, importedAt: at(16) },
      { accountId: 'a1', accountName: account.name, importedAt: at(17) },
      { accountId: 'a1', accountName: account.name, importedAt: at(18) },
    ],
  });
  // 50 pela semana + 100 pelo mês em dia (a única conta ativa recebeu extrato).
  assert.equal(summary.xp, rules.XP.importWeek + rules.XP.freshMonth);
  assert.equal(summary.badges.find((badge) => badge.id === 'primeiro-extrato').unlockedAt, at(16).toISOString());
});

test('conferências na conciliação têm teto diário', () => {
  const decisions = Array.from({ length: 25 }, (_, i) => ({ createdAt: at(20, 10, 8 + (i % 10)) }));
  const summary = rules.summarizeGamification({ ...empty, decisions });
  assert.equal(summary.xp, rules.DECISIONS_PER_DAY_CAP * rules.XP.reconciliationDecision);
  assert.ok(summary.badges.find((badge) => badge.id === 'conferente').unlockedAt);
});

test('três meses seguidos em dia liberam a conquista', () => {
  const account = { id: 'a1', name: 'Conta sintética' };
  const imports = [8, 9, 10].map((month) => ({ accountId: 'a1', accountName: account.name, importedAt: at(5, month) }));
  const summary = rules.summarizeGamification({ ...empty, activeAccounts: [account], imports });
  assert.equal(summary.badges.find((badge) => badge.id === 'tres-meses-em-dia').unlockedAt, at(5, 10).toISOString());
});

test('nível sobe nos limiares documentados', () => {
  assert.equal(rules.levelFor(499).level, 1);
  assert.equal(rules.levelFor(500).level, 2);
  assert.equal(rules.levelFor(7000).level, 5);
  assert.equal(rules.levelFor(7000).nextFloor, null);
});

test('missão de revisão aparece só para mês com lançamentos e grava o mês anterior', () => {
  assert.equal(rules.summarizeGamification(empty).missions.some((mission) => mission.id === 'revisar-mes'), false);
  const summary = rules.summarizeGamification({ ...empty, monthsWithTransactions: ['2026-10'] });
  const review = summary.missions.find((mission) => mission.id === 'revisar-mes');
  assert.equal(review.reviewMonth, '2026-10');
  assert.equal(review.title, 'Revise outubro de 2026');
  const done = rules.summarizeGamification({ ...empty, monthsWithTransactions: ['2026-10'], monthlyReviews: [{ month: '2026-10', createdAt: at(2) }] });
  assert.equal(done.missions.find((mission) => mission.id === 'revisar-mes').done, true);
  assert.equal(done.xp, rules.XP.monthReview);
});

test('só o mês atual ou o anterior, com lançamentos, podem ser revisados', () => {
  assert.equal(rules.canReviewMonth('2026-10', NOW, ['2026-10']), true);
  assert.equal(rules.canReviewMonth('2026-11', NOW, ['2026-11']), true);
  assert.equal(rules.canReviewMonth('2026-09', NOW, ['2026-09']), false);
  assert.equal(rules.canReviewMonth('2026-10', NOW, []), false);
  assert.equal(rules.canReviewMonth('2026-13', NOW, ['2026-13']), false);
});

test('a regra não conhece valores em dinheiro: XP nunca premia gastar ou aportar', async () => {
  const source = await readFile(new URL('../src/server/gamification/rules.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // A entrada da regra é o contrato: nenhum campo dela carrega dinheiro.
  const input = code.slice(code.indexOf('export type GamificationInput'), code.indexOf('export type LedgerEntry'));
  assert.ok(input.length > 0);
  assert.doesNotMatch(input, /amount|cents|balance|price|contribution/i);
  assert.doesNotMatch(code, /amountCents|balanceCents|ranking|leaderboard/i);
});
