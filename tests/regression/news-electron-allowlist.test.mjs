import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Sem o host da fonte na lista do Electron, "Ler na fonte" não abria nada no
   app instalado: a janela nega novas janelas e só abre no navegador do sistema
   os hosts permitidos. A lista continua fechada: só o host da fonte entra. */

const root = new URL('../../', import.meta.url);

test('o link "Ler na fonte" da área Invest abre no navegador do sistema', async () => {
  const main = await readFile(new URL('electron/main.cjs', root), 'utf8');
  const list = main.match(/const EXTERNAL_HOSTS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(list, 'lista de hosts externos encontrada');
  const hosts = [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(hosts.includes('agenciabrasil.ebc.com.br'));
  assert.ok(hosts.every((host) => !host.includes('*')), 'sem curinga');
  assert.match(main, /parsed\.protocol === 'https:' && EXTERNAL_HOSTS\.has\(parsed\.hostname\)/);
});
