import test from 'node:test';
import assert from 'node:assert/strict';

/* Central de notificações (Stage 10): regras puras, deduplicação, estado e
   preferências. Datas e nomes sintéticos; o "agora" é fixo. */

const engine = await import('../src/server/notifications/engine.ts');
const rules = await import('../src/server/notifications/rules.ts');

const NOW = new Date(2026, 10, 20, 10, 0, 0); // 20 de novembro de 2026, horário local
const day = (d, m = 10, y = 2026) => new Date(y, m, d, 12, 0, 0);
const none = { quiet: false, disabledKinds: new Set() };

test('obrigação vencida é crítica, a vencer é aviso, distante não aparece', () => {
  const items = rules.deriveObligationNotifications(
    [
      { id: 'o1', description: 'Aluguel sintético', amountCents: 150000n, dueDate: day(18) },
      { id: 'o2', description: 'Internet sintética', amountCents: 9990n, dueDate: day(21) },
      { id: 'o3', description: 'Seguro sintético', amountCents: 5000n, dueDate: day(30) },
      { id: 'o4', description: 'Luz sintética', amountCents: 12000n, dueDate: day(20) },
    ],
    NOW,
  );
  const byId = Object.fromEntries(items.map((item) => [item.subject, item]));
  assert.equal(byId.o1.kind, 'obligation_overdue');
  assert.equal(byId.o1.severity, 'critical');
  assert.match(byId.o1.title, /venceu em 18 de novembro$/);
  assert.equal(byId.o2.kind, 'obligation_due');
  assert.match(byId.o2.title, /vence amanhã/);
  assert.match(byId.o4.title, /vence hoje/);
  assert.equal(byId.o3, undefined);
  // Nenhum texto leva valor formatado: o valor vai em centavos para a interface.
  for (const item of items) assert.doesNotMatch(`${item.title} ${item.body}`, /R\$|\d+,\d{2}/);
  assert.equal(byId.o1.amountCents, 150000n);
});

test('a chave é estável por tipo, assunto e período, e a semana ISO está certa', () => {
  assert.equal(engine.notificationKey({ kind: 'obligation_due', subject: 'abc-1', period: '2026-11-21' }), 'obligation_due:abc-1:2026-11-21');
  assert.equal(engine.notificationKey({ kind: 'x_y', subject: '../../etc', period: 'a b' }), 'x_y:etc:ab');
  assert.equal(engine.isoWeek(new Date(2026, 10, 20)), '2026-W47');
  assert.equal(engine.isoWeek(new Date(2027, 0, 1)), '2026-W53');
  assert.match(engine.notificationKey({ kind: 'reconciliation_pending', subject: 'queue', period: '2026-W47' }), engine.KEY_PATTERN);
});

test('mesma chave de duas fontes vira uma notificação, com a maior gravidade', () => {
  const base = { kind: 'obligation_due', subject: 'o1', period: '2026-11-21', title: 't', body: 'b', href: '/x', actionLabel: 'a', occurredAt: NOW };
  const center = engine.buildNotificationCenter([{ ...base, severity: 'info' }, { ...base, severity: 'critical' }], [], none);
  assert.equal(center.notifications.length, 1);
  assert.equal(center.notifications[0].severity, 'critical');
});

test('lida conta fora do sino, dispensada some, e a ordem põe não lidas e graves primeiro', () => {
  const make = (subject, severity) => ({ kind: 'k_a', subject, period: 'once', severity, title: subject, body: '', href: '/', actionLabel: 'Abrir', occurredAt: NOW });
  const center = engine.buildNotificationCenter(
    [make('lida', 'critical'), make('info', 'info'), make('grave', 'critical'), make('fora', 'warning')],
    [
      { key: 'k_a:lida:once', readAt: NOW, dismissedAt: null },
      { key: 'k_a:fora:once', readAt: null, dismissedAt: NOW },
    ],
    none,
  );
  assert.deepEqual(center.notifications.map((item) => item.title), ['grave', 'info', 'lida']);
  assert.equal(center.unreadCount, 2);
  assert.equal(center.badgeCount, 2);
  assert.equal(center.dismissedCount, 1);
});

test('modo silencioso esconde o número do sino, e tipo desligado não aparece', () => {
  const candidate = { kind: 'k_a', subject: 's', period: 'once', severity: 'info', title: 't', body: '', href: '/', actionLabel: 'a', occurredAt: NOW };
  const quiet = engine.buildNotificationCenter([candidate], [], { quiet: true, disabledKinds: new Set() });
  assert.equal(quiet.badgeCount, null);
  assert.equal(quiet.unreadCount, 1);
  const off = engine.buildNotificationCenter([candidate], [], { quiet: false, disabledKinds: new Set(['k_a']) });
  assert.equal(off.notifications.length, 0);
});

test('link externo nunca vira destino de notificação', () => {
  const candidate = { kind: 'k_a', subject: 's', period: 'once', severity: 'info', title: 't', body: '', href: '//exemplo.invalid', actionLabel: 'a', occurredAt: NOW };
  assert.equal(engine.buildNotificationCenter([candidate], [], none).notifications.length, 0);
});

test('preferências lidas de UserPreference', () => {
  const prefs = engine.preferencesFromRows([
    { key: 'notifications.quiet', value: 'on' },
    { key: 'notifications.kind.import_stale', value: 'off' },
    { key: 'notifications.kind.obligation_due', value: 'on' },
  ]);
  assert.equal(prefs.quiet, true);
  assert.deepEqual([...prefs.disabledKinds], ['import_stale']);
});

test('fila de conciliação avisa uma vez por semana; vazia não avisa', () => {
  assert.deepEqual(rules.deriveReconciliationNotification(0, null, NOW), []);
  const [item] = rules.deriveReconciliationNotification(3, day(10), NOW);
  assert.equal(item.period, '2026-W47');
  assert.equal(item.title, '3 lançamentos aguardam conferência');
  assert.equal(rules.deriveReconciliationNotification(1, null, NOW)[0].title, '1 lançamento aguarda conferência');
});

test('extrato antigo avisa por conta e por mês; conta sem extrato não é cobrada', () => {
  const items = rules.deriveStaleImportNotifications(
    [
      { id: 'a1', name: 'Conta sintética A', lastCoveredDay: day(1, 9) },
      { id: 'a2', name: 'Conta sintética B', lastCoveredDay: day(15) },
      { id: 'a3', name: 'Conta sintética C', lastCoveredDay: null },
    ],
    NOW,
  );
  assert.deepEqual(items.map((item) => item.subject), ['a1']);
  assert.equal(items[0].period, '2026-11');
  assert.match(items[0].title, /cobre até 1 de outubro/);
});

test('linhas não lidas em importação recente geram aviso com link para o lote', () => {
  const items = rules.deriveImportIssueNotifications(
    [
      { id: 'b1', fileName: 'extrato-sintetico.csv', importedAt: day(19), errorCount: 2 },
      { id: 'b2', fileName: null, importedAt: day(19), errorCount: 0 },
      { id: 'b3', fileName: null, importedAt: day(1, 8), errorCount: 4 },
    ],
    NOW,
  );
  assert.deepEqual(items.map((item) => item.href), ['/extratos/importar/b1']);
  assert.match(items[0].title, /^2 linhas não foram lidas/);
});

test('ponto de restauração antigo só avisa quando há dados', () => {
  assert.deepEqual(rules.deriveRestorePointNotification(null, false, NOW), []);
  assert.equal(rules.deriveRestorePointNotification(null, true, NOW)[0].title, 'Nenhum ponto de restauração criado');
  assert.deepEqual(rules.deriveRestorePointNotification(day(10), true, NOW), []);
  assert.match(rules.deriveRestorePointNotification(day(1, 8), true, NOW)[0].title, /1 de setembro/);
});

test('ano aparece na data quando não é o ano corrente', () => {
  assert.equal(rules.formatDay(new Date(2025, 11, 31), NOW), '31 de dezembro de 2025');
});
