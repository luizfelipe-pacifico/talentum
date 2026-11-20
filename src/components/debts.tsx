'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { callApi, postJson } from '@/lib/api-client';
import { shareOfTotal } from '@/lib/chart';
import { centsToInput, formatBps, parseMoneyInput, parsePercentToBps } from '@/lib/money-input';
import {
  EmptyState,
  FormError,
  LoadingState,
  Money,
  QueryError,
  errorMessage,
  formatMonth,
  plural,
  useReloadable,
} from '@/components/planning-ui';

/* Dívidas e modo sobrevivência (Stage 13 de docs/ROADMAP.md).

   Conteúdo de educação financeira: as contas usam juros compostos mensais
   sobre o saldo informado, sem multa, IOF ou renegociação. Não é orientação
   jurídica nem financeira individual, e a tela diz isso sempre. */

type Debt = {
  id: string;
  name: string;
  principalCents: string;
  monthlyRateBps: number;
  annualRateBps: number;
  minimumPaymentCents: string;
  overdueCents: string;
  dueDay: number | null;
  status: 'open' | 'paid';
};

type Survival = { riskFreeBalanceCents: string | null; active: boolean; reasons: ('negative_risk_free_balance' | 'overdue_debt')[] };

type DebtsPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      debts: Debt[];
      order: { avalanche: string[]; snowball: string[] };
      totals: { principalCents: string; minimumCents: string; overdueCents: string };
      survival: Survival;
    };

type Strategy = 'avalanche' | 'snowball';

type PlanResult =
  | {
      status: 'ok';
      strategy: Strategy;
      order: string[];
      months: { month: number; totalPaidCents: string; totalBalanceCents: string; payments: { debtId: string; interestCents: string; paidCents: string; balanceCents: string }[] }[];
      monthsToPayoff: number;
      totalInterestCents: string;
      totalPaidCents: string;
      payoffMonth: Record<string, number>;
    }
  | { status: 'insufficient'; minimumTotalCents: string }
  | { status: 'no_debts' }
  | { status: 'too_long'; horizonMonths: number };

const STRATEGY_LABEL: Record<Strategy, string> = { avalanche: 'Maior juro primeiro', snowball: 'Menor saldo primeiro' };

function LegalNotice() {
  return (
    <aside className="callout callout-info planning-notice">
      <i className="bi bi-mortarboard" aria-hidden="true" />
      <p className="small">
        Conteúdo de educação financeira. As simulações usam juros compostos mensais sobre o saldo que você informou e não incluem multa, IOF, encargos de atraso nem acordos. As
        condições que valem são as do seu contrato com o credor. Nada aqui é orientação jurídica ou financeira individual.
      </p>
    </aside>
  );
}

const SURVIVAL_REASON = {
  negative_risk_free_balance: 'O Saldo Livre de Risco está negativo: os compromissos do mês passam do saldo das contas.',
  overdue_debt: 'Há dívida com valor em atraso.',
};

function SurvivalBanner({ survival, showLink = true }: { survival: Survival; showLink?: boolean }) {
  if (!survival.active) return null;
  return (
    <section className="callout callout-warn survival-banner" aria-labelledby="modo-sobrevivencia-ativo">
      <i className="bi bi-life-preserver" aria-hidden="true" />
      <div className="stack-xs">
        <p className="callout-title" id="modo-sobrevivencia-ativo">
          Modo sobrevivência ativo
        </p>
        <ul className="plain-list small">
          {survival.reasons.map((reason) => (
            <li key={reason}>{SURVIVAL_REASON[reason]}</li>
          ))}
        </ul>
        {showLink && (
          <Link className="btn-link" href="/planejamento/sobrevivencia">
            Ver gastos essenciais e não essenciais
            <i className="bi bi-arrow-right-short" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}

type DebtFields = { name: string; principal: string; rate: string; minimum: string; overdue: string; dueDay: string };

function parseDebtFields(fields: DebtFields): { body: Record<string, unknown> } | { error: string } {
  const principalCents = parseMoneyInput(fields.principal);
  const minimumPaymentCents = parseMoneyInput(fields.minimum, { allowZero: true });
  const overdueCents = fields.overdue.trim() ? parseMoneyInput(fields.overdue, { allowZero: true }) : '0';
  const monthlyRateBps = parsePercentToBps(fields.rate);
  const dueDay = fields.dueDay.trim() ? Number(fields.dueDay) : null;
  if (!fields.name.trim()) return { error: 'Dê um nome à dívida, por exemplo Cartão ou Empréstimo pessoal.' };
  if (!principalCents) return { error: 'Informe o saldo devedor em reais, por exemplo 2.500,00.' };
  if (monthlyRateBps === null || monthlyRateBps > 5_000) return { error: 'Informe a taxa de juros ao mês em porcentagem, entre 0 e 50, por exemplo 12,5.' };
  if (minimumPaymentCents === null) return { error: 'Informe a parcela mínima em reais. Use 0 se não houver.' };
  if (overdueCents === null) return { error: 'Informe o valor em atraso em reais, ou deixe em branco.' };
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return { error: 'O dia do vencimento vai de 1 a 31.' };
  return { body: { name: fields.name.trim(), principalCents, monthlyRateBps, minimumPaymentCents, overdueCents, dueDay } };
}

function DebtForm({ initial, submitLabel, busyLabel, onSubmit, onCancel }: { initial?: Debt; submitLabel: string; busyLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel?: () => void }) {
  const [fields, setFields] = useState<DebtFields>({
    name: initial?.name ?? '',
    principal: initial ? centsToInput(initial.principalCents) : '',
    rate: initial ? (initial.monthlyRateBps / 100).toString().replace('.', ',') : '',
    minimum: initial ? centsToInput(initial.minimumPaymentCents) : '',
    overdue: initial && BigInt(initial.overdueCents) > 0n ? centsToInput(initial.overdueCents) : '',
    dueDay: initial?.dueDay ? String(initial.dueDay) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof DebtFields) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDebtFields(fields);
    if ('error' in parsed) return setError(parsed.error);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.body);
      if (!initial) setFields({ name: '', principal: '', rate: '', minimum: '', overdue: '', dueDay: '' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field-row">
        <label className="field">
          Nome da dívida
          <input maxLength={80} value={fields.name} onChange={set('name')} placeholder="Cartão de crédito" />
        </label>
        <label className="field field-amount">
          Saldo devedor hoje
          <input inputMode="decimal" autoComplete="off" value={fields.principal} onChange={set('principal')} placeholder="0,00" />
        </label>
        <label className="field">
          Juros ao mês (%)
          <input inputMode="decimal" autoComplete="off" value={fields.rate} onChange={set('rate')} placeholder="12,5" />
        </label>
      </div>
      <div className="field-row">
        <label className="field field-amount">
          Parcela mínima por mês
          <input inputMode="decimal" autoComplete="off" value={fields.minimum} onChange={set('minimum')} placeholder="0,00" />
        </label>
        <label className="field field-amount">
          Valor em atraso (opcional)
          <input inputMode="decimal" autoComplete="off" value={fields.overdue} onChange={set('overdue')} placeholder="0,00" />
        </label>
        <label className="field">
          Dia do vencimento (opcional)
          <input inputMode="numeric" autoComplete="off" value={fields.dueDay} onChange={set('dueDay')} placeholder="10" />
        </label>
      </div>
      <p className="small muted">Use os valores aproximados que você conhece. Nenhum contrato, documento ou senha é pedido.</p>
      <FormError message={error} />
      <div className="row-tight">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function DebtItem({ debt, rank, onChanged }: { debt: Debt; rank: number | null; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await onChanged();
      setMode('view');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'edit') {
    return (
      <li className="debt-item">
        <DebtForm
          initial={debt}
          submitLabel="Salvar dívida"
          busyLabel="Salvando…"
          onCancel={() => setMode('view')}
          onSubmit={async (body) => {
            await callApi('PATCH', `/api/debts/${encodeURIComponent(debt.id)}`, { json: body });
            await onChanged();
            setMode('view');
          }}
        />
      </li>
    );
  }

  const overdue = BigInt(debt.overdueCents) > 0n;
  return (
    <li className={`debt-item ${debt.status === 'paid' ? 'debt-item-paid' : ''}`}>
      <div className="debt-item-head">
        <span className="debt-name">
          {rank !== null && (
            <span className="debt-rank">
              <span className="sr-only">Prioridade </span>
              {rank}
            </span>
          )}
          <strong>{debt.name}</strong>
        </span>
        {debt.status === 'paid' ? (
          <span className="chip chip-ok">
            <i className="bi bi-check2" aria-hidden="true" />
            Quitada
          </span>
        ) : overdue ? (
          <span className="chip chip-err">
            <i className="bi bi-exclamation-octagon" aria-hidden="true" />
            Em atraso: <Money cents={debt.overdueCents} />
          </span>
        ) : (
          <span className="chip chip-ok">
            <i className="bi bi-check2" aria-hidden="true" />
            Em dia
          </span>
        )}
      </div>
      <dl className="debt-facts">
        <div>
          <dt>Saldo devedor</dt>
          <dd>
            <Money cents={debt.principalCents} />
          </dd>
        </div>
        <div>
          <dt>Juros</dt>
          <dd>
            {formatBps(debt.monthlyRateBps, 2)} ao mês
            <span className="small muted"> · cerca de {formatBps(debt.annualRateBps, 0)} ao ano</span>
          </dd>
        </div>
        <div>
          <dt>Parcela mínima</dt>
          <dd>
            <Money cents={debt.minimumPaymentCents} />
            {debt.dueDay && <span className="small muted"> · vence dia {debt.dueDay}</span>}
          </dd>
        </div>
      </dl>
      <FormError message={error} />
      {mode === 'confirm-delete' ? (
        <div className="callout callout-err">
          <div className="stack-xs">
            <p className="small">
              Excluir <strong>{debt.name}</strong> remove a dívida das simulações. Se ela foi paga, marque como quitada para manter o registro.
            </p>
            <div className="row-tight">
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => act(() => callApi('DELETE', `/api/debts/${encodeURIComponent(debt.id)}`))}>
                Excluir dívida
              </button>
              <button type="button" className="btn btn-sm btn-neutral" disabled={busy} onClick={() => setMode('view')}>
                Manter dívida
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="row-tight">
          <button type="button" className="btn btn-sm btn-neutral" disabled={busy} onClick={() => setMode('edit')}>
            Editar
          </button>
          {debt.status === 'open' ? (
            <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => act(() => callApi('PATCH', `/api/debts/${encodeURIComponent(debt.id)}`, { json: { status: 'paid' } }))}>
              Marcar como quitada
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => act(() => callApi('PATCH', `/api/debts/${encodeURIComponent(debt.id)}`, { json: { status: 'open' } }))}>
              Reabrir dívida
            </button>
          )}
          <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setMode('confirm-delete')}>
            Excluir
          </button>
        </div>
      )}
    </li>
  );
}

function PayoffPlanner({ minimumCents, names }: { minimumCents: string; names: Map<string, string> }) {
  const [budget, setBudget] = useState(centsToInput(minimumCents));
  const [strategy, setStrategy] = useState<Strategy>('avalanche');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<Strategy, PlanResult> | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function simulate(event: FormEvent) {
    event.preventDefault();
    const monthlyBudgetCents = parseMoneyInput(budget);
    if (!monthlyBudgetCents) return setError('Informe quanto você consegue pagar por mês, somando todas as dívidas.');
    setBusy(true);
    setError(null);
    try {
      const [avalanche, snowball] = await Promise.all(
        (['avalanche', 'snowball'] as const).map((item) => postJson<{ plan: PlanResult }>('/api/debts/payoff-plan', { strategy: item, monthlyBudgetCents })),
      );
      setPlans({ avalanche: avalanche.plan, snowball: snowball.plan });
      setShowAll(false);
    } catch (cause) {
      setError(errorMessage(cause, 'A simulação não pôde ser feita. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  const plan = plans?.[strategy];
  const visibleMonths = plan?.status === 'ok' ? (showAll ? plan.months : plan.months.slice(0, 12)) : [];

  return (
    <section className="card" aria-labelledby="plano-quitacao">
      <div className="card-header">
        <h2 className="h-display" id="plano-quitacao">
          Plano de quitação
        </h2>
      </div>
      <form className="stack" onSubmit={simulate} noValidate>
        <div className="field-row">
          <label className="field field-amount">
            Quanto você consegue pagar por mês, somando todas as dívidas
            <input inputMode="decimal" autoComplete="off" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0,00" />
          </label>
        </div>
        <p className="small muted">
          A soma das parcelas mínimas é <Money cents={minimumCents} />. O que passar disso vai para a primeira dívida da ordem escolhida; quando uma dívida termina, a parcela dela passa para a próxima.
        </p>
        <FormError message={error} />
        <div className="row-tight">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Simulando…' : 'Simular quitação'}
          </button>
        </div>
      </form>

      {plans && (
        <div className="stack" aria-live="polite">
          <table className="tbl tbl-data">
            <caption className="small muted">Comparação dos dois métodos com o mesmo valor mensal.</caption>
            <thead>
              <tr>
                <th scope="col">Método</th>
                <th scope="col" className="right">
                  Meses até quitar
                </th>
                <th scope="col" className="right">
                  Juros pagos
                </th>
              </tr>
            </thead>
            <tbody>
              {(['avalanche', 'snowball'] as const).map((item) => {
                const result = plans[item];
                return (
                  <tr key={item}>
                    <th scope="row">{STRATEGY_LABEL[item]}</th>
                    <td className="right">{result.status === 'ok' ? result.monthsToPayoff : '—'}</td>
                    <td className="right">{result.status === 'ok' ? <Money cents={result.totalInterestCents} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {plan?.status === 'insufficient' && (
            <p className="callout callout-warn small" role="status">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <span>
                O valor não cobre a soma das parcelas mínimas (<Money cents={plan.minimumTotalCents} />). Com menos que isso, alguma parcela fica sem pagar e a dívida entra em atraso.
              </span>
            </p>
          )}
          {plan?.status === 'too_long' && (
            <p className="callout callout-warn small" role="status">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <span>Com esse valor mensal, as dívidas não terminam em {plan.horizonMonths / 12} anos: os juros consomem quase toda a parcela. A simulação para aqui.</span>
            </p>
          )}
          {plan?.status === 'no_debts' && <p className="small muted">Nenhuma dívida em aberto para simular.</p>}

          {plan?.status === 'ok' && (
            <>
              <fieldset className="segmented">
                <legend className="sr-only">Método do plano detalhado</legend>
                {(['avalanche', 'snowball'] as const).map((item) => (
                  <button key={item} type="button" aria-pressed={strategy === item} onClick={() => setStrategy(item)}>
                    {STRATEGY_LABEL[item]}
                  </button>
                ))}
              </fieldset>
              <p className="small">
                {STRATEGY_LABEL[strategy]}: tudo quitado em {plural(plan.monthsToPayoff, 'mês', 'meses')}, pagando <Money cents={plan.totalPaidCents} /> no total, dos quais{' '}
                <Money cents={plan.totalInterestCents} /> são juros.
              </p>
              <ol className="payoff-order small">
                {plan.order.map((id) => (
                  <li key={id}>
                    {names.get(id) ?? 'Dívida'}: quitada no mês {plan.payoffMonth[id]}
                  </li>
                ))}
              </ol>
              <div className="table-scroll">
                <table className="tbl tbl-data tbl-sm">
                  <caption className="sr-only">Pagamento, juros e saldo restante em cada mês da simulação.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mês</th>
                      <th scope="col" className="right">
                        Pago no mês
                      </th>
                      <th scope="col" className="right">
                        Juros do mês
                      </th>
                      <th scope="col" className="right">
                        Saldo restante
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonths.map((month) => (
                      <tr key={month.month}>
                        <th scope="row">Mês {month.month}</th>
                        <td className="right">
                          <Money cents={month.totalPaidCents} />
                        </td>
                        <td className="right">
                          <Money cents={month.payments.reduce((sum, item) => sum + BigInt(item.interestCents), 0n).toString()} />
                        </td>
                        <td className="right">
                          <Money cents={month.totalBalanceCents} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.months.length > 12 && (
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Mostrar só os 12 primeiros meses' : `Mostrar todos os ${plan.months.length} meses`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function DebtsPage() {
  const state = useReloadable<DebtsPayload>('/api/debts');
  const [strategy, setStrategy] = useState<Strategy>('avalanche');
  const [adding, setAdding] = useState(false);

  if (state.status === 'loading') return <LoadingState label="Consultando as dívidas." />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="as dívidas" />;
  const { payload } = state;
  if (!payload.hasProfile) {
    return (
      <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="As dívidas ficam no seu perfil local. Conclua o primeiro acesso para cadastrar a primeira.">
        <Link className="btn btn-primary" href="/onboarding">
          Concluir primeiro acesso
        </Link>
      </EmptyState>
    );
  }

  const create = async (body: Record<string, unknown>) => {
    await postJson('/api/debts', body);
    await state.reload();
    setAdding(false);
  };

  if (payload.debts.length === 0) {
    return (
      <div className="stack-lg">
        <SurvivalBanner survival={payload.survival} />
        <EmptyState
          art="sem-obrigacoes"
          title="Nenhuma dívida cadastrada"
          text="Cadastre dívidas com juros, como cartão, cheque especial ou empréstimo, para ver a ordem de pagamento e quanto tempo leva para quitar."
        />
        <section className="card card-lg">
          <h2 className="h-display">Cadastrar dívida</h2>
          <DebtForm submitLabel="Cadastrar dívida" busyLabel="Cadastrando…" onSubmit={create} />
        </section>
        <LegalNotice />
      </div>
    );
  }

  const open = payload.debts.filter((debt) => debt.status === 'open');
  const paid = payload.debts.filter((debt) => debt.status === 'paid');
  const order = payload.order[strategy];
  const byId = new Map(open.map((debt) => [debt.id, debt]));
  const names = new Map(payload.debts.map((debt) => [debt.id, debt.name]));

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`}>
      <SurvivalBanner survival={payload.survival} />

      <section className="card card-lg">
        <dl className="spec-grid">
          <div>
            <dt>Saldo devedor total</dt>
            <dd>
              <Money cents={payload.totals.principalCents} />
            </dd>
            <dd className="small muted">{plural(open.length, 'dívida em aberto', 'dívidas em aberto')}</dd>
          </div>
          <div>
            <dt>Parcelas mínimas por mês</dt>
            <dd>
              <Money cents={payload.totals.minimumCents} />
            </dd>
          </div>
          <div>
            <dt>Em atraso</dt>
            <dd>
              <Money cents={payload.totals.overdueCents} className={BigInt(payload.totals.overdueCents) > 0n ? 'figure-negative' : ''} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="card" aria-labelledby="ordem-pagamento">
        <div className="card-header">
          <h2 className="h-display" id="ordem-pagamento">
            Ordem de pagamento
          </h2>
          {!adding && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Cadastrar dívida
            </button>
          )}
        </div>
        {adding && (
          <div className="inset">
            <DebtForm submitLabel="Cadastrar dívida" busyLabel="Cadastrando…" onSubmit={create} onCancel={() => setAdding(false)} />
          </div>
        )}
        {open.length > 0 && (
          <>
            <fieldset className="segmented">
              <legend className="sr-only">Critério da ordem de pagamento</legend>
              {(['avalanche', 'snowball'] as const).map((item) => (
                <button key={item} type="button" aria-pressed={strategy === item} onClick={() => setStrategy(item)}>
                  {STRATEGY_LABEL[item]}
                </button>
              ))}
            </fieldset>
            <p className="small muted">
              {strategy === 'avalanche'
                ? 'Maior juro primeiro (método avalanche): o dinheiro extra vai para a dívida de taxa mais alta. Em geral é o caminho que paga menos juros no total.'
                : 'Menor saldo primeiro (método bola de neve): o dinheiro extra vai para a dívida menor. Paga mais juros, mas quita dívidas mais cedo.'}
            </p>
          </>
        )}
        <ul className="debt-list">
          {order.map((id, index) => {
            const debt = byId.get(id);
            return debt ? <DebtItem key={id} debt={debt} rank={index + 1} onChanged={state.reload} /> : null;
          })}
        </ul>
        {open.length === 0 && <p className="small muted">Todas as dívidas cadastradas estão quitadas.</p>}
      </section>

      {open.length > 0 && <PayoffPlanner key={payload.totals.minimumCents} minimumCents={payload.totals.minimumCents} names={names} />}

      {paid.length > 0 && (
        <section className="card">
          <h2 className="h-display">Quitadas</h2>
          <ul className="debt-list">
            {paid.map((debt) => (
              <DebtItem key={debt.id} debt={debt} rank={null} onChanged={state.reload} />
            ))}
          </ul>
        </section>
      )}

      <LegalNotice />
    </div>
  );
}

/* ── Modo sobrevivência ───────────────────────────────────────── */

type SurvivalPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      survival: Survival;
      categories: { id: string; name: string; isEssential: boolean }[];
      periods: { month: string; observedDays: number | null; essentialCents: string; nonEssentialCents: string; uncategorizedCents: string; byCategory: { categoryId: string; cents: string }[] }[];
    };

function SplitTable({ period, current }: { period: Extract<SurvivalPayload, { hasProfile: true }>['periods'][number]; current: boolean }) {
  const rows = [
    { key: 'essential', label: 'Essenciais', cents: period.essentialCents, recessive: false },
    { key: 'non', label: 'Não essenciais', cents: period.nonEssentialCents, recessive: false },
    { key: 'none', label: 'Sem categoria', cents: period.uncategorizedCents, recessive: true },
  ];
  const total = rows.reduce((sum, row) => sum + BigInt(row.cents), 0n);
  const title = `${formatMonth(period.month)}${current && period.observedDays ? `, até o dia ${period.observedDays}` : ''}`;
  if (period.observedDays === null) {
    return (
      <div className="stack-xs">
        <h3 className="split-title">{title.charAt(0).toUpperCase() + title.slice(1)}</h3>
        <p className="small muted">Nenhum extrato importado cobre este mês, então o gasto é desconhecido.</p>
      </div>
    );
  }
  return (
    <div className="stack-xs">
      <table className="catbar">
        <caption className="split-title">{title.charAt(0).toUpperCase() + title.slice(1)}</caption>
        <thead>
          <tr>
            <th scope="col">Gasto</th>
            <th scope="col">Participação</th>
            <th scope="col" className="right">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const percent = shareOfTotal(BigInt(row.cents), total);
            return (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>
                  <span className="catbar-track" aria-hidden="true">
                    <span className={row.recessive ? 'catbar-fill catbar-fill-recessive' : 'catbar-fill'} style={{ width: `${percent}%` }} />
                  </span>
                  <span className="catbar-share num">{percent.toFixed(1).replace('.', ',')}%</span>
                </td>
                <td className="right">
                  <Money cents={row.cents} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EssentialPicker({ categories, onSaved }: { categories: { id: string; name: string; isEssential: boolean }[]; onSaved: () => Promise<void> }) {
  const [selected, setSelected] = useState(() => new Set(categories.filter((category) => category.isEssential).map((category) => category.id)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await callApi('PUT', '/api/survival', { json: { essentialCategoryIds: [...selected] } });
      await onSaved();
      setMessage({ tone: 'ok', text: `${plural(selected.size, 'categoria marcada', 'categorias marcadas')} como essencial.` });
    } catch (cause) {
      setMessage({ tone: 'err', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <fieldset className="essential-grid">
        <legend className="small muted">Marque o que não dá para cortar no mês, como moradia, mercado, saúde e transporte para o trabalho.</legend>
        {categories.map((category) => (
          <label key={category.id} className="check-field">
            <input type="checkbox" checked={selected.has(category.id)} onChange={() => toggle(category.id)} />
            {category.name}
          </label>
        ))}
      </fieldset>
      {message && (
        <p className={`small ${message.tone === 'err' ? 'figure-negative' : 'muted'}`} role={message.tone === 'err' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <div className="row-tight">
        <button type="submit" className="btn btn-neutral" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar categorias essenciais'}
        </button>
      </div>
    </form>
  );
}

export function SurvivalPage() {
  const state = useReloadable<SurvivalPayload>('/api/survival');
  if (state.status === 'loading') return <LoadingState label="Consultando o modo sobrevivência." />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="o modo sobrevivência" />;
  const { payload } = state;
  if (!payload.hasProfile) {
    return (
      <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="O modo sobrevivência usa as contas, categorias e extratos do seu perfil.">
        <Link className="btn btn-primary" href="/onboarding">
          Concluir primeiro acesso
        </Link>
      </EmptyState>
    );
  }

  const { survival, categories, periods } = payload;
  const riskFree = survival.riskFreeBalanceCents;

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`}>
      <section className="card card-lg" aria-labelledby="situacao-liquidez">
        <div className="card-header">
          <h2 className="h-display" id="situacao-liquidez">
            {survival.active ? 'Foco em liquidez' : 'Modo sobrevivência desligado'}
          </h2>
          <span className={`chip chip-lg ${survival.active ? 'chip-warn' : 'chip-ok'}`}>
            <i className={`bi ${survival.active ? 'bi-life-preserver' : 'bi-check2-circle'}`} aria-hidden="true" />
            {survival.active ? 'Ativo' : 'Desligado'}
          </span>
        </div>
        <div className="survival-figure">
          <p className="eyebrow">Saldo Livre de Risco até o fim do mês</p>
          {riskFree === null ? (
            <p className="small muted">
              Desconhecido: nenhuma conta tem saldo informado. <Link href="/contas">Informar saldo de uma conta</Link>
            </p>
          ) : (
            <p className="figure">
              <Money cents={riskFree} />
            </p>
          )}
        </div>
        {survival.active ? (
          <>
            <ul className="plain-list small">
              {survival.reasons.map((reason) => (
                <li key={reason}>
                  <i className="bi bi-dot" aria-hidden="true" />
                  {SURVIVAL_REASON[reason]}
                </li>
              ))}
            </ul>
            <p className="small">
              Enquanto o modo estiver ativo, o Talentum pausa a simulação de aportes em <Link href="/patrimonio/aportes">Próximo aporte</Link> e mostra as dívidas na ordem do maior
              juro em <Link href="/planejamento/dividas">Dívidas</Link>. O modo desliga sozinho quando o Saldo Livre de Risco volta a ficar positivo e nenhuma dívida está em atraso.
            </p>
          </>
        ) : (
          <p className="small muted">
            O modo liga sozinho quando o Saldo Livre de Risco fica negativo ou quando alguma dívida cadastrada tem valor em atraso. Até lá, esta tela serve para conhecer seus gastos
            essenciais.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="essenciais">
        <div className="card-header">
          <h2 className="h-display" id="essenciais">
            Gastos essenciais e não essenciais
          </h2>
        </div>
        {categories.length === 0 ? (
          <p className="small muted">
            Nenhuma categoria de despesa cadastrada. <Link href="/configuracoes/categorias">Cadastrar categorias</Link>
          </p>
        ) : (
          <>
            {!categories.some((category) => category.isEssential) && (
              <p className="callout callout-info small">
                <i className="bi bi-info-circle" aria-hidden="true" />
                <span>Nenhuma categoria marcada como essencial ainda. Marque abaixo para separar os gastos.</span>
              </p>
            )}
            <div className="split-grid">
              {periods.map((period, index) => (
                <SplitTable key={period.month} period={period} current={index === periods.length - 1} />
              ))}
            </div>
            <EssentialPicker key={categories.map((category) => `${category.id}:${category.isEssential}`).join('|')} categories={categories} onSaved={state.reload} />
          </>
        )}
      </section>

      <LegalNotice />
    </div>
  );
}
