/* Caminhos do banco local e dos pontos de restauração.

   Todo caminho de arquivo que o backup escreve é derivado aqui, no servidor, a
   partir do `DATABASE_URL`: nenhum nome, pasta ou extensão vem da requisição.
   Assim não existe travessia de diretório possível pela API — o único dado
   variável de um nome de arquivo é um UUID validado (`restorePointFile`).

   A regra de resolução é a do Prisma: caminho relativo parte da pasta do
   schema (`prisma/`). É a mesma de `local-key.ts`, para que banco, chave e
   pontos de restauração vivam sempre juntos — inclusive no volume do Docker e
   na pasta de dados do aplicativo empacotado.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { dirname, isAbsolute, join, resolve } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caminho absoluto do arquivo SQLite em uso. */
export function databaseFilePath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const url = env.DATABASE_URL ?? 'file:../temp/talentum-local.db';
  const raw = (url.startsWith('file:') ? url.slice('file:'.length) : url).split('?')[0];
  return isAbsolute(raw) ? raw : resolve(cwd, 'prisma', raw);
}

/**
 * Pasta dos pontos de restauração: `talentum-backups/`, ao lado do banco.
 *
 * `TALENTUM_BACKUP_DIR` existe só para teste e para quem guarda o banco num
 * volume e quer as cópias em outro. O padrão nunca cai dentro do repositório
 * fora de `temp/`, que o Git ignora.
 */
export function backupDirectory(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const override = env.TALENTUM_BACKUP_DIR?.trim();
  if (override) return resolve(override);
  return join(dirname(databaseFilePath(env, cwd)), 'talentum-backups');
}

export function isRestorePointId(value: string): boolean {
  return UUID.test(value);
}

/**
 * Arquivo de um ponto de restauração. Recusa qualquer ID que não seja UUID:
 * é a única parte variável do nome, e a checagem vem antes de montar o caminho.
 */
export function restorePointFile(dir: string, id: string, extension: 'sqlite' | 'key' | 'json'): string {
  if (!isRestorePointId(id)) throw new Error('INVALID_RESTORE_POINT_ID');
  const base = resolve(dir);
  const file = join(base, `${id.toLowerCase()}.${extension}`);
  // Defesa em profundidade: o resultado precisa continuar dentro da pasta.
  if (dirname(file) !== base) throw new Error('INVALID_RESTORE_POINT_ID');
  return file;
}

/** Arquivos da restauração agendada para o próximo desbloqueio do cofre. */
export function pendingRestoreFiles(dir: string) {
  const base = resolve(dir);
  return {
    database: join(base, 'pending-restore.sqlite'),
    key: join(base, 'pending-restore.key'),
    manifest: join(base, 'pending-restore.json'),
  };
}
