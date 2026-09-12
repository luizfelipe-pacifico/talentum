import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('onboarding possui tabelas relacionais e migration versionada', async () => {
  const sql = await read('prisma/migrations/20260912180000_mvp_onboarding/migration.sql');
  for (const table of ['OnboardingSession', 'OnboardingAnswer']) assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(sql, /FOREIGN KEY \("profileId"\)/);
  assert.match(sql, /FOREIGN KEY \("onboardingSessionId"\)/);
  assert.match(sql, /UNIQUE INDEX "OnboardingAnswer_onboardingSessionId_questionKey_key"/);
});

test('todas as APIs do onboarding exigem código de ação', async () => {
  for (const path of [
    'src/app/api/onboarding/route.ts',
    'src/app/api/onboarding/[onboardingId]/route.ts',
    'src/app/api/onboarding/[onboardingId]/complete/route.ts',
  ]) {
    const source = await read(path);
    assert.match(source, /requireActionCode|guardWithProfile/, path);
  }
});

test('onboarding aplica propriedade, concorrência e conclusão explícita', async () => {
  const update = await read('src/app/api/onboarding/[onboardingId]/route.ts');
  const complete = await read('src/app/api/onboarding/[onboardingId]/complete/route.ts');
  assert.match(update, /profileId: guarded\.profileId/);
  assert.match(update, /session\.version !== parsed\.data\.version/);
  assert.match(complete, /privacyAccepted/);
  assert.match(complete, /status: 'completed'/);
});

test('as quatro rotas de interface usam o fluxo persistente', async () => {
  for (const step of ['perfil', 'contas', 'posicao-atual', 'revisao']) {
    const source = await read(`src/app/onboarding/${step}/page.tsx`);
    assert.match(source, /<Onboarding step=/);
  }
  const component = await read('src/components/onboarding.tsx');
  assert.match(component, /GET|postJson/);
  assert.doesNotMatch(component, /localStorage|sessionStorage/);
});
