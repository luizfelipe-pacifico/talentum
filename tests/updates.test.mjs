import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  checkForUpdate,
  clearUpdateCache,
  compareSemver,
  isPostponed,
  latestStableRelease,
  installerAssetName,
  OFFICIAL_REPOSITORY,
  parseSemver,
  sanitizeNotes,
} from '../src/server/updates.ts';

/* Aviso de nova versão (docs/PRODUCT.md, "Done when"): comparação de versão,
   filtro de releases e recusa de instalador não verificado. Nenhum teste toca a
   rede: o `fetch` é sempre falso. Releases, versões e chaves são sintéticas. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const require = createRequire(import.meta.url);
const verify = require('../electron/update-verify.cjs');

const base = `https://github.com/${OFFICIAL_REPOSITORY}`;
const release = (tag, over = {}) => ({
  tag_name: tag,
  body: `Notas da ${tag}`,
  draft: false,
  prerelease: false,
  html_url: `${base}/releases/tag/${tag}`,
  published_at: '2026-11-01T00:00:00Z',
  assets: [{ name: `Talentum-${tag.replace(/^v/, '')}-Windows-x64.exe`, size: 10, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: `${base}/releases/download/${tag}/Talentum.exe` }],
  ...over,
});

test('SemVer estrito, comparado numericamente', () => {
  assert.deepEqual(parseSemver('v1.10.0'), [1, 10, 0]);
  for (const invalid of ['1.0', 'v1.0.0-beta.1', '1.0.0+build', '01.0.0', 'latest', ''])
    assert.equal(parseSemver(invalid), null, invalid);
  assert.equal(compareSemver([1, 10, 0], [1, 9, 9]), 1);
  assert.equal(compareSemver([0, 1, 0], [0, 1, 0]), 0);
  assert.equal(compareSemver([0, 1, 0], [0, 2, 0]), -1);
});

test('só release estável, válida e maior que a instalada aparece', () => {
  const list = [
    release('v0.1.0'),
    release('v0.0.9'),
    release('v9.0.0', { draft: true }),
    release('v8.0.0', { prerelease: true }),
    release('v7.0.0-rc.1'),
    release('versao-nova'),
    release('v0.3.0', { html_url: 'https://github.com/outra-pessoa/talentum/releases/tag/v0.3.0' }),
    release('v0.2.0'),
    { tag_name: 'v5.0.0' },
  ];
  const found = latestStableRelease(list, '0.1.0');
  assert.equal(found.version, '0.2.0', 'rascunho, pré-release, tag inválida e URL de outro repositório ficam de fora');
  assert.equal(found.asset.sha256, 'a'.repeat(64));
  assert.equal(latestStableRelease([release('v0.1.0'), release('v0.0.1')], '0.1.0'), null, 'igual ou menor não aparece');
  assert.equal(latestStableRelease({ não: 'lista' }, '0.1.0'), null);
  const foreignAsset = latestStableRelease([release('v0.2.0', { assets: [{ name: 'x', size: 1, browser_download_url: 'https://evil.example/x.exe' }] })], '0.1.0');
  assert.equal(foreignAsset, null, 'asset fora do repositório oficial invalida a release');
});

test('cada plataforma recebe o próprio instalador: .exe no Windows, .dmg no macOS por arquitetura', () => {
  const tag = 'v0.2.0';
  const asset = (name) => ({ name, size: 10, digest: `sha256:${'d'.repeat(64)}`, browser_download_url: `${base}/releases/download/${tag}/${name}` });
  const list = [release(tag, { assets: [asset('Talentum-0.2.0-Windows-x64.exe'), asset('Talentum-0.2.0-macOS-arm64.dmg'), asset('Talentum-0.2.0-macOS-x64.dmg'), asset('Talentum-0.2.0-macOS-arm64.zip')] })];
  assert.equal(latestStableRelease(list, '0.1.0', { platform: 'darwin', arch: 'arm64' }).asset.name, 'Talentum-0.2.0-macOS-arm64.dmg');
  assert.equal(latestStableRelease(list, '0.1.0', { platform: 'darwin', arch: 'x64' }).asset.name, 'Talentum-0.2.0-macOS-x64.dmg');
  assert.equal(latestStableRelease(list, '0.1.0', { platform: 'win32', arch: 'x64' }).asset.name, 'Talentum-0.2.0-Windows-x64.exe');
  assert.equal(latestStableRelease(list, '0.1.0', { platform: 'linux', arch: 'x64' }).asset, null, 'sem AppImage publicado, sem asset');
  for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'ia32']])
    assert.equal(verify.installerAssetName('0.2.0', platform, arch), installerAssetName('0.2.0', platform, arch), `${platform}/${arch}`);
  assert.equal(verify.installerAssetName('0.2.0', 'linux', 'x64'), null, 'o processo principal não instala no Linux');
});

test('o pacote do macOS usa hardened runtime, entitlements mínimos e notarização só por variável de ambiente', async () => {
  const { build, scripts } = JSON.parse(await read('package.json'));
  assert.equal(scripts['desktop:build:mac'], 'pnpm desktop:prepare && electron-builder --mac dmg zip');
  assert.equal(build.mac.hardenedRuntime, true);
  assert.equal(build.mac.notarize, true);
  assert.equal(build.mac.artifactName, 'Talentum-${version}-macOS-${arch}.${ext}');
  assert.doesNotMatch(JSON.stringify(build), /APPLE_|appleId|password|teamId/i, 'credencial nunca no repositório');
  const plist = await read(build.mac.entitlements);
  const keys = [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
  assert.deepEqual(keys, ['com.apple.security.cs.allow-jit']);
});

test('notas viram texto puro, curto, sem link, HTML nem controle de direção', () => {
  const notes = sanitizeNotes('## Novidades\n<script>alert(1)</script>**Importação** mais rápida [detalhes](https://exemplo.com) ![x](https://exemplo.com/a.png)\u202e\n\n\n\nhttps://exemplo.com/solto');
  assert.doesNotMatch(notes, /<|>|https?:|\*|#|\u202e/u);
  assert.match(notes, /Novidades/);
  assert.match(notes, /Importação mais rápida detalhes/);
  assert.ok(sanitizeNotes('a'.repeat(5_000)).length <= 600);
  assert.equal(sanitizeNotes(null), '');
});

const fakeFetch = (handler) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { impl, calls };
};
const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

test('a consulta usa o repositório fixo, não identifica a pessoa e guarda em cache', async () => {
  clearUpdateCache();
  const fetcher = fakeFetch(() => json([release('v0.2.0')]));
  const first = await checkForUpdate({ fetchImpl: fetcher.impl, currentVersion: '0.1.0', now: 1_000 });
  assert.equal(first.status, 'update-available');
  assert.equal(fetcher.calls[0].url, `https://api.github.com/repos/${OFFICIAL_REPOSITORY}/releases?per_page=20`);
  assert.deepEqual(Object.keys(fetcher.calls[0].init.headers).sort(), ['Accept', 'User-Agent', 'X-GitHub-Api-Version']);
  assert.ok(fetcher.calls[0].init.signal, 'a consulta tem tempo-limite');
  await checkForUpdate({ fetchImpl: fetcher.impl, currentVersion: '0.1.0', now: 2_000 });
  assert.equal(fetcher.calls.length, 1, 'a segunda consulta vem do cache');
});

test('sem rede, resposta inválida ou grande demais, nada aparece', async () => {
  for (const handler of [
    () => { throw new TypeError('rede indisponível'); },
    () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }),
    () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    () => json([], { 'content-length': String(5_000_000) }),
    () => new Response('limite', { status: 403, headers: { 'content-type': 'application/json' } }),
  ]) {
    clearUpdateCache();
    const result = await checkForUpdate({ fetchImpl: fakeFetch(handler).impl, currentVersion: '0.1.0', now: 1 });
    assert.equal(result.status, 'unavailable');
  }
});

test('adiar vale 24 horas e só para a versão adiada', () => {
  const value = JSON.stringify({ version: '0.2.0', until: 10_000 });
  assert.equal(isPostponed(value, '0.2.0', 9_999), true);
  assert.equal(isPostponed(value, '0.2.0', 10_000), false);
  assert.equal(isPostponed(value, '0.3.0', 1), false);
  assert.equal(isPostponed('lixo', '0.2.0', 1), false);
});

test('instalador com checksum divergente ou sem assinatura válida nunca é aprovado', () => {
  const name = 'Talentum-0.2.0-Windows-x64.exe';
  const actual = 'b'.repeat(64);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const signature = sign(null, verify.signedMessage(name, actual), privateKey).toString('base64');

  assert.equal(verify.UPDATE_SIGNING_PUBLIC_KEY, null, 'sem chave de release configurada');
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: actual, signatureBase64: signature }), { ok: false, reason: 'SIGNING_KEY_MISSING' });
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: 'c'.repeat(64), signatureBase64: signature, publicKeyPem: pem }), { ok: false, reason: 'CHECKSUM_MISMATCH' });
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: null, signatureBase64: signature, publicKeyPem: pem }), { ok: false, reason: 'CHECKSUM_MISSING' });
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: actual, signatureBase64: null, publicKeyPem: pem }), { ok: false, reason: 'SIGNATURE_MISSING' });
  const otherFile = sign(null, verify.signedMessage('outro.exe', actual), privateKey).toString('base64');
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: actual, signatureBase64: otherFile, publicKeyPem: pem }), { ok: false, reason: 'SIGNATURE_INVALID' });
  assert.deepEqual(verify.verifyInstaller({ fileName: name, actualSha256: actual, expectedSha256: actual, signatureBase64: signature, publicKeyPem: pem }), { ok: true });
});

test('o processo principal só executa depois da verificação e só para a janela do app', async () => {
  const main = await read('electron/main.cjs');
  assert.match(main, /ipcMain\.handle\('app:update-install', \(event, version\) =>\s*trustedSender\(event\) && typeof version === 'string'/);
  const install = main.slice(main.indexOf('async function installUpdate'), main.indexOf("ipcMain.handle('app:update-install'"));
  assert.ok(install.indexOf('update.verifyInstaller(') < install.indexOf('spawn(file'), 'verifica antes de executar');
  assert.match(install, /if \(!verdict\.ok\) \{\s*cleanup\(\);\s*return \{ status: 'refused'/);
  assert.match(install, /if \(!update\.UPDATE_SIGNING_PUBLIC_KEY\) return \{ status: 'refused', reason: 'SIGNING_KEY_MISSING' \}/);
  assert.match(install, /update\.isNewerVersion\(version, app\.getVersion\(\)\)/);
  assert.match(main, /if \(!update\.allowedDownloadUrl\(target\)\) return reject/);
  assert.equal(verify.OFFICIAL_REPOSITORY, OFFICIAL_REPOSITORY, 'o mesmo repositório nos dois processos');
  assert.equal(verify.allowedDownloadUrl('https://evil.example/x.exe'), false);
  assert.equal(verify.allowedDownloadUrl('http://github.com/x'), false);
  assert.equal(verify.isNewerVersion('0.2.0', '0.1.0'), true);
  assert.equal(verify.isNewerVersion('0.1.0', '0.1.0'), false);
  assert.equal(verify.isNewerVersion('../../x', '0.1.0'), false);
  const preload = await read('electron/preload.cjs');
  assert.match(preload, /installUpdate: \(version\) => ipcRenderer\.invoke\('app:update-install', String\(version\)\)/);
});

test('a rota exige código de ação e a interface nunca fala com o GitHub', async () => {
  const route = await read('src/app/api/updates/route.ts');
  assert.match(route, /requireActionCode\(request\)/);
  assert.match(route, /fetchImpl: fetch/);
  assert.match(await read('src/app/api/updates/postpone/route.ts'), /guardWithProfile\(request\)/);
  const ui = await read('src/components/update-notice.tsx');
  // A interface não consulta nada fora do backend local: nem fetch próprio nem endereço externo.
  assert.doesNotMatch(ui, /\bfetch\(/);
  assert.doesNotMatch(ui, /https:\/\//);
  assert.match(ui, /getJson<Check>\('\/api\/updates'\)/);
  assert.match(ui, /pathname\.startsWith\('\/extratos\/importar'\)/, 'não aparece durante a importação');
  assert.match(ui, /name="nova-versao"/);
  assert.match(ui, /'Baixar agora'/);
  assert.match(ui, />Adiar</);
});
