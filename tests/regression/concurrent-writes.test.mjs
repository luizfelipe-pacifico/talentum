import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Escritas concorrentes na API local.

   1. Editar um lançamento lia o estado fora da transação e gravava só pelo id:
      duas edições simultâneas registravam revisões com o mesmo "antes" e a
      segunda apagava a primeira sem aviso (lost update).
   2. Reverter um evento conferia `revertedAt` numa leitura e só marcava a
      reversão no fim: dois cliques simultâneos executavam a reversão duas vezes.

   Nos dois casos a condição precisa estar na própria escrita, e só uma das
   requisições pode vencer; a outra recebe 409. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('editar lançamento grava só se ele não mudou desde a leitura', async () => {
  const route = await read('src/app/api/transactions/[transactionId]/route.ts');
  const patch = route.slice(route.indexOf('export async function PATCH'));
  assert.doesNotMatch(patch, /transaction\.update\(\{\s*where:\s*\{\s*id:\s*transactionId\s*\}/);
  assert.match(patch, /transaction\.updateMany\(\{\s*where:\s*\{(?=[^}]*profileId)(?=[^}]*description:\s*current\.description)(?=[^}]*status:\s*current\.status)[^}]*\}/);
  assert.match(patch, /if\s*\(claimed\.count\s*!==\s*1\)\s*return true;[\s\S]*if\s*\(changed\)\s*return fail\('TRANSACTION_CHANGED'[\s\S]{0,120}409\)/);
});

test('reverter evento reivindica a reversão antes de executá-la', async () => {
  const route = await read('src/app/api/timeline-events/[timelineEventId]/revert/route.ts');
  const claim = route.search(/timelineEvent\.updateMany\(\{\s*where:\s*\{(?=[^}]*revertedAt:\s*null)(?=[^}]*profileId)[^}]*\}/);
  assert.ok(claim > 0, 'a reversão precisa ser marcada por uma escrita condicionada a revertedAt: null');
  const work = route.search(/revertImport\(|revertDecision\(/);
  assert.ok(claim < work, 'a reivindicação vem antes da reversão');
  assert.match(route, /TIMELINE_EVENT_NOT_REVERSIBLE[\s\S]{0,120}409/);
});
