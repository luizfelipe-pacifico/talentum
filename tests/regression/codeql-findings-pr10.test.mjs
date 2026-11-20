import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Achados do CodeQL no PR #10 (20/11/2026), cada um confirmado no código:

   1. `secureRemove` consultava o tamanho com `stat` e só depois abria o
      arquivo. Se o caminho fosse trocado por um link simbólico nesse intervalo
      (ou já fosse um), a sobrescrita com bytes aleatórios destruía o arquivo
      apontado. Agora abre sem seguir links e mede pelo próprio descritor.
   2. `parseTimelineQuery` gravava cada parâmetro num objeto comum: a chave
      `__proto__` tocava o protótipo e `toString` era tida como repetida.
   3. `parsePercentToBps` trocava só a primeira vírgula e o primeiro `%`.
   4. O código de recuperação do MFA sorteia letras com `byte % 32`. Com 32
      símbolos não há viés, mas a regra passa a ser explícita: máscara de bits
      e um alfabeto de exatamente 32 símbolos. */

const root = new URL('../../', import.meta.url);

test('secureRemove não segue link simbólico nem sobrescreve o arquivo apontado', async () => {
  const { secureRemove } = await import(new URL('src/server/vault/database.ts', root).href);
  const dir = await mkdtemp(join(tmpdir(), 'talentum-secure-remove-'));
  try {
    const victim = join(dir, 'outro-arquivo.txt');
    await writeFile(victim, 'conteúdo que não pode ser destruído');
    const link = join(dir, 'talentum.db');
    await symlink(victim, link);
    await secureRemove(link).catch(() => undefined);
    assert.equal(await readFile(victim, 'utf8'), 'conteúdo que não pode ser destruído');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('o filtro da linha do tempo não aceita chaves do protótipo', async () => {
  const { parseTimelineQuery } = await import(new URL('src/server/timeline-filter.ts', root).href);
  assert.equal(parseTimelineQuery(new URLSearchParams('__proto__=x')), null);
  assert.equal(parseTimelineQuery(new URLSearchParams('constructor=x')), null);
  assert.notEqual(parseTimelineQuery(new URLSearchParams('domain=imports')), null);
  const source = await readFile(new URL('src/server/timeline-filter.ts', root), 'utf8');
  assert.match(source, /Object\.fromEntries\(entries\)/);
});

test('taxa em porcentagem aceita símbolo e vírgula repetidos sem ambiguidade', async () => {
  const { parsePercentToBps } = await import(new URL('src/lib/money-input.ts', root).href);
  assert.equal(parsePercentToBps('12,5%'), 1250);
  assert.equal(parsePercentToBps('12,5 %%'), null);
  const source = await readFile(new URL('src/lib/money-input.ts', root), 'utf8');
  assert.doesNotMatch(source, /\.replace\('%', ''\)/);
});

test('código de recuperação do MFA usa 32 símbolos e máscara de bits', async () => {
  const source = await readFile(new URL('cloudflare/src/mfa/routes.ts', root), 'utf8');
  const alphabet = source.match(/const RECOVERY_ALPHABET = '([^']+)'/)?.[1] ?? '';
  assert.equal(alphabet.length, 32);
  assert.equal(new Set(alphabet).size, 32);
  assert.doesNotMatch(source, /% RECOVERY_ALPHABET\.length/);
  assert.match(source, /RECOVERY_ALPHABET\[b & 0x1f\]/);
});
