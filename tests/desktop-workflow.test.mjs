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
  assert.match(workflow, /--publish never/, 'nunca publica release');
});

test('abre cada pacote antes de guardar o artefato', () => {
  assert.ok(workflow.indexOf('pnpm desktop:smoke') < workflow.indexOf('actions/upload-artifact'));
  assert.match(workflow, /apt-get install -y xvfb lsof \.\/release\/\*\.deb/, 'o Linux testa o app instalado pelo .deb');
  assert.match(workflow, /xvfb-run --auto-servernum pnpm desktop:smoke \/opt\/Talentum/);
  assert.match(workflow, /StartupWMClass=talentum/, 'o atalho instalado liga a janela ao ícone');
  assert.match(workflow, /SHA256SUMS\.txt/);
});

test('não usa segredo nem procura certificado', () => {
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/);
  assert.match(workflow, /-c\.mac\.notarize=false/);
  assert.match(workflow, /persist-credentials: false/);
});
