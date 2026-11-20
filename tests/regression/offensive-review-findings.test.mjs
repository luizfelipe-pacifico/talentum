import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseOfx } from '../../src/server/import/ofx.ts';
import { parseAmountCents } from '../../src/server/import/values.ts';

/* Achados da revisão ofensiva da integração da conclusão do MVP. Cada teste
   descreve o ataque que ele impede. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o instalador não empacota .env, segredos locais, bancos nem chaves', async () => {
  // O Next copia o .env da raiz para .next/standalone, e o electron-builder
  // empacotava a pasta inteira, sem asar: o segredo do BFF iria em texto puro
  // no instalador publicado.
  const pkg = JSON.parse(await read('package.json'));
  for (const pattern of ['!**/.env*', '!**/.dev.vars*', '!**/*.db*', '!**/*.key'])
    assert.ok(pkg.build.files.includes(pattern), `build.files sem ${pattern}`);
  const prepare = await read('scripts/desktop-prepare.mjs');
  assert.match(prepare, /\.next\/standalone[\s\S]{0,200}\.env/, 'o preparo remove .env copiado pelo Next');
});

test('o app empacotado não carrega endereço vindo do ambiente', async () => {
  // Uma variável TALENTUM_URL plantada no perfil do usuário fazia a janela
  // confiável, com o preload, abrir uma página remota parecida com o app.
  const main = await read('electron/main.cjs');
  assert.match(main, /app\.isPackaged\s*\?\s*null\s*:\s*process\.env\.TALENTUM_URL/);
  assert.match(main, /isLoopbackUrl\(/);
});

test('a chave local nasce com permissão restrita', async () => {
  // Gravar com a máscara padrão e só depois aplicar chmod deixava a chave
  // legível por outro usuário durante um intervalo; o diretório também.
  const key = await read('src/server/local-key.ts');
  assert.match(key, /writeFile\(path, generated, \{ flag: 'wx', mode: 0o600 \}\)/);
  assert.match(key, /mkdir\(dirname\(path\), \{ recursive: true, mode: 0o700 \}\)/);
});

test('a descrição do OFX não carrega caracteres de controle nem inversão de direção', () => {
  // Entidades numéricas eram decodificadas depois do filtro de controle:
  // &#0; e &#x202E; chegavam à interface e falsificavam a leitura do texto.
  const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0001<ACCTID>1<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260601<DTEND>20260630
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260602<TRNAMT>-1.00<FITID>SYNTH-1<MEMO>PAGO&#0;A&#x202E;FNOC&#xFFFFFF;</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const [row] = parseOfx(ofx).entries;
  assert.doesNotMatch(row.description, /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
  assert.match(row.description, /PAGO/);
});

test('valor importado tem teto e não envenena os totais', () => {
  // Um extrato hostil com valores perto do limite de int64 era aceito e fazia
  // o fluxo de caixa somar 18 quintilhões de centavos.
  assert.throws(() => parseAmountCents('92233720368547758.00'), /AMOUNT/);
  assert.throws(() => parseAmountCents('99999999999999999999'), /AMOUNT/);
  assert.equal(parseAmountCents('9.999.999.999,99').cents, 999999999999n);
});

test('a emissão de código de ação recusa outra origem e corpo que não é JSON', async () => {
  // Um POST text/plain de outra origem (sem preflight) recebia código e
  // enchia o mapa em memória sem limite.
  const route = await read('src/app/api/action-codes/route.ts');
  assert.match(route, /application\/json/);
  assert.match(route, /request\.headers\.get\('Origin'\)/);
  assert.match(route, /ORIGIN_NOT_ALLOWED/);
});

test('o código-fonte não contém caracteres de inversão de direção (Trojan Source)', async () => {
  // Controles bidi invisíveis fazem o código revisado ler diferente do código
  // executado (CVE-2021-42574). Escapes como \u202e continuam permitidos.
  const { readdir } = await import('node:fs/promises');
  const bidi = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
  const dirs = ['src', 'tests', 'scripts', 'electron', 'cloudflare/src', 'apps/web/src', 'prisma', '.github'];
  for (const dir of dirs) {
    const entries = await readdir(new URL(`${dir}/`, root), { recursive: true }).catch(() => []);
    for (const entry of entries.filter((name) => /\.(ts|tsx|mjs|cjs|js|css|sql|prisma|ya?ml)$/.test(name))) {
      const text = await read(`${dir}/${entry}`);
      assert.doesNotMatch(text, bidi, `${dir}/${entry}`);
    }
  }
});
