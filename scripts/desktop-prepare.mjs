import { realpathSync } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} terminou com código ${code}.`)));
  });
}

await run('pnpm', ['prisma:generate']);
await run('pnpm', ['build'], { ...process.env, TALENTUM_STANDALONE_BUILD: '1' });
await mkdir('.next/standalone/.next', { recursive: true });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true, force: true });
await cp('public', '.next/standalone/public', { recursive: true, force: true });
/* A thread de leitura de PDF é carregada por `new Worker(new URL(...))`, que o
   rastreamento do Next não segue: o chunk dela não entra no standalone sozinho.
   tests/regression/pdf-worker-missing-from-standalone.test.mjs */
await cp('.next/server/chunks', '.next/standalone/.next/server/chunks', { recursive: true, force: false });
/* O pdfjs-dist fica fora do bundle (serverExternalPackages) e só a thread o
   importa, então também escapa do rastreamento. Copia a pasta real (o pnpm a
   guarda atrás de um link simbólico). */
await cp(realpathSync('node_modules/pdfjs-dist'), '.next/standalone/node_modules/pdfjs-dist', { recursive: true, force: true, dereference: true });

/* O libsql escolhe o binário nativo por um nome montado em tempo de execução
   (`@libsql/${alvo}`), que o rastreamento do Next não segue: no macOS e no
   Windows ele ficava de fora. Copia o pacote nativo do sistema que está
   empacotando, onde o libsql o encontra subindo pelas pastas node_modules.
   tests/regression/packaged-app-loses-pnpm-links-and-native-libsql.test.mjs */
// Resolve pelos pontos de entrada: os dois pacotes não exportam o próprio package.json.
const libsqlEntry = realpathSync(createRequire(realpathSync('node_modules/@libsql/client/package.json')).resolve('libsql'));
const fromLibsql = createRequire(libsqlEntry);
const target = fromLibsql('@neon-rs/load').currentTarget();
const nativeDir = path.dirname(fromLibsql.resolve(`@libsql/${target}`));
await cp(realpathSync(nativeDir), `.next/standalone/node_modules/@libsql/${target}`, { recursive: true, force: true, dereference: true });

/* Avisos de licença dos pacotes de produção e o LICENSE do Talentum, que vão
   para resources/licencas (tests/regression/installers-missing-third-party-licenses.test.mjs). */
await run('node', ['scripts/third-party-notices.mjs', '.next/licencas']);

/* O Next copia o .env da raiz para .next/standalone. Segredo de
   desenvolvimento nunca entra no instalador: remove e confere. */
for (const name of await readdir('.next/standalone')) {
  if (name.startsWith('.env') || name.startsWith('.dev.vars')) await rm(`.next/standalone/${name}`, { force: true });
}
const leftovers = (await readdir('.next/standalone')).filter((name) => name.startsWith('.env') || name.startsWith('.dev.vars'));
if (leftovers.length > 0) throw new Error('Arquivo de ambiente ficou no pacote; o build foi interrompido.');
