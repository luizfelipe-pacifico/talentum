import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const port = 3000;
const localUrl = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const devScript = resolve('scripts', 'dev.mjs');
const electronBinary = require('electron');
let electronProcess;
const nextProcess = spawn(process.execPath, [devScript], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
});

nextProcess.on('error', (error) => {
  console.error(`Não foi possível iniciar o servidor local: ${error.message}`);
  process.exitCode = 1;
});

function waitForNext() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const request = http.get(localUrl, (response) => {
        response.resume();

        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        retry();
      });

      request.setTimeout(2000, () => request.destroy());
      request.once('error', retry);

      function retry() {
        if (Date.now() - startedAt > 60000) {
          reject(new Error(`Next.js não respondeu em ${localUrl} dentro de 60 segundos.`));
          return;
        }

        setTimeout(check, 250);
      }
    };
    check();
  });
}

try {
  await waitForNext();
  electronProcess = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, TALENTUM_URL: localUrl },
  });

  electronProcess.on('error', (error) => {
    console.error(`Não foi possível iniciar o Electron: ${error.message}`);
    nextProcess.kill('SIGTERM');
    process.exitCode = 1;
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
    electronProcess?.kill(signal);
    nextProcess.kill(signal);
  });
}
