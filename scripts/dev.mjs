import { execFileSync, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import { platform } from 'node:os';
import { resolve } from 'node:path';

const port = 3000;
const databaseUrl = process.env.DATABASE_URL ?? 'file:../temp/talentum-local.db';

function applyMigrations() {
  const prismaCli = resolve('node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

function killProcessOnPort() {
  if (platform() === 'win32') {
    let netstatOutput = '';

    try {
      netstatOutput = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    } catch {
      return;
    }

    const processIds = new Set(
      netstatOutput
        .split(/\r?\n/)
        .filter((line) => line.includes(`:${port}`) && line.includes('LISTENING'))
        .map((line) => line.trim().split(/\s+/).at(-1))
        .filter(Boolean),
    );

    for (const processId of processIds) {
      try {
        execFileSync('taskkill', ['/PID', processId, '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // The process may have exited between netstat and taskkill.
      }
    }

    return;
  }

  try {
    const processIds = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((processId) => processId.trim())
      .filter(Boolean);

    for (const processId of processIds) {
      execFileSync('kill', ['-9', processId], { stdio: 'ignore' });
    }
  } catch {
    // No process is listening on the port, or lsof is unavailable.
  }
}

function isPortAvailable() {
  return new Promise((resolveAvailability) => {
    const server = net.createServer();

    server.once('error', () => resolveAvailability(false));
    server.once('listening', () => {
      server.close(() => resolveAvailability(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitForPortRelease() {
  const timeoutAt = Date.now() + 5000;

  while (!(await isPortAvailable())) {
    if (Date.now() >= timeoutAt) {
      throw new Error(`Não foi possível liberar a porta ${port}.`);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

killProcessOnPort();
await waitForPortRelease();
applyMigrations();

if (existsSync('.next')) {
  rmSync('.next', { recursive: true, force: true });
}

const nextBinary = resolve('node_modules', 'next', 'dist', 'bin', 'next');
const nextProcess = spawn(
  process.execPath,
  [nextBinary, 'dev', '-H', '127.0.0.1', '-p', String(port)],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl },
  },
);

nextProcess.on('error', (error) => {
  console.error(`Não foi possível iniciar o Next.js: ${error.message}`);
  process.exitCode = 1;
});

nextProcess.on('exit', (exitCode, signal) => {
  process.exitCode = exitCode ?? (signal ? 1 : 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => nextProcess.kill(signal));
}
