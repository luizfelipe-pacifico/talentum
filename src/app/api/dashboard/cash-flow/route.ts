import { db } from '@/server/db';
import { guardWithProfile, isDenied, ok } from '@/server/http';
import { monthlyCashFlow } from '@/server/dashboard-metrics';
import { loadCoverage, toTransactionInput, transactionSelect } from '@/server/dashboard-queries';

/* Entradas e saídas por mês.

   Elemento G-3 de docs/DASHBOARD.md. A restrição dura da especificação é que
   **só meses com cobertura de extrato confirmada são devolvidos**: um mês sem
   extrato tem entrada e saída zero no banco, mas isso não significa que a
   pessoa não movimentou dinheiro — significa que não sabemos. Renderizá-lo como
   barra vazia seria a mentira do defeito D-2 distribuída ao longo do tempo.

   A rota existe porque `ImportBatch` passou a registrar o período coberto
   (migration `mvp_import_details`, lacuna L-2). */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const coverage = await loadCoverage(guarded.profileId);

  if (coverage.length === 0) {
    // Sem nenhum extrato com período conhecido não há mês que possa ser
    // afirmado. Devolver série vazia é diferente de devolver zeros.
    return ok({ hasProfile: true, months: [], coverageRanges: 0 });
  }

  const earliest = coverage.reduce((min, range) => (range.start < min ? range.start : min), coverage[0].start);
  const latest = coverage.reduce((max, range) => (range.end > max ? range.end : max), coverage[0].end);

  const rows = await db.transaction.findMany({
    where: { profileId: guarded.profileId, occurredOn: { gte: earliest, lte: latest } },
    select: transactionSelect,
  });

  const months = monthlyCashFlow(rows.map(toTransactionInput), coverage);

  return ok({
    hasProfile: true,
    coverageRanges: coverage.length,
    months: months.map((month) => ({
      month: month.month,
      incomeCents: month.incomeCents.toString(),
      expenseCents: month.expenseCents.toString(),
      netCents: month.netCents.toString(),
      // `partial` precisa aparecer na tela: meio mês de extrato parece mês de
      // gasto baixo, e a pessoa não tem como perceber sozinha.
      coverage: month.coverage,
    })),
  });
}
