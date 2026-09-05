import { spawn } from 'node:child_process';
import net from 'node:net';

const port = 3000;
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const nextProcess = spawn(pnpmCommand, ['run', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
});

function waitForNext() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > 60000) {
          reject(new Error('Next.js nao iniciou na porta 3000 em 60 segundos.'));
          return;
        }
        setTimeout(check, 250);
      });
    };
    check();
  });
}

try {
  await waitForNext();
  const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const electronProcess = spawn(electronCommand, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, TALENTUM_URL: `http://localhost:${port}` },
  });

  electronProcess.on('exit', (exitCode, signal) => {
    nextProcess.kill('SIGTERM');
    process.exitCode = exitCode ?? (signal ? 1 : 0);
  });
} catch (error) {
  nextProcess.kill('SIGTERM');
  console.error(error.message);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    nextProcess.kill(signal);
  });
}