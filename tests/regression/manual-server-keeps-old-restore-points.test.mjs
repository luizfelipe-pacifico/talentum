import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito: `pnpm test:manual` promete um banco novo, mas a pasta
   `talentum-backups/` ao lado dele sobrevivia entre execuções. A tela
   "Dados e backup" listava pontos de restauração de um cofre anterior, cifrados
   com outra chave, como se estivessem disponíveis. O servidor isolado tem de
   apagar também os pontos de restauração da execução anterior. */

test('o servidor isolado apaga os pontos de restauração da execução anterior', async () => {
  const source = await readFile(new URL('../../scripts/e2e-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /talentum-backups/, 'a limpeza inicial não cita talentum-backups');
  assert.match(source, /rmSync\(resolve\([^)]*'talentum-backups'\),\s*\{\s*recursive: true/, 'talentum-backups não é removida recursivamente');
});
