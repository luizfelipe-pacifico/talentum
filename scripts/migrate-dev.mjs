import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/* Cria uma migration nova com `prisma migrate dev`, contra um banco de rascunho.

   O banco de uso é cifrado e só abre com a senha; o CLI do Prisma não lê esse
   arquivo. Para gerar o SQL de uma mudança de schema, o Prisma precisa de um
   banco em claro com as migrations anteriores aplicadas: este script usa um
   descartável em temp/migrate-scratch.db, sem nenhum dado. A migration gerada
   em prisma/migrations/ é aplicada ao banco cifrado no próximo desbloqueio
   (src/server/vault/migrations.ts). Argumentos extras seguem para o Prisma,
   por exemplo `pnpm prisma:migrate --name nova_tabela`. */

mkdirSync(resolve('temp'), { recursive: true });
execFileSync(process.execPath, [resolve('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:../temp/migrate-scratch.db' },
});
