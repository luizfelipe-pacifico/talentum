import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/* Abre o Electron sobre o backend local.

   Duas situações são atendidas pelo mesmo comando:

   1. nada respondendo na porta: este script sobe o servidor de desenvolvimento
      e abre a janela quando ele estiver pronto;
   2. servidor já no ar, vindo do Docker (`pnpm docker:up`) ou de um `pnpm dev`
      em outro terminal: a janela é anexada a ele e nenhum servidor novo é
      iniciado. Subir um segundo servidor sobre o mesmo SQLite, ou matar o
      container para assumir a porta, destruiria o ambiente de quem já estava
      trabalhando. */

const port = 3000;
const require = createRequire(import.meta.url);
const devScript = resolve('scripts', 'dev.mjs');
/* Resolvido só na hora de abrir a janela. O pacote `electron` lança quando o
   download do binário ficou incompleto, e um stack trace de `require` não diz
   o que fazer. */
function resolveElectronBinary() {
  try {
    return require('electron');
  } catch (error) {
    throw new Error(
      `O binário do Electron não está disponível: ${error.message}\n` +
        'Execute `node node_modules/electron/install.js` ou reinstale as dependências.',
    );
  }
}

/* A janela carrega `localhost`, o endereço usado pela documentação e pelo fluxo
   Docker. O servidor continua escutando somente no loopback IPv4: expor a API
   local além do loopback contraria docs/HOW-IT-WORKS.md.

   Em distribuições onde `localhost` resolve primeiro para `::1`, o cliente faz
   o fallback para IPv4 (Happy Eyeballs, RFC 8305). O endereço IPv4 explícito
   fica como segunda tentativa para que uma resolução hostil não deixe a janela
   em branco sem explicação. */
const candidateUrls = process.env.TALENTUM_URL
  ? [process.env.TALENTUM_URL.replace(/\/+$/, '')]
  : [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

/* Generoso de propósito: a primeira chamada a uma rota do Next em
   desenvolvimento paga a compilação dela. Um limite curto aqui rebaixaria o
   endereço preferido só porque o servidor ainda estava compilando. Quando não
   há ninguém escutando, a conexão é recusada de imediato e o limite não pesa. */
const probeTimeoutMs = 15000;

/** Devolve a URL quando o backend local responde nela, ou `null`. */
function probe(baseUrl) {
  return new Promise((resolveProbe) => {
    const request = http.get(`${baseUrl}/api/health/live`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        /* Só o healthcheck do próprio Talentum vale como servidor adotável.
           Outro processo qualquer na mesma porta não é o backend local e não
           pode ser assumido em silêncio. */
        const healthy = response.statusCode === 200 && body.includes('"status":"ok"');
        resolveProbe(healthy ? baseUrl : null);
      });
    });

    request.setTimeout(probeTimeoutMs, () => request.destroy());
    request.once('error', () => resolveProbe(null));
  });
}

async function findRunningServer() {
  for (const baseUrl of candidateUrls) {
    if (await probe(baseUrl)) return baseUrl;
  }

  return null;
}

async function waitForServer() {
  const timeoutAt = Date.now() + 60000;

  for (;;) {
    const found = await findRunningServer();
    if (found) return found;

    if (Date.now() >= timeoutAt) {
      throw new Error(`O backend local não respondeu em ${candidateUrls[0]} dentro de 60 segundos.`);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

/* Existe somente quando este script iniciou o servidor. Continua `null` no modo
   anexado, e é o que garante que um container ou terminal alheio não seja
   encerrado ao fechar a janela. */
let nextProcess = null;
let electronProcess;
/* Encerramento pedido por quem está usando: o servidor cair depois disso é
   esperado e não merece aviso de erro. */
let shuttingDown = false;

const stopNext = (signal = 'SIGTERM') => nextProcess?.kill(signal);

const alreadyRunning = await findRunningServer();

if (alreadyRunning) {
  console.log(`Backend local já respondendo em ${alreadyRunning}. O Electron será anexado a ele.`);
} else {
  nextProcess = spawn(process.execPath, [devScript], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  nextProcess.on('error', (error) => {
    console.error(`Não foi possível iniciar o servidor local: ${error.message}`);
    process.exitCode = 1;
  });
}

try {
  const appUrl = alreadyRunning ?? (await waitForServer());

  if (appUrl !== candidateUrls[0]) {
    console.log(`${candidateUrls[0]} não respondeu; a janela usará ${appUrl}.`);
  }

  electronProcess = spawn(resolveElectronBinary(), ['.'], {
    stdio: 'inherit',
    env: { ...process.env, TALENTUM_URL: appUrl },
  });

  electronProcess.on('error', (error) => {
    console.error(`Não foi possível iniciar o Electron: ${error.message}`);
    stopNext();
    process.exitCode = 1;
  });

  electronProcess.on('exit', (exitCode, signal) => {
    shuttingDown = true;
    stopNext();
    process.exitCode = exitCode ?? (signal ? 1 : 0);
  });

  // Servidor próprio que morre deixaria a janela em branco sem explicação.
  nextProcess?.on('exit', (exitCode, signal) => {
    if (!shuttingDown && electronProcess?.exitCode === null) {
      console.error('O servidor local encerrou antes da janela; o Electron será fechado.');
      electronProcess.kill('SIGTERM');
    }

    if (process.exitCode === undefined) process.exitCode = exitCode ?? (signal ? 1 : 0);
  });
} catch (error) {
  stopNext();
  console.error(error.message);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    electronProcess?.kill(signal);
    stopNext(signal);
  });
}
