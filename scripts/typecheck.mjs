import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { clientIsCurrent } from './prisma-client.mjs';

/* Checagem de tipos do app local.

   Os tipos do Prisma vêm do cliente gerado. Com ele desatualizado, `tsc`
   acusava erros falsos; regenerar sempre, por outro lado, falhava no Windows
   com o servidor de desenvolvimento aberto. Gera só quando o schema mudou. */

const require = createRequire(import.meta.url);
const run = (bin, args) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit' });

function generatedSchema() {
  try {
    const clientDir = dirname(require.resolve('@prisma/client/package.json'));
    const path = resolve(clientDir, '..', '..', '.prisma', 'client', 'schema.prisma');
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

if (!clientIsCurrent(readFileSync('prisma/schema.prisma', 'utf8'), generatedSchema())) {
  try {
    run(resolve('node_modules', 'prisma', 'build', 'index.js'), ['generate']);
  } catch {
    console.error('Não foi possível gerar o Prisma Client. Feche o servidor de desenvolvimento e tente de novo.');
    process.exit(1);
  }
}

try {
  run(resolve('node_modules', 'typescript', 'bin', 'tsc'), ['--noEmit']);
} catch {
  process.exit(1);
}
