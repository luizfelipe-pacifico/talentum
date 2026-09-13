/* Mapeamentos de coluna reutilizáveis.

   `docs/ROUTING_MVP.md`, Feature 4, prevê `CsvMappingProfile` como "mapeamento
   reutilizável de colunas". Sem ele a pessoa reconfere as mesmas colunas a cada
   extrato do mesmo banco, mês após mês — e cada reconferência é uma chance de
   errar o sinal de um lançamento.

   O reconhecimento é pela **assinatura do cabeçalho**, não pelo nome do arquivo
   nem pela instituição escolhida: é o layout que se repete. Toda consulta é
   escopada por `profileId` (docs/ESTRUTURA_DE_DADOS.md, §4). */

import { db } from '@/server/db';
import type { ColumnRole, CsvDialect, CsvMapping } from './csv.ts';
import type { StatementInspection } from './inspect.ts';

/** Papéis aceitos, na mesma ordem usada pela interface. */
const ROLES: readonly ColumnRole[] = [
  'date',
  'description',
  'amount',
  'debitAmount',
  'creditAmount',
  'direction',
  'externalId',
  'balance',
  'document',
  'ignore',
];

export type SavedMapping = {
  id: string;
  name: string;
  institutionName: string | null;
  mapping: CsvMapping;
  dialect: Partial<CsvDialect>;
  updatedAt: Date;
};

/** Serializa os papéis como lista separada por vírgula, como o schema define. */
function serializeRoles(roles: ColumnRole[]): string {
  return roles.join(',');
}

/**
 * Lê os papéis persistidos, descartando o registro se algum for desconhecido.
 *
 * Um papel que a versão atual não entende viraria `ignore` silenciosamente e a
 * coluna sumiria da importação. Melhor recusar o mapeamento inteiro e voltar à
 * inferência, que a pessoa confere na tela.
 */
function parseRoles(value: string): ColumnRole[] | null {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!ROLES.includes(part as ColumnRole)) return null;
  }
  return parts as ColumnRole[];
}

/**
 * Procura um mapeamento salvo para o layout do arquivo.
 *
 * Devolve `null` sem assinatura, sem registro ou com registro ilegível — nesses
 * casos a inferência automática assume e a pessoa confere na tela.
 */
export async function findSavedMapping(
  profileId: string,
  headerSignature: string | null,
): Promise<SavedMapping | null> {
  if (!headerSignature) return null;

  const saved = await db.csvMappingProfile.findFirst({
    where: { profileId, headerSignature },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      separator: true,
      hasHeader: true,
      decimalSeparator: true,
      roles: true,
      updatedAt: true,
      institution: { select: { name: true } },
    },
  });
  if (!saved) return null;

  const roles = parseRoles(saved.roles);
  if (!roles) return null;

  return {
    id: saved.id,
    name: saved.name,
    institutionName: saved.institution?.name ?? null,
    mapping: { roles },
    dialect: {
      separator: saved.separator,
      hasHeader: saved.hasHeader,
      decimalSeparator: saved.decimalSeparator as CsvDialect['decimalSeparator'],
    },
    updatedAt: saved.updatedAt,
  };
}

/**
 * Gera um nome livre para o mapeamento.
 *
 * O schema exige `(profileId, name)` único. O nome é rótulo para a pessoa
 * reconhecer o mapeamento, então a colisão é resolvida por sufixo em vez de
 * recusar a gravação.
 */
async function availableName(profileId: string, preferred: string): Promise<string> {
  const base = preferred.trim().slice(0, 80) || 'Mapeamento';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base} (${attempt + 1})`;
    const taken = await db.csvMappingProfile.findFirst({
      where: { profileId, name: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/**
 * Grava ou atualiza o mapeamento conferido para este layout.
 *
 * Só faz sentido em CSV com cabeçalho: sem assinatura não há o que reconhecer
 * depois. Chamada apenas quando a pessoa pede para lembrar — um mapeamento
 * salvo sem consentimento seria reaplicado em silêncio na próxima importação.
 */
export async function rememberMapping(
  profileId: string,
  inspection: StatementInspection,
  accountId: string,
): Promise<SavedMapping | null> {
  if (inspection.format !== 'csv') return null;
  if (!inspection.headerSignature || !inspection.mapping || !inspection.dialect) return null;

  const account = await db.account.findFirst({
    where: { id: accountId, profileId },
    select: { institutionId: true, institution: { select: { name: true } }, name: true },
  });
  if (!account) return null;

  const existing = await db.csvMappingProfile.findFirst({
    where: { profileId, headerSignature: inspection.headerSignature },
    select: { id: true },
  });

  const data = {
    institutionId: account.institutionId,
    separator: inspection.dialect.separator,
    hasHeader: inspection.dialect.hasHeader,
    decimalSeparator: inspection.dialect.decimalSeparator,
    roles: serializeRoles(inspection.mapping.roles),
    headerSignature: inspection.headerSignature,
  };

  if (existing) {
    const updated = await db.csvMappingProfile.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, institution: { select: { name: true } }, updatedAt: true },
    });
    return {
      id: updated.id,
      name: updated.name,
      institutionName: updated.institution?.name ?? null,
      mapping: inspection.mapping,
      dialect: inspection.dialect,
      updatedAt: updated.updatedAt,
    };
  }

  const name = await availableName(profileId, account.institution?.name ?? account.name);
  const created = await db.csvMappingProfile.create({
    data: { profileId, name, ...data },
    select: { id: true, name: true, institution: { select: { name: true } }, updatedAt: true },
  });

  return {
    id: created.id,
    name: created.name,
    institutionName: created.institution?.name ?? null,
    mapping: inspection.mapping,
    dialect: inspection.dialect,
    updatedAt: created.updatedAt,
  };
}

/** Mapeamentos salvos do perfil, do mais recente para o mais antigo. */
export async function listSavedMappings(profileId: string) {
  const rows = await db.csvMappingProfile.findMany({
    where: { profileId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      separator: true,
      hasHeader: true,
      decimalSeparator: true,
      roles: true,
      updatedAt: true,
      institution: { select: { id: true, name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    institution: row.institution,
    separator: row.separator,
    hasHeader: row.hasHeader,
    decimalSeparator: row.decimalSeparator,
    roles: row.roles.split(','),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Remove um mapeamento salvo. Escopado por perfil: ID opaco não é autorização. */
export async function forgetMapping(profileId: string, id: string): Promise<boolean> {
  const found = await db.csvMappingProfile.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!found) return false;
  await db.csvMappingProfile.delete({ where: { id: found.id } });
  return true;
}
