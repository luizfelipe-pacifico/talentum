import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { outstandingCents, PAYMENT_WINDOW_DAYS_AFTER, PAYMENT_WINDOW_DAYS_BEFORE, paymentCandidates } from '@/server/cards';
import { iso, isUniqueViolation, refreshStatementStatus, statementPatchSchema } from '@/server/card-store';

/* Uma fatura: itens, pagamentos conciliados e candidatos a pagamento.

   `PATCH` corrige datas e total, ou cancela e reabre. `paid` nunca é escolhido à
   mão: é consequência dos pagamentos conciliados. `DELETE` remove a fatura, os
   itens e as ligações de pagamento; os lançamentos da conta ficam intactos. */

type Context = { params: Promise<{ statementId: string }> };

const MAX_ITEMS = 500;

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const statement = await db.cardStatement.findFirst({
    where: { id: statementId, profileId: guarded.profileId },
    select: {
      id: true,
      periodStart: true,
      closingDate: true,
      dueDate: true,
      totalCents: true,
      isEstimated: true,
      status: true,
      creditCard: { select: { id: true, name: true, paymentAccountId: true } },
      items: {
        orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
        take: MAX_ITEMS,
        select: {
          id: true,
          occurredOn: true,
          description: true,
          amountCents: true,
          installmentNumber: true,
          installmentCount: true,
          source: true,
        },
      },
      payments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amountCents: true,
          createdAt: true,
          transaction: {
            select: { id: true, occurredOn: true, description: true, account: { select: { id: true, name: true } } },
          },
        },
      },
      _count: { select: { items: true } },
    },
  });
  if (!statement) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);

  const paid = statement.payments.reduce((total, payment) => total + payment.amountCents, 0n);
  const outstanding = statement.status === 'open' ? outstandingCents(statement.totalCents, paid) : 0n;
  const itemsTotal = await db.cardStatementItem.aggregate({
    where: { cardStatementId: statement.id, profileId: guarded.profileId },
    _sum: { amountCents: true },
  });

  // Candidatos a pagamento: saídas da conta na janela do vencimento que ainda
  // não pagam nenhuma fatura. A pessoa confirma; nada é ligado sozinho.
  let candidates: ReturnType<typeof paymentCandidates> = [];
  if (outstanding > 0n) {
    const from = new Date(statement.dueDate);
    from.setDate(from.getDate() - PAYMENT_WINDOW_DAYS_BEFORE);
    const to = new Date(statement.dueDate);
    to.setDate(to.getDate() + PAYMENT_WINDOW_DAYS_AFTER + 1);
    const rows = await db.transaction.findMany({
      where: {
        profileId: guarded.profileId,
        amountCents: { lt: 0n },
        occurredOn: { gte: from, lt: to },
        cardStatementPayment: null,
      },
      take: 200,
      select: { id: true, accountId: true, occurredOn: true, amountCents: true },
    });
    candidates = paymentCandidates(
      { dueDate: statement.dueDate, outstandingCents: outstanding, paymentAccountId: statement.creditCard.paymentAccountId },
      rows,
      new Set(),
    );
  }
  const candidateDetails = candidates.length
    ? await db.transaction.findMany({
        where: { profileId: guarded.profileId, id: { in: candidates.map((candidate) => candidate.id) } },
        select: { id: true, description: true, account: { select: { name: true } } },
      })
    : [];
  const detailById = new Map(candidateDetails.map((row) => [row.id, row]));

  return ok({
    hasProfile: true,
    statement: {
      id: statement.id,
      card: { id: statement.creditCard.id, name: statement.creditCard.name },
      periodStart: iso(statement.periodStart),
      closingDate: iso(statement.closingDate),
      dueDate: iso(statement.dueDate),
      totalCents: statement.totalCents.toString(),
      paidCents: paid.toString(),
      outstandingCents: outstanding.toString(),
      isEstimated: statement.isEstimated,
      status: statement.status,
      itemCount: statement._count.items,
      itemsTotalCents: (itemsTotal._sum.amountCents ?? 0n).toString(),
      items: statement.items.map((item) => ({
        id: item.id,
        occurredOn: item.occurredOn.toISOString(),
        description: item.description,
        amountCents: item.amountCents.toString(),
        installmentNumber: item.installmentNumber,
        installmentCount: item.installmentCount,
        source: item.source,
      })),
      payments: statement.payments.map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents.toString(),
        createdAt: payment.createdAt.toISOString(),
        transaction: {
          id: payment.transaction.id,
          occurredOn: payment.transaction.occurredOn.toISOString(),
          description: payment.transaction.description,
          accountName: payment.transaction.account.name,
        },
      })),
      candidates: candidates.map((candidate) => ({
        transactionId: candidate.id,
        occurredOn: candidate.occurredOn.toISOString(),
        amountCents: candidate.amountCents.toString(),
        description: detailById.get(candidate.id)?.description ?? '',
        accountName: detailById.get(candidate.id)?.account.name ?? '',
        match: candidate.match,
        daysFromDue: candidate.daysFromDue,
      })),
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const parsed = statementPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_STATEMENT', 'Os dados da fatura são inválidos.', 400);
  const input = parsed.data;

  const statement = await db.cardStatement.findFirst({
    where: { id: statementId, profileId: guarded.profileId },
    select: { id: true, closingDate: true, dueDate: true },
  });
  if (!statement) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);

  const closing = input.closingDate ?? statement.closingDate;
  const due = input.dueDate ?? statement.dueDate;
  if (due < closing) return fail('INVALID_STATEMENT', 'O vencimento vem depois do fechamento.', 400);

  try {
    const status = await db.$transaction(async (tx) => {
      await tx.cardStatement.update({ where: { id: statement.id, profileId: guarded.profileId }, data: input });
      // Reabrir ou mudar o total pode quitar ou desquitar a fatura.
      return refreshStatementStatus(tx, statement.id);
    });
    return ok({ statement: { id: statement.id, status } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('STATEMENT_ALREADY_EXISTS', 'Este cartão já tem uma fatura com esse vencimento.', 409);
    }
    return fail('STATEMENT_FAILED', 'A fatura não pôde ser alterada.', 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const removed = await db.cardStatement.deleteMany({ where: { id: statementId, profileId: guarded.profileId } });
  if (removed.count === 0) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);
  return ok({ deleted: true });
}
