import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/* Regressões das páginas e rotas de formulário da comunidade, da conta e da
   verificação em duas etapas na LP. Cada teste descreve o ataque ou a falha
   que impede. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const forms = await import(new URL('apps/web/src/server/community-forms.ts', root).href);
const qr = await import(new URL('apps/web/src/server/qr.ts', root).href);

async function routeFiles(dir) {
  const entries = await readdir(new URL(dir, root), { recursive: true });
  return entries.filter((entry) => entry.endsWith('route.ts')).map((entry) => `${dir}${entry}`);
}

test('toda rota de escrita da comunidade e da conta confere a origem e responde sem cache', async () => {
  // Sem a checagem, um site qualquer faria a pessoa logada publicar, votar ou
  // excluir a conta com um formulário escondido (CSRF).
  const files = [...(await routeFiles('apps/web/src/app/api/comunidade/')), ...(await routeFiles('apps/web/src/app/api/conta/'))];
  assert.ok(files.length >= 14, `rotas encontradas: ${files.length}`);
  for (const path of files) {
    const source = await read(path);
    assert.match(source, /export async function POST/, path);
    assert.doesNotMatch(source, /export async function GET/, `${path} não pode mudar estado num GET`);
    assert.match(source, /if \(!sameOrigin\(request\.headers\)\) return bffError\('FORBIDDEN', 403\)/, path);
    assert.match(source, /backTo\(|redirectNoStore\(/, path);
    assert.doesNotMatch(source, /NextResponse\.redirect\(/, `${path} redireciona sem no-store`);
  }
});

test('IDs da URL e do formulário viram caminho do Worker só depois de validados', async () => {
  assert.equal(forms.isOpaqueId('550e8400-e29b-41d4-a716-446655440000'), true);
  for (const bad of ['', '../x', 'a/b', 'x'.repeat(65), 'a b', '%2e%2e', null, 42]) assert.equal(forms.isOpaqueId(bad), false, String(bad));
  assert.equal(forms.isIdempotencyKey(crypto.randomUUID()), true);
  assert.equal(forms.isIdempotencyKey('curta'), false);
  for (const path of await routeFiles('apps/web/src/app/api/comunidade/')) {
    const source = await read(path);
    if (/\[(postId|commentId)\]/.test(path)) assert.match(source, /isOpaqueId\((postId|commentId)\)/, path);
  }
});

test('criações levam chave de idempotência e o token do desafio ao Worker', async () => {
  for (const path of [
    'apps/web/src/app/api/comunidade/publicacoes/route.ts',
    'apps/web/src/app/api/comunidade/publicacoes/[postId]/comentarios/route.ts',
    'apps/web/src/app/api/comunidade/denuncias/route.ts',
  ]) {
    const source = await read(path);
    assert.match(source, /isIdempotencyKey\(key\)/, path);
    assert.match(source, /turnstileToken: formText\(form, TURNSTILE_FIELD\)/, path);
    assert.match(source, /,\s*key,?\s*\)/, path);
  }
  const bff = await read('apps/web/src/server/community-bff.ts');
  assert.match(bff, /'Idempotency-Key': idempotencyKey/);
});

test('texto de pessoas nunca é renderizado como HTML', async () => {
  // Sugestões e comentários são entrada hostil (docs/SECURITY.md, Feedback community).
  const dirs = ['apps/web/src/app/comunidade/', 'apps/web/src/app/conta/', 'apps/web/src/app/entrar/', 'apps/web/src/app/termos/', 'apps/web/src/app/privacidade/'];
  const files = ['apps/web/src/components/lp/community.tsx', 'apps/web/src/components/lp/legal-documents.tsx', 'apps/web/src/components/lp/site-shell.tsx'];
  for (const dir of dirs) {
    for (const entry of await readdir(new URL(dir, root), { recursive: true })) if (entry.endsWith('.tsx')) files.push(`${dir}${entry}`);
  }
  for (const path of files) assert.doesNotMatch(await read(path), /dangerouslySetInnerHTML/, path);
  const css = await read('apps/web/src/styles/pages.css');
  assert.match(css, /\.lp-user-text \{\s*white-space: pre-line;/);
});

test('códigos do Worker viram avisos legíveis, nunca o código cru', () => {
  assert.equal(forms.noticeForWorkerError('CHALLENGE_FAILED', 403), 'desafio');
  assert.equal(forms.noticeForWorkerError('RATE_LIMITED', 429), 'limite');
  assert.equal(forms.noticeForWorkerError(null, 401), 'sessao');
  assert.equal(forms.noticeForWorkerError('IDEMPOTENCY_KEY_REUSED', 409), 'repetido');
  assert.equal(forms.noticeForWorkerError('INVALID_MFA_CODE', 400), 'codigo-invalido');
  assert.equal(forms.noticeForWorkerError('ALGO_NOVO', 418), 'erro');
  assert.equal(forms.noticeForWorkerError(null, 503), 'indisponivel');
  assert.equal(forms.noticeFrom('<script>'), null);
  assert.equal(forms.noticeFrom(['publicada']).tone, 'ok');
  for (const notice of Object.values(forms.NOTICES)) assert.doesNotMatch(notice.text, /[A-Z]{3,}_[A-Z]/, notice.text);
});

test('códigos de verificação são normalizados antes de seguir ao Worker', () => {
  assert.equal(forms.normalizeTotpCode(' 123 456 '), '123456');
  assert.equal(forms.normalizeTotpCode('12345'), null);
  assert.equal(forms.normalizeTotpCode('12345a'), null);
  assert.equal(forms.normalizeRecoveryCode('abcd-1234'), 'ABCD-1234');
  assert.equal(forms.normalizeRecoveryCode('ABCD1234'), 'ABCD-1234');
  assert.equal(forms.normalizeRecoveryCode('ABCD-123'), null);
  assert.equal(forms.groupSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
});

test('o QR Code do autenticador é gerado no servidor, sem serviço externo', async () => {
  // Mandar o endereço otpauth a um gerador de QR externo entregaria o segredo TOTP.
  const page = await read('apps/web/src/app/conta/mfa/page.tsx');
  assert.match(page, /encodeQr\(otpauthUri\)/);
  // Nenhum endereço externo além do namespace do SVG: o QR não sai do servidor.
  const urls = [...page.matchAll(/\bhttps?:\/\/[^\s'"`)]+/g)].map((match) => match[0]);
  assert.deepEqual(urls.filter((url) => !url.startsWith('http://www.w3.org/')), []);
  // Bits de formato do nível M conferidos com a tabela da norma ISO/IEC 18004.
  assert.equal(qr.formatBits(0), 0b101010000010010);
  assert.equal(qr.formatBits(1), 0b101000100100101);
  assert.equal(qr.formatBits(7), 0b100101010100000);
  const uri = 'otpauth://totp/Talentum:Pessoa%20Sint%C3%A9tica?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Talentum&digits=6&period=30';
  const matrix = qr.encodeQr(uri);
  assert.equal(matrix.size % 4, 1);
  assert.ok(matrix.size >= 21 && matrix.size <= 57);
  // Padrões de localização nos três cantos: 7 módulos escuros na borda superior.
  for (const [x, y] of [[0, 0], [matrix.size - 7, 0], [0, matrix.size - 7]]) {
    for (let i = 0; i < 7; i++) assert.equal(matrix.modules[y][x + i], true, `localizador em ${x},${y}`);
    assert.equal(matrix.modules[y + 1][x + 1], false);
    assert.equal(matrix.modules[y + 3][x + 3], true);
  }
  // Módulo escuro fixo da norma e determinismo.
  assert.equal(matrix.modules[matrix.size - 8][8], true);
  assert.deepEqual(qr.encodeQr(uri).modules, matrix.modules);
  assert.throws(() => qr.encodeQr('x'.repeat(400)), /QR_TOO_LONG/);
});

test('sitemap anuncia só as páginas públicas novas', async () => {
  const sitemap = await read('apps/web/src/app/sitemap.ts');
  for (const page of ['/comunidade', '/termos', '/privacidade']) assert.ok(sitemap.includes(`\`\${SITE_URL}${page}\``), page);
  for (const page of ['/conta', '/entrar', '/comunidade/nova', '/comunidade/moderacao']) assert.ok(!sitemap.includes(`\`\${SITE_URL}${page}\``), page);
});

test('a exclusão de conta só limpa os cookies depois que o Worker confirma', async () => {
  const source = await read('apps/web/src/app/api/conta/excluir/route.ts');
  assert.match(source, /confirm !== 'EXCLUIR'/);
  assert.ok(source.indexOf("forwardForm('/api/me', 'DELETE'") < source.indexOf('cookies.delete(ACCESS_COOKIE)'));
  assert.match(source, /if \(!result\.ok\) return backTo/);
});

test('a página Entrar só retoma a sessão por POST e mostra a versão aceita', async () => {
  const page = await read('apps/web/src/app/entrar/page.tsx');
  assert.match(page, /method="post" action="\/api\/auth\/refresh"/);
  assert.match(page, /method="post" action="\/api\/auth\/start"/);
  assert.match(page, /safeReturn\(/);
  assert.match(page, /LEGAL_VERSIONS\.terms/);
  assert.match(page, /href="\/termos"/);
  assert.match(page, /href="\/privacidade"/);
});
