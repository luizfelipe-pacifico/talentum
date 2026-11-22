/* Fotografa as telas de instalação reais e instala o app como uma pessoa faria
   (docs/DESIGN-SYSTEM.md, "Installer screens"; docs/BEST_PRACTICES.md, "Desktop packages").

   - Windows: abre o instalador NSIS, fotografa as três primeiras telas
     (avançando com Enter) e fecha; depois instala em modo silencioso para o
     usuário atual e confere o atalho do menu Iniciar.
   - macOS: monta o DMG, abre a janela do Finder com o fundo da marca, fotografa,
     copia o Talentum.app para /Applications e desmonta.

   Uso: node scripts/desktop-installer-screens.mjs [release]. As capturas vão
   para release/telas/. Só roda nas máquinas descartáveis do CI: instala de
   verdade no sistema. */

import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const release = path.resolve(process.argv[2] ?? 'release');
const screens = path.join(release, 'telas');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const find = (pattern) => readdirSync(release).filter((name) => pattern.test(name)).map((name) => path.join(release, name))[0];

const powershell = (script) => run('powershell.exe', ['-NoProfile', '-Command', script]);

function screenshotWindows(file) {
  return powershell(
    [
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
      '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '$i = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
      '$g = [System.Drawing.Graphics]::FromImage($i)',
      '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
      `$i.Save('${file.replaceAll("'", "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    ].join('; '),
  );
}

async function windows() {
  const installer = find(/\.exe$/);
  if (!installer) throw new Error('nenhum instalador .exe em release/');
  const wizard = spawn(installer, [], { stdio: 'ignore' });
  try {
    await sleep(8000);
    for (let page = 1; page <= 3; page += 1) {
      await powershell(`$w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate(${wizard.pid})`).catch(() => {});
      await sleep(800);
      await screenshotWindows(path.join(screens, `windows-instalador-${page}.png`));
      console.log(`  ok  tela ${page} do instalador fotografada`);
      if (page < 3) {
        await powershell(`$w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate(${wizard.pid}); Start-Sleep -Milliseconds 300; $w.SendKeys('{ENTER}')`);
        await sleep(2500);
      }
    }
  } finally {
    await run('taskkill', ['/pid', String(wizard.pid), '/t', '/f']).catch(() => {});
    await sleep(2000);
  }

  // Instalação silenciosa para o usuário atual, como o instalador faz sem perguntar.
  await run(installer, ['/S']);
  const installed = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Talentum', 'Talentum.exe');
  if (!existsSync(installed)) throw new Error(`instalação silenciosa não criou ${installed}`);
  console.log(`  ok  instalado em ${path.dirname(installed)}`);
  const shortcut = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Talentum.lnk');
  if (!existsSync(shortcut)) throw new Error('atalho do menu Iniciar não foi criado');
  console.log('  ok  atalho Talentum no menu Iniciar');
}

async function macos() {
  const image = find(/\.dmg$/);
  if (!image) throw new Error('nenhum .dmg em release/');
  const { stdout } = await run('hdiutil', ['attach', image, '-nobrowse', '-noverify']);
  const volume = stdout.trim().split('\n').pop().split('\t').pop().trim();
  try {
    // A janela do Finder usa o fundo, o tamanho e as posições gravados no DMG.
    await run('open', [volume]);
    await sleep(6000);
    await run('screencapture', ['-x', path.join(screens, 'macos-dmg.png')]);
    console.log('  ok  janela do DMG fotografada');
    await run('ditto', [path.join(volume, 'Talentum.app'), '/Applications/Talentum.app']);
    console.log('  ok  Talentum.app copiado para /Applications');
  } finally {
    await run('osascript', ['-e', 'tell application "Finder" to close every window']).catch(() => {});
    await run('hdiutil', ['detach', volume, '-force']).catch(() => {});
  }
}

await mkdir(screens, { recursive: true });
if (process.platform === 'win32') await windows();
else if (process.platform === 'darwin') await macos();
else console.log('Linux: o AppImage e o .deb não têm tela de instalação.');
