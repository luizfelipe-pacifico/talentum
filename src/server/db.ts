import type { PrismaClient } from '@prisma/client';
import { currentPrisma } from './vault/database.ts';

/* Acesso ao banco local, que é cifrado e só abre com o cofre desbloqueado
   (docs/decisions/0009-local-vault-and-encrypted-database.md).

   `db` continua sendo importado como antes pelas rotas e pelo domínio. Por
   baixo, é um proxy para o Prisma do banco aberto; com o cofre bloqueado, o
   primeiro acesso lança `VaultLockedError` em vez de tocar em qualquer arquivo.
   É a última camada: a sessão já é exigida na emissão e no consumo do código
   de ação (src/server/action-codes.ts). */

export class VaultLockedError extends Error {
  readonly code = 'VAULT_LOCKED';

  constructor() {
    super('VAULT_LOCKED');
    this.name = 'VaultLockedError';
  }
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentPrisma();
    if (!client) throw new VaultLockedError();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
