import test from 'node:test';
import assert from 'node:assert/strict';

/* Restaurar um backup cifrado maior que 1 MiB era impossível.

   O middleware da API (src/server/body-limits.ts) aplicava o teto de JSON,
   1 MiB, a toda rota que não fosse o extrato. A rota de restauração de backup
   cifrado aceita até 200 MB (MAX_BACKUP_BYTES), mas qualquer arquivo de banco
   real passava de 1 MiB e recebia 413 antes de chegar a ela. Os dois limites
   foram escritos em paralelo e nunca se encontraram. */

const { bodyVerdict, MAX_JSON_BODY_BYTES } = await import('../../src/server/body-limits.ts');
const { MAX_BACKUP_BYTES } = await import('../../src/server/backup/encrypted.ts');

const ROUTE = '/api/encrypted-backups/restore';

test('o middleware deixa passar um backup cifrado dentro do limite da rota', () => {
  assert.deepEqual(bodyVerdict('POST', ROUTE, String(5 * 1024 * 1024)), { ok: true });
  assert.deepEqual(bodyVerdict('POST', ROUTE, String(MAX_BACKUP_BYTES)), { ok: true });
});

test('o backup cifrado continua com teto e com tamanho declarado obrigatório', () => {
  assert.deepEqual(bodyVerdict('POST', ROUTE, String(MAX_BACKUP_BYTES + 1024 * 1024)), { ok: false, status: 413, code: 'BODY_TOO_LARGE' });
  assert.deepEqual(bodyVerdict('POST', ROUTE, null), { ok: false, status: 411, code: 'LENGTH_REQUIRED' });
  // As demais rotas seguem no teto de JSON.
  assert.deepEqual(bodyVerdict('POST', '/api/vault/unlock', String(MAX_JSON_BODY_BYTES + 1)), { ok: false, status: 413, code: 'BODY_TOO_LARGE' });
});
