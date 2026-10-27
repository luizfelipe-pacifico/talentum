import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { db } from '@/server/db';
import { getLocalProfileId } from '@/server/profile';

/* Quantidades por área do banco local.

   As telas de área afirmavam "Nenhum lançamento" ou "Nada para conciliar" sem
   perguntar nada ao backend, mesmo com registros gravados. Com este contrato,
   o estado vazio só aparece quando o banco confirma zero. Devolve contagens,
   nunca registros, valores ou descrições. */

const path = '/api/local-summary';

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path)) {
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const headers = { 'Cache-Control': 'no-store' };
  const profileId = await getLocalProfileId();
  if (!profileId) return NextResponse.json({ hasProfile: false }, { headers });

  const [accounts, transactions, pendingTransactions, openObligations, imports] = await Promise.all([
    db.account.count({ where: { profileId, isActive: true } }),
    db.transaction.count({ where: { profileId } }),
    db.transaction.count({ where: { profileId, status: 'pending' } }),
    db.scheduledObligation.count({ where: { profileId, status: 'open' } }),
    db.importBatch.count({ where: { profileId } }),
  ]);

  return NextResponse.json(
    { hasProfile: true, accounts, transactions, pendingTransactions, openObligations, imports },
    { headers },
  );
}
