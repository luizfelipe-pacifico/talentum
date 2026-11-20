import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/* Devolve o next-env.d.ts versionado, que o servidor isolado (scripts/e2e-server.mjs)
   reescreveu ao subir o Next com o distDir .next-e2e. */
export default function globalTeardown() {
  const backup = resolve('temp', 'e2e', 'next-env.d.ts.orig');
  if (existsSync(backup)) copyFileSync(backup, resolve('next-env.d.ts'));
}
