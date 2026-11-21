/* Thread de teste que relata o que recebeu: ambiente, argumentos e dados.
   Serve para provar que a thread do PDF não herda segredos do servidor. */
import { parentPort, workerData } from 'node:worker_threads';

parentPort.postMessage({
  envKeys: Object.keys(process.env),
  argv: process.argv.slice(2),
  workerDataKeys: Object.keys(workerData),
  bytesIsArrayBuffer: workerData.bytes instanceof ArrayBuffer,
  byteLength: workerData.bytes.byteLength,
  limits: workerData.limits,
});
