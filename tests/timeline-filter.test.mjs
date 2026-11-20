import test from 'node:test';
import assert from 'node:assert/strict';

/* Filtro da linha do tempo por domínio e período (Stage 11). */

const filter = await import('../src/server/timeline-filter.ts');
const parse = (query) => filter.parseTimelineQuery(new URLSearchParams(query));

test('domínio vira lista de tipos', () => {
  assert.deepEqual(parse('domain=data').kinds, [...filter.TIMELINE_DOMAINS.data]);
  assert.deepEqual(parse('kind=import').kinds, ['import']);
  assert.equal(parse('').kinds, null);
});

test('período semiaberto, em ordem e limitado', () => {
  const ok = parse('from=2026-11-01T03:00:00.000Z&to=2026-12-01T03:00:00.000Z');
  assert.equal(ok.from.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(parse('from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z'), null);
  assert.equal(parse('from=2000-01-01T00:00:00Z&to=2026-01-01T00:00:00Z'), null);
  assert.ok(parse('from=2026-11-01T00:00:00-03:00'));
});

test('recusa filtro inválido, desconhecido, repetido ou contraditório', () => {
  for (const query of ['domain=tudo', 'kind=drop', 'from=ontem', 'cursor=1', 'extra=1', 'kind=import&kind=reconciliation', 'domain=imports&kind=reconciliation'])
    assert.equal(parse(query), null, query);
  assert.ok(parse('domain=imports&kind=import'));
});

test('cada tipo pertence a um domínio só', () => {
  const seen = new Set();
  for (const kinds of Object.values(filter.TIMELINE_DOMAINS)) for (const kind of kinds) {
    assert.equal(seen.has(kind), false, kind);
    seen.add(kind);
  }
  assert.equal(filter.domainOf('restore_point'), 'data');
  assert.equal(filter.domainOf('desconhecido'), null);
});
