import { execFileSync, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { platform } from 'node:os';

const port = 3000;

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

killProcessOnPort();

if (existsSync('.next')) {
  rmSync('.next', { recursive: true, force: true });
}

const nextCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const nextProcess = spawn(nextCommand, ['exec', 'next', 'dev', '-p', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
});

nextProcess.on('exit', (exitCode, signal) => {
  process.exitCode = exitCode ?? (signal ? 1 : 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => nextProcess.kill(signal));
}