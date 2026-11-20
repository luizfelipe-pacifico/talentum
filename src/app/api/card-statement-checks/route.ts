import { db } from '@/server/db';
import { guardWithProfile, isDenied, ok } from '@/server/http';
import { outstandingCents, PAYMENT_WINDOW_DAYS_AFTER, PAYMENT_WINDOW_DAYS_BEFORE, paymentCandidates } from '@/server/cards';
import { iso } from '@/server/card-store';

/* Conferência de faturas: fatura contra extrato da conta (Stage 8).

   Para cada fatura em aberto, os lançamentos da conta que podem ser o pagamento
   dela (`paymentCandidates`). Também devolve as faturas pagas mais recentes, com
   o pagamento conciliado, para que a ligação possa ser desfeita. Nada é ligado
   sozinho: a confirmação é `POST /api/card-statements/:id/payments`. */

const MAX_STATEMENTS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { profileId } = guarded;

  const [open, recentlyPaid] = await Promise.all([
    db.cardStatement.findMany({
      where: { profileId, status: 'open' },
      orderBy: { dueDate: 'asc' },
      take: MAX_STATEMENTS,
      select: {
        id: true,
        dueDate: true,
        totalCents: true,
        isEstimated: true,
        creditCard: {
          select: { id: true, name: true, paymentAccountId: true, paymentAccount: { select: { name: true } } },
        },
        payments: { select: { amountCents: true } },
      },
    }),
    db.cardStatement.findMany({
      where: { profileId, status: 'paid' },
      orderBy: { dueDate: 'desc' },
      take: 10,
      select: {
        id: true,
        dueDate: true,
        totalCents: true,
        creditCard: { select: { id: true, name: true } },
        payments: {
          select: {
            id: true,
            amountCents: true,
            transaction: { select: { occurredOn: true, description: true, account: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  // Uma consulta só para a janela de todas as faturas abertas.
  let transactions: { id: string; accountId: string; occurredOn: Date; amountCents: bigint; description: string; account: { name: string } }[] = [];
  if (open.length > 0) {
    const first = Math.min(...open.map((statement) => statement.dueDate.getTime()));
    const last = Math.max(...open.map((statement) => statement.dueDate.getTime()));
    transactions = await db.transaction.findMany({
      where: {
        profileId,
        amountCents: { lt: 0n },
        occurredOn: {
          gte: new Date(first - PAYMENT_WINDOW_DAYS_BEFORE * DAY_MS),
          lt: new Date(last + (PAYMENT_WINDOW_DAYS_AFTER + 1) * DAY_MS),
        },
        cardStatementPayment: null,
      },
      orderBy: { occurredOn: 'asc' },
      take: 1000,
      select: { id: true, accountId: true, occurredOn: true, amountCents: true, description: true, account: { select: { name: true } } },
    });
  }
  const byId = new Map(transactions.map((row) => [row.id, row]));

  return ok({
    hasProfile: true,
    open: open.map((statement) => {
      const paid = statement.payments.reduce((total, payment) => total + payment.amountCents, 0n);
      const outstanding = outstandingCents(statement.totalCents, paid);
      const candidates = paymentCandidates(
        { dueDate: statement.dueDate, outstandingCents: outstanding, paymentAccountId: statement.creditCard.paymentAccountId },
        transactions,
        new Set(),
      ).slice(0, 5);
      return {
        id: statement.id,
        card: { id: statement.creditCard.id, name: statement.creditCard.name },
        paymentAccountName: statement.creditCard.paymentAccount?.name ?? null,
        dueDate: iso(statement.dueDate),
        totalCents: statement.totalCents.toString(),
        paidCents: paid.toString(),
        outstandingCents: outstanding.toString(),
        isEstimated: statement.isEstimated,
        candidates: candidates.map((candidate) => ({
          transactionId: candidate.id,
          occurredOn: candidate.occurredOn.toISOString(),
          amountCents: candidate.amountCents.toString(),
          description: byId.get(candidate.id)?.description ?? '',
          accountName: byId.get(candidate.id)?.account.name ?? '',
          match: candidate.match,
          daysFromDue: candidate.daysFromDue,
        })),
      };
    }),
    recentlyPaid: recentlyPaid.map((statement) => ({
      id: statement.id,
      card: statement.creditCard,
      dueDate: iso(statement.dueDate),
      totalCents: statement.totalCents.toString(),
      payments: statement.payments.map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents.toString(),
        occurredOn: payment.transaction.occurredOn.toISOString(),
        description: payment.transaction.description,
        accountName: payment.transaction.account.name,
      })),
    })),
  });
}
