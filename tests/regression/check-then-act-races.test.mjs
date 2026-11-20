import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Corridas do tipo "verifica e depois age" (docs/SECURITY.md, item aberto 19).

   1. `persistImport` lia os lançamentos existentes fora da transação: duas
      importações simultâneas de arquivos diferentes com linhas sem identificador
      de origem viam o mesmo banco e gravavam a mesma linha duas vezes.
   2. `POST /api/profile` e `POST /api/onboarding` perguntavam "existe perfil?"
      e criavam outro em seguida: dois cliques criavam dois `LocalProfile`.
   3. Reverter uma edição de lançamento restaurava o "antes" sem conferir que o
      lançamento ainda estava como a edição o deixou, apagando uma edição
      posterior sem aviso. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('a importação compara duplicados dentro da transação, depois de reservar a escrita', async () => {
  const source = await read('src/server/import/persist.ts');
  const persist = source.slice(source.indexOf('export async function persistImport'), source.indexOf('export async function revertImport'));
  assert.doesNotMatch(persist, /await db\.transaction\.findMany\(/, 'a leitura dos existentes não pode ficar fora da transação');
  const transaction = persist.slice(persist.indexOf('db.$transaction'));
  const reserve = transaction.indexOf('tx.importBatch.create(');
  const compare = transaction.indexOf('tx.transaction.findMany(');
  assert.ok(reserve > 0 && compare > 0, 'cria o lote e lê os existentes dentro da transação');
  assert.ok(reserve < compare, 'a primeira escrita reserva o banco antes da leitura, então a segunda importação espera');
});

test('o perfil local é único no banco e a criação é idempotente sob concorrência', async () => {
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /model LocalProfile \{[\s\S]*?singletonKey\s+String\s+@unique\s+@default\("local"\)/);
  const migrations = await readdir(new URL('prisma/migrations/', root));
  let found = false;
  for (const name of migrations.filter((entry) => /^\d+_/.test(entry))) {
    const sql = await read(`prisma/migrations/${name}/migration.sql`);
    if (/CREATE UNIQUE INDEX "LocalProfile_singletonKey_key"/.test(sql)) found = true;
  }
  assert.ok(found, 'uma migration cria o índice único do perfil');
  const profile = await read('src/server/profile.ts');
  assert.match(profile, /export async function ensureLocalProfile\(/);
  assert.match(profile, /prismaErrorKind\(error\) === 'conflict'/);
  for (const path of ['src/app/api/profile/route.ts', 'src/app/api/onboarding/route.ts']) {
    const route = await read(path);
    assert.doesNotMatch(route, /localProfile\.create\(/, path);
    assert.match(route, /ensureLocalProfile\(/, path);
  }
});

test('reverter uma edição só restaura se o lançamento ainda está como a edição deixou', async () => {
  const route = await read('src/app/api/timeline-events/[timelineEventId]/revert/route.ts');
  assert.match(route, /select:\{beforeJson:true,afterJson:true\}/);
  assert.match(route, /const after=JSON\.parse\(revision\.afterJson\)/);
  assert.match(route, /transaction\.updateMany\(\{where:\{id:event\.transactionId!,profileId:guarded\.profileId,description:after\.description,categoryId:after\.categoryId,status:after\.status\}/);
  assert.match(route, /restored\.count!==1\)throw new TimelineConflict\(\)/);
});
