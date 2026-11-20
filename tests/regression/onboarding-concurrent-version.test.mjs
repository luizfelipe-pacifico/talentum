import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Duas janelas salvando a mesma etapa do primeiro acesso com a mesma versão
   passavam juntas: a versão era conferida numa leitura e o incremento vinha
   depois, numa escrita separada. A segunda gravação sobrescrevia a primeira em
   silêncio, em vez de receber 409. A versão precisa ser conferida pela própria
   escrita, dentro da transação, e só uma delas pode vencer. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('salvar etapa do onboarding confere a versão na própria escrita', async () => {
  const route = await read('src/app/api/onboarding/[onboardingId]/route.ts');
  const transaction = route.slice(route.indexOf('$transaction'));
  assert.match(
    transaction,
    /onboardingSession\.updateMany\(\{\s*where:\s*\{(?=[^}]*version:\s*parsed\.data\.version)(?=[^}]*profileId)[^}]*\}/,
    'o incremento de versão precisa ser condicionado à versão lida',
  );
  // Quem perde a disputa não grava resposta nenhuma e recebe 409.
  assert.match(transaction, /if \(claimed\.count !== 1\) return true;[\s\S]*if \(changed\) return fail\('ONBOARDING_CHANGED'[\s\S]{0,120}409\)/);
  assert.doesNotMatch(transaction, /onboardingSession\.update\(\{\s*where:\s*\{\s*id: onboardingId\s*\}/);
});
