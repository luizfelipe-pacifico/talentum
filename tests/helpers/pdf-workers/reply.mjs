/* Thread de teste que responde exatamente o JSON recebido em `argv`, para
   simular uma thread comprometida ou com defeito que devolve forma errada. */
import { parentPort } from 'node:worker_threads';

parentPort.postMessage(JSON.parse(process.argv.at(-1)));
