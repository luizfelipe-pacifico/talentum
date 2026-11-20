import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* No aplicativo empacotado, o segredo de bootstrap era gerado no processo
   principal e posto só no ambiente do servidor local. O preload, em sandbox,
   lia `process.env`, onde o segredo não existe: a janela pedia códigos de ação
   sem o segredo e recebia 403 BOOTSTRAP_DENIED em toda requisição.

   O segredo chega ao renderer por IPC, só para a janela do próprio app, e
   nunca por argumento de linha de comando (visível em listagens de processo). */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o renderer recebe o segredo de bootstrap por IPC confiável', async () => {
  const main = await read('electron/main.cjs');
  const preload = await read('electron/preload.cjs');
  const client = await read('src/lib/api-client.ts');

  assert.doesNotMatch(preload, /process\.env\.TALENTUM_LOCAL_BOOTSTRAP_SECRET/, 'o preload não enxerga o ambiente do servidor');
  assert.match(preload, /bootstrapSecret:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:bootstrap-secret'\)/);
  assert.match(main, /ipcMain\.handle\('app:bootstrap-secret',\s*\(event\)\s*=>\s*\(?trustedSender\(event\)\s*\?\s*bootstrapSecret/);
  assert.match(main, /TALENTUM_LOCAL_BOOTSTRAP_SECRET:\s*bootstrapSecret/, 'o servidor e a janela usam o mesmo segredo');
  assert.doesNotMatch(main, /additionalArguments[\s\S]{0,80}bootstrap/i);
  assert.match(client, /await window\.talentumWindow\?\.bootstrapSecret\?\.\(\)/);
});
