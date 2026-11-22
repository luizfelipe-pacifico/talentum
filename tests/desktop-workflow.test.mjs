import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Workflow que gera os instaladores de teste (docs/BEST_PRACTICES.md, "Desktop packages").
   Cada sistema é empacotado no próprio sistema, para que os binários nativos do
   libSQL e do Prisma sejam os dele, e o pacote é aberto antes de ser guardado. */

const workflow = await readFile(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8');

test('empacota Windows, macOS das duas arquiteturas e Linux', () => {
  for (const [runner, build] of [
    ['windows-2025', '--win nsis --x64'],
    ['macos-15', '--mac dmg zip --arm64'],
    ['macos-15-intel', '--mac dmg zip --x64'],
    ['ubuntu-24.04', '--linux AppImage deb --x64'],
  ]) {
    assert.match(workflow, new RegExp(`os: ${runner}\\n(?:\\s+#.*\\n)*\\s+build: ${build.replaceAll('-', '\\-')}`), runner);
  }
  assert.match(workflow, /node scripts\/desktop-build\.mjs \$\{\{ matrix\.build \}\}/);
});

test('abre cada pacote antes de guardar o artefato', () => {
  assert.ok(workflow.indexOf('pnpm desktop:smoke') < workflow.indexOf('actions/upload-artifact'));
  assert.match(workflow, /apt-get install -y xvfb imagemagick \.\/release\/\*\.deb/, 'o Linux testa o app instalado pelo .deb');
  assert.match(workflow, /xvfb-run --auto-servernum pnpm desktop:smoke \/opt\/Talentum/);
  assert.match(workflow, /StartupWMClass=talentum/, 'o atalho instalado liga a janela ao ícone');
  assert.match(workflow, /pnpm desktop:smoke release\/squashfs-root/, 'o AppImage também é aberto');
  assert.match(workflow, /node scripts\/desktop-installer-screens\.mjs/, 'telas reais do instalador e instalação');
  assert.match(workflow, /pnpm desktop:smoke "\$env:LOCALAPPDATA\\Programs\\Talentum"/, 'Windows testa o app instalado');
  assert.match(workflow, /pnpm desktop:smoke \/Applications/, 'macOS testa o app copiado do DMG');
  assert.match(workflow, /SHA256SUMS\.txt/);
});

test('certificado só chega a builds da main, nunca a pull request', () => {
  const uses = [...workflow.matchAll(/\$\{\{([^}]*secrets\.[^}]*)\}\}/g)].map((match) => match[1].trim());
  assert.ok(uses.length >= 7, 'segredos de assinatura do Windows e do macOS');
  for (const use of uses) {
    assert.match(use, /^github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main' && secrets\.[A-Z0-9_]+ \|\| ''$/, use);
  }
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/);
  assert.match(workflow, /persist-credentials: false/);
});

test('sem certificado o macOS assina ad hoc, e com ele o build é conferido', async () => {
  const build = await readFile(new URL('../scripts/desktop-build.mjs', import.meta.url), 'utf8');
  assert.match(build, /'-c\.mac\.identity=-', '-c\.mac\.hardenedRuntime=false', '-c\.mac\.notarize=false'/);
  assert.match(build, /Get-AuthenticodeSignature/);
  assert.match(build, /spctl', \['--assess'/);
  assert.match(build, /mode: 0o600/, 'a chave .p8 não fica legível para outros usuários');
  assert.doesNotMatch(build, /console\.log\([^)]*process\.env/, 'nenhum segredo é impresso');
});
