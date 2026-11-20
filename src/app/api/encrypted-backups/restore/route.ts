import { EncryptedBackupError, MAX_BACKUP_BYTES, PASSPHRASE_MAX } from '@/server/backup/encrypted';
import { RestorePointError } from '@/server/backup/restore-core';
import { scheduleEncryptedRestore } from '@/server/backup/service';
import { fail, ok, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Agenda a restauração de um backup cifrado.

   Recebe o arquivo e a senha em `multipart/form-data`. O tamanho declarado é
   conferido antes de ler o corpo (docs/SECURITY.md, item 23), o arquivo é
   decifrado em memória, verificado (tag GCM, SHA-256 interno, integridade do
   SQLite e versão do schema) e só então o banco atual vai para um ponto
   automático e a troca é agendada para o próximo desbloqueio. A senha não é
   gravada nem registrada. */

const MULTIPART_OVERHEAD = 64 * 1024;

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  const declared = Number(request.headers.get('Content-Length') ?? 'NaN');
  if (!Number.isFinite(declared) || declared > MAX_BACKUP_BYTES + MULTIPART_OVERHEAD)
    return fail('BACKUP_TOO_LARGE', 'O arquivo passa do limite de 200 MB para um backup do Talentum.', 413);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data'))
    return fail('INVALID_BACKUP_UPLOAD', 'Envie o arquivo de backup e a senha.', 415);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('INVALID_BACKUP_UPLOAD', 'Envie o arquivo de backup e a senha.', 400);
  }
  const file = form.get('file');
  const passphrase = form.get('passphrase');
  if (!(file instanceof File) || typeof passphrase !== 'string' || passphrase.length === 0 || passphrase.length > PASSPHRASE_MAX)
    return fail('INVALID_BACKUP_UPLOAD', 'Envie o arquivo de backup e a senha.', 400);
  if (file.size > MAX_BACKUP_BYTES) return fail('BACKUP_TOO_LARGE', 'O arquivo passa do limite de 200 MB para um backup do Talentum.', 413);

  try {
    const result = await scheduleEncryptedRestore(await getLocalProfileId(), Buffer.from(await file.arrayBuffer()), passphrase);
    return ok({ scheduled: true, restartRequired: true, safetyRestorePointId: result.safetyRestorePointId });
  } catch (error) {
    if (error instanceof EncryptedBackupError) {
      if (error.code === 'WRONG_PASSPHRASE_OR_DAMAGED')
        return fail('BACKUP_PASSPHRASE_OR_DAMAGED', 'Não foi possível abrir o arquivo: a senha não confere ou o arquivo foi alterado.', 400);
      if (error.code === 'UNSUPPORTED_VERSION')
        return fail('BACKUP_UNSUPPORTED_VERSION', 'Este backup foi gerado por uma versão do Talentum que esta versão não lê.', 400);
      return fail('NOT_A_BACKUP', 'O arquivo escolhido não é um backup cifrado do Talentum.', 400);
    }
    if (error instanceof RestorePointError) {
      if (error.code === 'SCHEMA_UNKNOWN')
        return fail('BACKUP_INCOMPATIBLE', 'Este backup foi gerado por uma versão do Talentum que esta versão não reconhece.', 409);
      if (error.code === 'SNAPSHOT_FAILED')
        return fail('RESTORE_FAILED', 'Não foi possível guardar os dados atuais antes de restaurar. Nada foi alterado.', 500);
      return fail('BACKUP_DAMAGED', 'O banco dentro do backup não passou na verificação de integridade. Nada foi alterado.', 409);
    }
    throw error;
  }
}
