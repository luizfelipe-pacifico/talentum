'use client';

import Link from 'next/link';
import { useState } from 'react';
import { deleteJson, postJson } from '@/lib/api-client';
import { formatDay } from '@/lib/format';
import { StateArt } from '@/components/state-art';
import { errorText, FormError, LoadingCard, Money, QueryError, shortDate } from '@/components/cards';
import { useStatementChecks, type StatementChecks } from '@/hooks/use-cards';

/* Conferência de faturas (Stage 8): fatura contra o extrato da conta.

   Para cada fatura em aberto, a tela mostra os lançamentos da conta que podem
   ser o pagamento dela, com o valor exato primeiro. A pessoa confirma; o
   backend revalida e grava a ligação. Desfazer remove só a ligação, nunca o
   lançamento. */

export function InvoiceCheckPage() {
  const state = useStatementChecks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'loading') return <LoadingCard label="Consultando as faturas." />;
  if (state.status === 'error') return <QueryError what="fatura" retry={state.retry} />;
  if (state.status === 'missing') return <QueryError what="fatura" retry={() => window.location.reload()} />;

  const data = state.data;
  if (!data.hasProfile) {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-faturas" />
        <h2 className="h-display">Configure o perfil antes de conferir faturas</h2>
        <p className="muted">As faturas pertencem ao perfil local, criado no onboarding.</p>
        <Link className="btn btn-primary" href="/onboarding">
          Configurar perfil
        </Link>
      </section>
    );
  }

  const { open, recentlyPaid } = data as StatementChecks;

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      state.reload();
    } catch (caught) {
      setError(errorText(caught, fallback));
    }
    setBusy(false);
  };

  if (open.length === 0 && recentlyPaid.length === 0) {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-faturas" />
        <h2 className="h-display">Nenhuma fatura para conferir</h2>
        <p className="muted">
          Cadastre a fatura de um cartão para conferir o pagamento dela contra o extrato da conta.
        </p>
        <Link className="btn btn-primary" href="/extratos/cartoes">
          Ver cartões
        </Link>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      {error && <FormError>{error}</FormError>}

      {open.length === 0 ? (
        <section className="card empty">
          <StateArt name="nada-a-conciliar" size="sm" />
          <h2 className="h-display">Todas as faturas estão pagas e conferidas</h2>
        </section>
      ) : (
        open.map((statement) => (
          <section className="card" key={statement.id} aria-labelledby={`fatura-${statement.id}`}>
            <div className="row-between">
              <div>
                <p className="eyebrow">{statement.card.name}</p>
                <h2 className="h-display" id={`fatura-${statement.id}`}>
                  Vence em {formatDay(statement.dueDate)}
                </h2>
              </div>
              <span className="stack-tight right">
                <span className="small muted">Falta pagar</span>
                <Money cents={statement.outstandingCents} className="metric" />
                {statement.isEstimated && <span className="chip chip-warn">Valor estimado</span>}
              </span>
            </div>

            {statement.candidates.length > 0 ? (
              <>
                <p className="small muted">
                  Lançamentos {statement.paymentAccountName ? `de ${statement.paymentAccountName} ` : ''}que podem ser o
                  pagamento desta fatura:
                </p>
                <ul className="entity-list">
                  {statement.candidates.map((candidate) => (
                    <li key={candidate.transactionId}>
                      <span>
                        <strong>{candidate.description}</strong>
                        <span className="small muted">
                          {candidate.accountName} · {shortDate(candidate.occurredOn)}
                        </span>
                        <span className={`chip ${candidate.match === 'exact' ? 'chip-ok' : 'chip-info'}`}>
                          {candidate.match === 'exact' ? 'Valor igual ao que falta' : 'Pagamento parcial'}
                        </span>
                      </span>
                      <span className="stack-tight right">
                        <Money cents={candidate.amountCents} />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                postJson(`/api/card-statements/${statement.id}/payments`, {
                                  transactionId: candidate.transactionId,
                                }),
                              'O pagamento não pôde ser conciliado.',
                            )
                          }
                        >
                          Confirmar pagamento
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted">
                Nenhuma saída {statement.paymentAccountName ? `de ${statement.paymentAccountName} ` : ''}entre 15 dias
                antes e 7 dias depois do vencimento tem valor igual ou menor que o que falta pagar.{' '}
                <Link className="btn-link" href="/extratos/importar">
                  Importar extrato da conta
                </Link>
              </p>
            )}
            <Link className="btn-link small" href={`/extratos/cartoes/${statement.card.id}`}>
              Ver fatura e itens
              <i className="bi bi-arrow-right-short" aria-hidden="true" />
            </Link>
          </section>
        ))
      )}

      {recentlyPaid.length > 0 && (
        <section className="card" aria-labelledby="faturas-pagas">
          <h2 className="h-display" id="faturas-pagas">
            Pagas e conferidas
          </h2>
          <ul className="entity-list">
            {recentlyPaid.map((statement) =>
              statement.payments.map((payment) => (
                <li key={payment.id}>
                  <span>
                    <strong>
                      {statement.card.name} · vencimento {shortDate(statement.dueDate)}
                    </strong>
                    <span className="small muted">
                      {payment.description} · {payment.accountName} · {shortDate(payment.occurredOn)}
                    </span>
                  </span>
                  <span className="stack-tight right">
                    <Money cents={payment.amountCents} />
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => deleteJson(`/api/card-statements/${statement.id}/payments/${payment.id}`),
                          'A conciliação não pôde ser desfeita.',
                        )
                      }
                    >
                      Desfazer conciliação
                    </button>
                  </span>
                </li>
              )),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
