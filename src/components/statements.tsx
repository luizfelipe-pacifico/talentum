'use client';

import Link from 'next/link';
import { formatCents } from '@/lib/format';
import { useTransactions } from '@/hooks/use-transactions';

/* Lista de lançamentos.

   Feature 5 de docs/ROUTING_MVP.md. Cada linha corresponde a uma `Transaction`
   devolvida pelo backend; a tela não calcula saldo nem reclassifica nada. */

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Skeleton() {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <p className="sr-only">Consultando os lançamentos.</p>
      <span className="skeleton skeleton-eyebrow" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <span key={index} className="skeleton skeleton-line" />
      ))}
    </section>
  );
}

export function StatementsPage() {
  const state = useTransactions();

  if (state.status === 'loading') return <Skeleton />;

  if (state.status === 'error') {
    return (
      <section className="card card-lg error-state" role="alert">
        <p className="eyebrow">Lançamentos indisponíveis</p>
        <h2 className="h-display">Não foi possível consultar o banco local</h2>
        <p className="muted">Nenhuma linha é exibida enquanto a consulta não responder.</p>
        <button type="button" className="btn btn-neutral" onClick={state.retry}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  }

  if (!state.payload.hasProfile || state.payload.total === 0) {
    return (
      <section className="card card-lg empty">
        <i className="bi bi-receipt" aria-hidden="true" />
        <h2 className="h-display">Nenhum lançamento ainda</h2>
        <p className="muted">
          Importe um extrato em CSV ou OFX. Os lançamentos são gravados no banco local e aparecem
          aqui exatamente como o backend os devolveu.
        </p>
        <Link className="btn btn-primary" href="/extratos/importar">
          Importar extrato
        </Link>
      </section>
    );
  }

  const { transactions, total } = state.payload;
  const uncategorized = transactions.filter((row) => row.category === null).length;

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="card-header">
          <h2 className="h-display">
            {total} {total === 1 ? 'lançamento' : 'lançamentos'}
          </h2>
          <Link className="btn btn-sm btn-primary" href="/extratos/importar">
            <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
            Importar extrato
          </Link>
        </div>

        {uncategorized > 0 && (
          <p className="callout callout-info">
            <i className="bi bi-tags" aria-hidden="true" />
            <span className="small">
              {uncategorized}{' '}
              {uncategorized === 1
                ? 'lançamento ainda não tem categoria'
                : 'lançamentos ainda não têm categoria'}
              . Eles aparecem no painel como &quot;Sem categoria&quot; até serem classificados.
            </span>
          </p>
        )}

        <table className="tbl tbl-data">
          <caption className="sr-only">Lançamentos importados, do mais recente para o mais antigo.</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Descrição</th>
              <th scope="col">Conta</th>
              <th scope="col">Categoria</th>
              <th scope="col" className="right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((row) => {
              const money = formatCents(row.amountCents);
              return (
                <tr key={row.id}>
                  <td className="num">{shortDate(row.occurredOn)}</td>
                  <td>{row.description}</td>
                  <td className="small muted">{row.account?.name ?? '—'}</td>
                  <td className="small">
                    {row.category ? (
                      row.category.name
                    ) : (
                      <span className="muted">Sem categoria</span>
                    )}
                  </td>
                  <td className="right">
                    <span className={money.negative ? 'num figure-negative' : 'num'}>
                      {money.symbol} {money.value}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {state.payload.nextCursor && (
          <p className="small muted">
            Mostrando os {transactions.length} lançamentos mais recentes de {total}.
          </p>
        )}
      </section>
    </div>
  );
}
