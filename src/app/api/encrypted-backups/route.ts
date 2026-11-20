import { z } from 'zod';
import { EncryptedBackupError, PASSPHRASE_MAX, PASSPHRASE_MIN } from '@/server/backup/encrypted';
import { RestorePointError } from '@/server/backup/restore-core';
import { createEncryptedBackup } from '@/server/backup/service';
import { download } from '@/server/download';
import { fail, readJson, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Backup cifrado com senha (Stage 18), só local.

   POST, e não GET, porque a senha vai no corpo: numa query string ela ficaria
   no histórico e em logs. A resposta é o próprio arquivo, como anexo; nada do
   backup nem a senha ficam gravados no computador pelo backend. Formato e
   parâmetros em docs/decisions/0007-local-encrypted-backup.md. */

const schema = z.object({ passphrase: z.string().min(PASSPHRASE_MIN).max(PASSPHRASE_MAX) }).strict();

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('WEAK_PASSPHRASE', `A senha precisa ter de ${PASSPHRASE_MIN} a ${PASSPHRASE_MAX} caracteres.`, 400);
  try {
    const file = await createEncryptedBackup(await getLocalProfileId(), parsed.data.passphrase);
    const day = new Date().toISOString().slice(0, 10);
    return download(file, `talentum-backup-${day}.talentum`, 'application/octet-stream');
  } catch (error) {
    if (error instanceof EncryptedBackupError) return fail('WEAK_PASSPHRASE', `A senha precisa ter de ${PASSPHRASE_MIN} a ${PASSPHRASE_MAX} caracteres.`, 400);
    if (error instanceof RestorePointError)
      return fail('ENCRYPTED_BACKUP_FAILED', 'Não foi possível gerar o backup cifrado. Os dados atuais não foram alterados.', 500);
    throw error;
  }
}
