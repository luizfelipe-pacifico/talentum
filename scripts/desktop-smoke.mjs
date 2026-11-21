/* Teste de fumaça do pacote desktop, no sistema em que ele foi gerado.

   Uso: `pnpm desktop:smoke` depois de `pnpm desktop:build:<sistema>`, ou
   `pnpm desktop:smoke /opt/Talentum` com o .deb instalado.

   Os testes unitários e ponta a ponta rodam contra o código-fonte e já deixaram
   passar um pacote que nem abria (docs/MEMORY-AI.md, 20/11/2026). Este script
   abre o pacote de verdade, em `release/`, com dados num diretório temporário,
   nunca no perfil de quem roda:

   1. backend: o servidor empacotado, iniciado pelo próprio binário do Electron
      como o processo principal faz, responde à saúde, recusa código de ação sem
      o segredo de bootstrap, cria o cofre, grava o banco cifrado, cria perfil e
      conta, inspeciona um PDF sintético na thread isolada, bloqueia e desbloqueia;
   2. aplicativo: o executável abre a janela, sobe o backend numa porta do
      loopback e serve a tela inicial; depois é encerrado.

   Toda senha e todo extrato aqui são sintéticos. Com SMOKE_SCREENSHOT=<arquivo>
   (macOS e Windows) guarda uma captura da tela com a janela aberta. */

import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildPdf, tableLines } from '../tests/helpers/synthetic-pdf.mjs';

const run = promisify(execFile);
const release = path.resolve(process.argv[2] ?? 'release');
const PASSWORD = 'cofre sintetico do teste de fumaca';

/** Executável e pasta `resources` do pacote desempacotado deste sistema. */
function locatePackage() {
  if (process.platform === 'win32') {
    const dir = path.join(release, 'win-unpacked');
    return { exe: path.join(dir, 'Talentum.exe'), resources: path.join(dir, 'resources') };
  }
  if (process.platform === 'darwin') {
    // O electron-builder usa `mac` para x64 e `mac-arm64` para Apple silicon.
    for (const name of ['mac-arm64', 'mac', 'mac-universal']) {
      const app = path.join(release, name, 'Talentum.app');
      if (existsSync(app)) {
        return { exe: path.join(app, 'Contents', 'MacOS', 'Talentum'), resources: path.join(app, 'Contents', 'Resources') };
      }
    }
    throw new Error(`nenhum Talentum.app em ${release}`);
  }
  // `release/linux-unpacked` do build, ou a pasta do app instalado pelo .deb (/opt/Talentum).
  const dir = existsSync(path.join(release, 'talentum')) ? release : path.join(release, 'linux-unpacked');
  return { exe: path.join(dir, 'talentum'), resources: path.join(dir, 'resources') };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthy(base) {
  try {
    const response = await fetch(`${base}/api/health/live`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(check, what, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`tempo esgotado: ${what}`);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ok  ${message}`);
}

/** Cliente mínimo do protocolo de código de ação, com o segredo de bootstrap do pacote. */
function client(base, bootstrap) {
  let cookie = '';
  return async function call(method, route, { json, form } = {}) {
    const issued = await fetch(`${base}/api/action-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Talentum-Bootstrap': bootstrap, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ method, path: route }),
    });
    if (!issued.ok) return { status: issued.status, payload: await issued.json().catch(() => null) };
    const { actionCode } = await issued.json();
    const headers = { 'X-Action-Code': actionCode, ...(cookie ? { Cookie: cookie } : {}) };
    let body;
    if (form) body = form;
    else if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const response = await fetch(`${base}${route}`, { method, headers, body });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, payload: await response.json().catch(() => null) };
  };
}

async function smokeBackend(pkg, dataDir) {
  console.log('Backend empacotado');
  await mkdir(dataDir, { recursive: true });
  const port = await freePort();
  const bootstrap = randomBytes(32).toString('base64url');
  const databasePath = path.join(dataDir, 'talentum-local.db');
  const standalone = path.join(pkg.resources, 'standalone');
  // Mesmo ambiente que electron/main.cjs monta em startPackagedBackend().
  const server = spawn(pkg.exe, [path.join(standalone, 'server.js')], {
    cwd: standalone,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: `file:${databasePath.replaceAll('\\', '/')}`,
      TALENTUM_LOCAL_BOOTSTRAP_SECRET: bootstrap,
      TALENTUM_MIGRATIONS_DIR: path.join(pkg.resources, 'app', 'prisma', 'migrations'),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(() => healthy(base), 'o backend empacotado não respondeu à saúde');
    expect(true, 'o servidor sobe com o Node do Electron e responde à saúde');

    const denied = await fetch(`${base}/api/action-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: '/api/vault/status' }),
    });
    const deniedBody = await denied.json().catch(() => null);
    expect(denied.status === 403 && deniedBody?.error?.code === 'BOOTSTRAP_DENIED', 'código de ação sem o segredo de bootstrap é recusado (403)');

    const call = client(base, bootstrap);
    const status = await call('GET', '/api/vault/status');
    expect(status.payload?.state === 'uninitialized', 'banco novo começa sem cofre');
    const setup = await call('POST', '/api/vault/setup', { json: { password: PASSWORD } });
    expect(setup.status === 201, `o cofre é criado (status ${setup.status})`);
    await call('POST', '/api/vault/recovery-code/confirm');

    const handle = await open(databasePath, 'r');
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    await handle.close();
    expect(!header.toString('latin1').startsWith('SQLite format 3'), 'o arquivo do banco está cifrado (libSQL nativo carregou)');

    const profile = await call('POST', '/api/profile', { json: {} });
    expect(profile.status === 200 || profile.status === 201, `o perfil é criado (status ${profile.status})`);
    const account = await call('POST', '/api/accounts', {
      json: { name: 'Conta sintética do teste de fumaça', type: 'checking', institutionName: 'Instituição sintética' },
    });
    expect(account.status === 201, `a conta é criada (status ${account.status})`);

    const pdf = buildPdf([
      [
        [40, 800, 'EXTRATO DE CONTA SINTETICO'],
        [40, 785, 'Periodo ate 30/09/2026'],
        ...tableLines([
          ['01/09/2026', 'SALDO ANTERIOR', '1.000,00'],
          ['02/09/2026', 'PIX RECEBIDO FICTICIO', '500,00', '1.500,00'],
          ['03/09/2026', 'CONTA DE LUZ SINTETICA', '-120,30', '1.379,70'],
        ]),
      ],
    ]);
    const form = new FormData();
    form.set('file', new File([pdf], 'extrato-sintetico.pdf', { type: 'application/pdf' }));
    const inspected = await call('POST', '/api/imports/inspect', { form });
    expect(inspected.status === 200 && inspected.payload?.format === 'pdf', `o PDF é lido na thread isolada (status ${inspected.status})`);

    const locked = await call('POST', '/api/vault/lock');
    expect(locked.status === 200 || locked.status === 204, `o cofre bloqueia (status ${locked.status})`);
    const unlocked = await call('POST', '/api/vault/unlock', { json: { password: PASSWORD } });
    expect(unlocked.status === 200, `o cofre desbloqueia com a senha (status ${unlocked.status})`);
  } finally {
    server.kill();
  }
}

/** Portas do loopback em escuta pelo app ou por um processo filho dele.

   Procura pela árvore de processos, não pelo nome: o servidor do Next troca o
   próprio título para `next-server`, e outro servidor de desenvolvimento na
   máquina responderia à mesma rota de saúde. */
async function listeningPorts(rootPid) {
  if (process.platform === 'win32') {
    const script = [
      '$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId',
      `$tree = @(${rootPid}); $grew = $true`,
      'while ($grew) { $grew = $false; foreach ($p in $all) { if ($tree -contains $p.ParentProcessId -and -not ($tree -contains $p.ProcessId)) { $tree += $p.ProcessId; $grew = $true } } }',
      'Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -ErrorAction SilentlyContinue | Where-Object { $tree -contains $_.OwningProcess } | ForEach-Object { $_.LocalPort }',
    ].join('; ');
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', script]).catch(() => ({ stdout: '' }));
    return stdout.split(/\s+/).filter(Boolean).map(Number);
  }
  const { stdout: table } = await run('ps', ['-A', '-o', 'pid=,ppid=']);
  const parents = table.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const tree = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [pid, ppid] of parents) {
      if (tree.has(ppid) && !tree.has(pid)) {
        tree.add(pid);
        grew = true;
      }
    }
  }
  const { stdout } = await run('lsof', ['-nP', '-a', '-p', [...tree].join(','), '-iTCP@127.0.0.1', '-sTCP:LISTEN', '-Fn']).catch(() => ({ stdout: '' }));
  return [...stdout.matchAll(/^n127\.0\.0\.1:(\d+)$/gm)].map((match) => Number(match[1]));
}

async function screenshot(file) {
  if (process.platform === 'darwin') await run('screencapture', ['-x', file]);
  else if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
      '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '$i = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
      '$g = [System.Drawing.Graphics]::FromImage($i)',
      '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
      `$i.Save('${file.replaceAll("'", "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    ].join('; ');
    await run('powershell.exe', ['-NoProfile', '-Command', script]);
  }
}

async function stopApp(child) {
  if (process.platform === 'win32') await run('taskkill', ['/pid', String(child.pid), '/t', '/f']).catch(() => {});
  else child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(10_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function smokeApp(pkg, dataDir) {
  console.log('Aplicativo empacotado');
  const home = path.join(dataDir, 'home');
  await mkdir(home, { recursive: true });
  const child = spawn(pkg.exe, [`--user-data-dir=${path.join(dataDir, 'perfil')}`], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), APPDATA: path.join(home, 'AppData'), ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  let exited = null;
  child.once('exit', (code, signal) => {
    exited = { code, signal };
  });
  try {
    const base = await waitFor(async () => {
      if (exited) throw new Error(`o aplicativo encerrou ao abrir (${JSON.stringify(exited)})`);
      for (const port of await listeningPorts(child.pid)) {
        if (await healthy(`http://127.0.0.1:${port}`)) return `http://127.0.0.1:${port}`;
      }
      return null;
    }, 'o aplicativo não subiu o backend local');
    expect(true, 'o executável abre e sobe o backend no loopback');
    const page = await fetch(`${base}/`);
    const html = await page.text();
    expect(page.ok && /<html/i.test(html), `a tela inicial é servida (status ${page.status})`);
    // A janela carrega depois da saúde; espera ela aparecer antes da captura.
    await sleep(5000);
    expect(!exited, 'o aplicativo continua aberto depois de carregar a janela');
    const files = await readdir(path.join(dataDir, 'perfil')).catch(() => []);
    expect(files.length > 0, 'os dados do teste ficam no diretório temporário');
    if (process.env.SMOKE_SCREENSHOT) await screenshot(path.resolve(process.env.SMOKE_SCREENSHOT)).catch((error) => console.warn(`captura falhou: ${error.message}`));
  } finally {
    await stopApp(child);
  }
}

const pkg = locatePackage();
if (!existsSync(pkg.exe)) throw new Error(`pacote não encontrado: ${pkg.exe}. Rode pnpm desktop:build:<sistema> antes.`);
const dataDir = await mkdtemp(path.join(tmpdir(), 'talentum-smoke-'));
try {
  await smokeBackend(pkg, path.join(dataDir, 'backend'));
  await smokeApp(pkg, path.join(dataDir, 'app'));
  console.log('Teste de fumaça do pacote passou.');
} finally {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
