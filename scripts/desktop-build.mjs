/* Gera os instaladores no CI e assina quando há certificado (docs/BEST_PRACTICES.md, "Desktop packages").

   Uso: node scripts/desktop-build.mjs <argumentos do electron-builder>.

   Sem certificado, o resultado é o de sempre: Windows sem assinatura e macOS
   com assinatura ad hoc, sem runtime reforçado nem notarização. Com os segredos
   do repositório, que o workflow só repassa em builds da main ou disparados à
   mão (nunca em pull request):
   - Windows: WIN_CSC_LINK (certificado .pfx em base64) e WIN_CSC_KEY_PASSWORD
     assinam o instalador e o executável (Authenticode);
   - macOS: MAC_CSC_LINK e MAC_CSC_KEY_PASSWORD (Developer ID Application) e
     APPLE_API_KEY_P8, APPLE_API_KEY_ID e APPLE_API_ISSUER (chave da App Store
     Connect) assinam com runtime reforçado e notarizam.
   Nenhum valor é impresso; a chave .p8 vai para um arquivo temporário que é
   apagado no fim. Depois do build, confere a assinatura de cada pacote. */

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const args = process.argv.slice(2);
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
const has = (name) => Boolean(process.env[name]?.trim());
let temp = null;
let signed = false;

if (process.platform === 'win32' && has('WIN_CSC_LINK') && has('WIN_CSC_KEY_PASSWORD')) {
  env.CSC_LINK = process.env.WIN_CSC_LINK;
  env.CSC_KEY_PASSWORD = process.env.WIN_CSC_KEY_PASSWORD;
  signed = true;
} else if (process.platform === 'darwin') {
  const apple = ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD', 'APPLE_API_KEY_P8', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];
  if (apple.every(has)) {
    temp = await mkdtemp(path.join(tmpdir(), 'talentum-apple-'));
    const key = path.join(temp, 'AuthKey.p8');
    await writeFile(key, process.env.APPLE_API_KEY_P8, { mode: 0o600 });
    Object.assign(env, {
      CSC_LINK: process.env.MAC_CSC_LINK,
      CSC_KEY_PASSWORD: process.env.MAC_CSC_KEY_PASSWORD,
      APPLE_API_KEY: key,
      APPLE_API_KEY_ID: process.env.APPLE_API_KEY_ID,
      APPLE_API_ISSUER: process.env.APPLE_API_ISSUER,
    });
    signed = true;
  } else {
    // Ad hoc: o Apple silicon não executa binário sem assinatura nenhuma.
    args.push('-c.mac.identity=-', '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false');
  }
}
console.log(signed ? 'Build assinado com o certificado do repositório.' : 'Build de teste sem certificado.');

try {
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'electron-builder', ...args, '--publish', 'never'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`electron-builder terminou com código ${code}`))));
  });
} finally {
  if (temp) await rm(temp, { recursive: true, force: true });
}

/* Conferência: um build assinado que saísse sem assinatura válida falha aqui. */
if (signed) {
  const files = await readdir('release');
  if (process.platform === 'win32') {
    for (const file of files.filter((name) => name.endsWith('.exe'))) {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -FilePath 'release\\${file}').Status`]);
      if (stdout.trim() !== 'Valid') throw new Error(`assinatura Authenticode inválida em ${file}: ${stdout.trim()}`);
      console.log(`  ok  ${file} assinado (Authenticode)`);
    }
  } else if (process.platform === 'darwin') {
    for (const dir of files.filter((name) => name.startsWith('mac'))) {
      const app = path.join('release', dir, 'Talentum.app');
      await run('codesign', ['--verify', '--deep', '--strict', app]);
      await run('spctl', ['--assess', '--type', 'execute', app]);
      console.log(`  ok  ${app} assinado e aceito pelo Gatekeeper`);
    }
  }
}
