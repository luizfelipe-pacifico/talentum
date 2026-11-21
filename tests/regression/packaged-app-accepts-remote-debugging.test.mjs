import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (revisão ofensiva do pacote real, 20/11/2026): o app empacotado
   aceitava `--remote-debugging-port` e `--remote-debugging-pipe`. Qualquer
   programa do mesmo usuário podia abrir o Talentum com a porta de depuração,
   esperar o desbloqueio e ler a tela, executar código na página e usar a
   sessão local. Os fuses do Electron já desligam `--inspect` e
   NODE_OPTIONS, mas não cobrem as chaves do Chromium.

   Regra: empacotado, o app recusa iniciar com qualquer chave de depuração e
   encerra antes de criar janela ou servidor. Em desenvolvimento (não
   empacotado) a depuração continua disponível. */

const main = await readFile(new URL('../../electron/main.cjs', import.meta.url), 'utf8');

test('o app empacotado encerra quando recebe chave de depuração', () => {
  const guard = main.match(/const DEBUG_SWITCHES = \[([^\]]+)\]/)?.[1] ?? '';
  for (const name of ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'inspect', 'inspect-brk', 'remote-allow-origins']) {
    assert.ok(guard.includes(`'${name}'`), name);
  }
  assert.match(main, /app\.isPackaged && DEBUG_SWITCHES\.some\(\(name\) => app\.commandLine\.hasSwitch\(name\)\)/);
  const exit = main.search(/app\.exit\(1\)/);
  const ready = main.search(/app\.whenReady\(\)/);
  assert.ok(exit > 0 && exit < ready, 'a recusa vem antes de qualquer janela ou servidor');
});
