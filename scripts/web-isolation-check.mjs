import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/* Prova de isolamento do pacote da Vercel (docs/SECURITY.md, Open items, item 9).

   Roda depois de `pnpm web:build`. Lê os rastros de arquivos do Next
   (`*.nft.json`), que listam tudo o que cada rota do servidor carrega, e o
   JavaScript enviado ao navegador (`.next/static`). Falha quando qualquer um
   deles alcança o app desktop, o backend local, Prisma, SQLite, o Worker ou
   parsers financeiros. Grava em `apps/web/.next/talentum-isolation.json` o
   manifesto do que foi verificado (pastas de origem e contagens), para o CI
   anexar como artefato.

   Limitação declarada: prova o conteúdo do build, não o que a integração da
   Vercel envia de contexto. Isso depende da configuração do projeto na Vercel
   (Root Directory = apps/web), que fica no painel. */

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const web = join(repo, 'apps', 'web');
const next = join(web, '.next');

const FORBIDDEN_PATHS = [
  /(^|\/)electron\//,
  /(^|\/)@prisma\//,
  /(^|\/)\.prisma\//,
  /(^|\/)prisma\//,
  /sqlite/i,
  /(^|\/)pdfjs-dist\//,
  /^src\//,
  /^cloudflare\//,
  /^scripts\//,
  /^temp\//,
  /\.db$/,
  /\.env/,
];
const FORBIDDEN_TEXT = [/@prisma\/client/, /require\(["']electron["']\)/, /node:sqlite|better-sqlite3/, /BFF_SHARED_SECRET|GOOGLE_CLIENT_SECRET|TOKEN_HASH_PEPPER|SESSION_SIGNING_SECRET|MFA_ENCRYPTION_KEY|TURNSTILE_SECRET_KEY/];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'cache') walk(path, out);
    } else out.push(path);
  }
  return out;
}

export function checkIsolation(nextDir = next) {
  if (!existsSync(nextDir)) return { ok: false, problems: ['apps/web/.next não existe: rode `pnpm web:build` antes.'], manifest: null };
  const problems = [];
  const traced = new Set();
  const files = walk(nextDir);
  for (const trace of files.filter((file) => file.endsWith('.nft.json'))) {
    const { files: list = [] } = JSON.parse(readFileSync(trace, 'utf8'));
    for (const item of list) {
      // pnpm resolve pacotes para node_modules/.pnpm/<pacote>@<versão>/...: o nome vale como caminho.
      const path = relative(repo, resolve(dirname(trace), item)).replaceAll('\\', '/');
      traced.add(path);
    }
  }
  for (const path of traced) {
    const inPackage = path.replace(/^.*node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?/, '');
    if (FORBIDDEN_PATHS.some((pattern) => pattern.test(path.startsWith('node_modules') || path.includes('/node_modules/') ? inPackage : path))) {
      problems.push(`rastro inclui ${path}`);
    }
  }
  const clientFiles = files.filter((file) => file.includes(`${join('.next', 'static')}`) && /\.(js|css|json)$/.test(file));
  for (const file of clientFiles) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_TEXT) if (pattern.test(text)) problems.push(`${relative(repo, file)} contém ${pattern}`);
  }
  const roots = {};
  for (const path of traced) {
    const key = path.includes('node_modules') ? 'node_modules' : path.split('/').slice(0, 2).join('/');
    roots[key] = (roots[key] ?? 0) + 1;
  }
  const manifest = { checkedAt: new Date().toISOString(), tracedFiles: traced.size, clientFiles: clientFiles.length, roots };
  return { ok: problems.length === 0, problems, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const result = checkIsolation();
  if (result.manifest) writeFileSync(join(next, 'talentum-isolation.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
  if (!result.ok) {
    console.error('Pacote da LP alcança código que não pode ir para a Vercel:');
    for (const problem of result.problems.slice(0, 50)) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`Isolamento confirmado: ${result.manifest.tracedFiles} arquivos rastreados, ${result.manifest.clientFiles} do navegador.`);
}
