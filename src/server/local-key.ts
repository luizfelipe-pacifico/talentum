/* Chave criptográfica do dispositivo.

   Existe por uma exigência de `docs/ONBOARDING.md`: uma chave PIX é CPF, CNPJ,
   telefone ou e-mail, e esses espaços de valores são pequenos e previsíveis.
   Um hash simples de CPF é quebrado por força bruta em segundos — só existem
   10^11 combinações. Por isso o índice de comparação usa **HMAC com segredo do
   dispositivo**, e o valor recuperável usa cifragem autenticada.

   A chave mora em arquivo próprio ao lado do SQLite, nunca dentro dele: se o
   banco for copiado sozinho — um backup, um arquivo esquecido numa pasta
   sincronizada — os identificadores continuam ilegíveis.

   Limite conhecido e declarado: isto protege contra furto do banco, não contra
   comprometimento do dispositivo inteiro. Quem lê o arquivo do banco também lê
   o arquivo da chave. `docs/SECURITY.md` já enquadra o risco assim ao tratar
   "roubo do banco local" com permissões do sistema e ausência de dados em log.
   O cofre do sistema operacional exigiria IPC do Electron e está registrado
   como evolução em `docs/decisions/0003-chave-local-do-dispositivo.md`. */

import { hkdfSync, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const KEY_BYTES = 32;
const SALT = 'talentum-local-key-v1';

/**
 * Caminho do arquivo de chave.
 *
 * Derivado do `DATABASE_URL` para que chave e banco vivam juntos — inclusive
 * dentro do volume do Docker, que é o que preserva os dois entre recriações do
 * container. Prisma resolve caminho relativo a partir do diretório do schema,
 * e aqui a regra é a mesma, senão os dois apontariam para lugares diferentes.
 */
export function localKeyPath(): string {
  const override = process.env.TALENTUM_LOCAL_KEY_FILE;
  if (override && override.trim().length > 0) return override.trim();

  const url = process.env.DATABASE_URL ?? 'file:../temp/talentum-local.db';
  const raw = url.startsWith('file:') ? url.slice('file:'.length) : url;
  const databasePath = isAbsolute(raw) ? raw : resolve(process.cwd(), 'prisma', raw);

  return join(dirname(databasePath), 'talentum-local.key');
}

let cached: Promise<Buffer> | null = null;

/**
 * Lê a chave mestra, criando-a na primeira execução.
 *
 * A promessa é memoizada: chamadas concorrentes no mesmo processo não podem
 * gerar duas chaves e sobrescrever uma com a outra.
 */
function loadMasterKey(): Promise<Buffer> {
  if (cached) return cached;

  cached = (async () => {
    const path = localKeyPath();

    try {
      const existing = await readFile(path);
      if (existing.byteLength >= KEY_BYTES) return existing.subarray(0, KEY_BYTES);
      // Arquivo truncado: seguir com ele produziria chave fraca em silêncio.
      throw new Error('LOCAL_KEY_TOO_SHORT');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const generated = randomBytes(KEY_BYTES);
    await mkdir(dirname(path), { recursive: true });
    // `wx` falha se outro processo criou o arquivo nesse intervalo.
    try {
      await writeFile(path, generated, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const raced = await readFile(path);
        return raced.subarray(0, KEY_BYTES);
      }
      throw error;
    }

    // Permissão restrita onde o sistema de arquivos suporta. No Windows a
    // chamada é inócua, e o controle efetivo é a ACL do diretório do usuário.
    try {
      await chmod(path, 0o600);
    } catch {
      /* sistema de arquivos sem suporte a modo POSIX */
    }

    return generated;
  })();

  return cached;
}

export type KeyPurpose = 'pix-index' | 'pix-value';

/**
 * Deriva uma subchave por finalidade.
 *
 * Separar as finalidades por HKDF impede que a chave do índice de comparação e
 * a chave de cifragem sejam a mesma: comprometer uma não entrega a outra, e
 * nenhuma delas é a chave mestra.
 */
export async function deriveKey(purpose: KeyPurpose): Promise<Buffer> {
  const master = await loadMasterKey();
  const derived = hkdfSync('sha256', master, SALT, purpose, KEY_BYTES);
  return Buffer.from(derived);
}

/** Somente para teste: descarta o cache do processo. */
export function resetLocalKeyCache(): void {
  cached = null;
}
