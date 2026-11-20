'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { callApi, postJson } from '@/lib/api-client';
import { centsToInput, parseMoneyInput } from '@/lib/money-input';
import {
  EducationNotice,
  EmptyState,
  FormError,
  LoadingState,
  Money,
  ProgressBar,
  QueryError,
  errorMessage,
  formatMonth,
  plural,
  useReloadable,
} from '@/components/planning-ui';

/* Orçamento mensal (Stage 9 de docs/ROADMAP.md).

   Planejado contra realizado por categoria de despesa. O realizado vem de
   lançamentos confirmados; a projeção estende o ritmo dos dias cobertos por
   extrato; a média usa só meses com extrato completo. A tela compara números
   e não recomenda nada. */

type Status = 'no_limit' | 'within' | 'at_risk' | 'over';

type Line = {
  categoryId: string | null;
  budgetId: string | null;
  name: string;
  limitCents: string | null;
  actualCents: string;
  projectedCents: string | null;
  averageCents: string | null;
  remainingCents: string | null;
  status: Status;
};

type Payload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      month: string;
      phase: 'past' | 'current' | 'future';
      daysInMonth: number;
      observedDays: number | null;
      fullyCovered: boolean;
      lines: Line[];
      totals: { limitCents: string; actualWithinLimitsCents: string; actualCents: string; projectedCents: string | null; averageCents: string | null };
      averageMonthsUsed: number;
      incomeCents: string;
      expenseCents: string;
      surplusCents: string;
      previousMonthLimits: number;
    };

const STATUS: Record<Status, { label: string; icon: string; chip: string }> = {
  over: { label: 'Acima do limite', icon: 'bi-exclamation-octagon', chip: 'chip-err' },
  at_risk: { label: 'No ritmo atual, passa do limite', icon: 'bi-exclamation-triangle', chip: 'chip-warn' },
  within: { label: 'Dentro do limite', icon: 'bi-check2', chip: 'chip-ok' },
  no_limit: { label: 'Sem limite', icon: 'bi-dash', chip: '' },
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
}

function shift(month: string, offset: number) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + offset, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function usageBps(actual: string, limit: string | null) {
  if (limit === null) return 0;
  const cap = BigInt(limit);
  if (cap <= 0n) return BigInt(actual) > 0n ? 10_000 : 0;
  return Number((BigInt(actual) * 10_000n) / cap);
}

function LimitEditor({ line, month, onDone }: { line: Line; month: string; onDone: (changed: boolean) => Promise<void> | void }) {
  const [value, setValue] = useState(line.limitCents ? centsToInput(line.limitCents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const limitCents = parseMoneyInput(value, { allowZero: true });
    if (limitCents === null) {
      setError('Informe o limite em reais, por exemplo 800,00.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callApi('PUT', '/api/budgets', { json: { month, categoryId: line.categoryId, limitCents } });
      await onDone(true);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <form className="limit-editor" onSubmit={save} onKeyDown={(event) => event.key === 'Escape' && onDone(false)}>
      <label className="field field-amount">
        Limite de {line.name} em {formatMonth(month, false)}
        <input
          // biome-ignore lint/a11y/noAutofocus: o campo abre por ação explícita da pessoa
          autoFocus
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </label>
      <FormError message={error} />
      <div className="row-tight">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          {busy ? 'Salvando limite…' : 'Salvar limite'}
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => onDone(false)} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BudgetRow({ line, month, phase, onChanged }: { line: Line; month: string; phase: 'past' | 'current' | 'future'; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[line.status];
  const usage = usageBps(line.actualCents, line.limitCents);

  async function removeLimit() {
    if (!line.budgetId) return;
    setBusy(true);
    setError(null);
    try {
      await callApi('DELETE', `/api/budgets/${encodeURIComponent(line.budgetId)}`);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause, 'O limite não pôde ser removido. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <th scope="row" data-label="Categoria">
        {line.name}
      </th>
      <td data-label="Gasto e limite">
        <div className="budget-usage">
          <span className="budget-usage-figures">
            <Money cents={line.actualCents} />
            {line.limitCents !== null && (
              <span className="small muted">
                {' '}
                de <Money cents={line.limitCents} />
              </span>
            )}
          </span>
          {line.limitCents !== null && (
            <ProgressBar
              bps={usage}
              tone={line.status === 'over' ? 'over' : 'data'}
              label={`${line.name}: ${Math.min(100, Math.round(usage / 100))}% do limite usado`}
            />
          )}
          {line.remainingCents !== null && (
            <span className="small muted">
              {BigInt(line.remainingCents) >= 0n ? (
                <>
                  Restam <Money cents={line.remainingCents} />
                </>
              ) : (
                <>
                  Passou <Money cents={(-BigInt(line.remainingCents)).toString()} />
                </>
              )}
            </span>
          )}
        </div>
      </td>
      <td className="right" data-label={phase === 'current' ? 'Projeção no fim do mês' : 'Gasto no mês'}>
        {phase === 'current' ? line.projectedCents === null ? <span className="small muted">Sem extrato no mês</span> : <Money cents={line.projectedCents} /> : phase === 'past' ? <Money cents={line.actualCents} /> : <span className="small muted">Mês não começou</span>}
      </td>
      <td className="right" data-label="Média de 3 meses">
        {line.averageCents === null ? <span className="small muted">Sem meses completos</span> : <Money cents={line.averageCents} />}
      </td>
      <td data-label="Situação">
        <span className={`chip ${status.chip}`}>
          <i className={`bi ${status.icon}`} aria-hidden="true" />
          {status.label}
        </span>
      </td>
      <td className="budget-actions" data-label="Ações">
        {line.categoryId === null ? (
          <span className="small muted">Classifique na conciliação</span>
        ) : editing ? (
          <LimitEditor
            line={line}
            month={month}
            onDone={async (changed) => {
              if (changed) await onChanged();
              setEditing(false);
            }}
          />
        ) : (
          <div className="row-tight">
            <button type="button" className="btn btn-sm btn-neutral" onClick={() => setEditing(true)} disabled={busy}>
              {line.limitCents === null ? 'Definir limite' : 'Alterar limite'}
            </button>
            {line.budgetId && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={removeLimit} disabled={busy}>
                {busy ? 'Removendo…' : 'Remover limite'}
              </button>
            )}
          </div>
        )}
        <FormError message={error} />
      </td>
    </tr>
  );
}

function CoverageNotice({ payload }: { payload: Extract<Payload, { hasProfile: true }> }) {
  const monthName = formatMonth(payload.month);
  if (payload.phase === 'future') {
    return (
      <p className="callout callout-info small">
        <i className="bi bi-calendar-event" aria-hidden="true" />
        <span>{monthName} ainda não começou. Defina os limites agora; o gasto aparece quando houver extrato do mês.</span>
      </p>
    );
  }
  if (payload.observedDays === null) {
    return (
      <p className="callout callout-warn small">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <span>
          Nenhum extrato importado cobre {monthName}. Sem extrato, o gasto do mês é desconhecido, não zero.{' '}
          <Link href="/extratos/importar">Importar extrato</Link>
        </span>
      </p>
    );
  }
  const today = new Date();
  if (payload.phase === 'current' && payload.observedDays < today.getDate()) {
    return (
      <p className="callout callout-warn small">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <span>
          O extrato importado vai até o dia {payload.observedDays}. Gastos depois dessa data ainda não aparecem, e a projeção usa só esses {payload.observedDays} dias.
        </span>
      </p>
    );
  }
  if (payload.phase === 'past' && !payload.fullyCovered) {
    return (
      <p className="callout callout-warn small">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <span>O extrato não cobre {monthName} inteiro. O gasto mostrado pode estar incompleto.</span>
      </p>
    );
  }
  return null;
}

function MonthlyReview({ payload }: { payload: Extract<Payload, { hasProfile: true }> }) {
  const limited = payload.lines.filter((line) => line.limitCents !== null);
  const over = limited.filter((line) => line.status === 'over');
  const surplus = BigInt(payload.surplusCents);
  const difference = BigInt(payload.totals.limitCents) - BigInt(payload.totals.actualWithinLimitsCents);
  const monthName = formatMonth(payload.month, false);

  return (
    <section className="card" aria-labelledby="revisao-mensal">
      <div className="card-header">
        <h2 className="h-display" id="revisao-mensal">
          Revisão de {formatMonth(payload.month)}
        </h2>
      </div>
      <ul className="review-list">
        {limited.length === 0 ? (
          <li>
            <i className="bi bi-dash-circle" aria-hidden="true" />
            <span>Nenhuma categoria teve limite em {monthName}, então não há planejado para comparar.</span>
          </li>
        ) : (
          <li>
            <i className={`bi ${over.length === 0 ? 'bi-check2-circle' : 'bi-exclamation-octagon'}`} aria-hidden="true" />
            <span>
              {plural(limited.length - over.length, 'categoria ficou', 'categorias ficaram')} dentro do limite
              {over.length > 0 && <> e {plural(over.length, 'passou', 'passaram')}: {over.map((line) => line.name).join(', ')}</>}.
            </span>
          </li>
        )}
        {limited.length > 0 && (
          <li>
            <i className="bi bi-clipboard-data" aria-hidden="true" />
            <span>
              Nas categorias com limite, o gasto foi <Money cents={payload.totals.actualWithinLimitsCents} /> para <Money cents={payload.totals.limitCents} /> planejados:{' '}
              {difference >= 0n ? (
                <>
                  <Money cents={difference.toString()} /> abaixo do planejado.
                </>
              ) : (
                <>
                  <Money cents={(-difference).toString()} /> acima do planejado.
                </>
              )}
            </span>
          </li>
        )}
        <li>
          <i className="bi bi-piggy-bank" aria-hidden="true" />
          <span>
            Entraram <Money cents={payload.incomeCents} /> e saíram <Money cents={payload.expenseCents} />. {surplus >= 0n ? 'Sobraram' : 'Faltaram'}{' '}
            <Money cents={(surplus >= 0n ? surplus : -surplus).toString()} /> em {monthName}.
          </span>
        </li>
      </ul>
      {surplus > 0n && (
        <Link className="btn-link" href={`/patrimonio/metas?sobra=${payload.surplusCents}`}>
          Simular a divisão desta sobra entre suas metas
          <i className="bi bi-arrow-right-short" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonth);
  const state = useReloadable<Payload>(`/api/budgets?month=${month}`);
  const [copyState, setCopyState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  if (state.status === 'loading') return <LoadingState label="Consultando o orçamento do mês." rows={5} />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="o orçamento" />;
  const { payload } = state;

  if (!payload.hasProfile) {
    return (
      <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="O orçamento usa as categorias e os extratos do seu perfil. Conclua o primeiro acesso para começar.">
        <Link className="btn btn-primary" href="/onboarding">
          Concluir primeiro acesso
        </Link>
      </EmptyState>
    );
  }

  if (payload.lines.length === 0) {
    return (
      <EmptyState
        art="sem-gastos"
        title="Nenhuma categoria de despesa cadastrada"
        text="O orçamento define um limite por categoria de despesa, como Mercado ou Moradia. Cadastre as categorias que você usa para planejar o mês."
      >
        <Link className="btn btn-primary" href="/configuracoes/categorias">
          Cadastrar categorias
        </Link>
      </EmptyState>
    );
  }

  const monthName = formatMonth(payload.month);
  const previousName = formatMonth(shift(payload.month, -1));
  const nextName = formatMonth(shift(payload.month, 1));
  const hasLimits = payload.lines.some((line) => line.limitCents !== null);
  const limitedCount = payload.lines.filter((line) => line.limitCents !== null).length;
  const surplus = BigInt(payload.surplusCents);

  const shownMonth = payload.month;
  async function copyLimits() {
    setCopyState({ busy: true, error: null });
    try {
      await postJson('/api/budgets/copy', { fromMonth: shift(shownMonth, -1), toMonth: shownMonth });
      if (state.status === 'ready') await state.reload();
      setCopyState({ busy: false, error: null });
    } catch (cause) {
      setCopyState({ busy: false, error: errorMessage(cause, 'Os limites não puderam ser copiados. Tente novamente.') });
    }
  }

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`} aria-busy={state.refreshing || undefined}>
      <section className="card card-lg">
        <div className="month-nav">
          <button type="button" className="btn btn-sm btn-neutral" onClick={() => setMonth(shift(payload.month, -1))} aria-label={`Ver ${previousName}`}>
            <i className="bi bi-chevron-left" aria-hidden="true" />
            <span className="btn-label">Mês anterior</span>
          </button>
          <h2 className="h-display" aria-live="polite">
            {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
          </h2>
          <button type="button" className="btn btn-sm btn-neutral" onClick={() => setMonth(shift(payload.month, 1))} aria-label={`Ver ${nextName}`}>
            <span className="btn-label">Próximo mês</span>
            <i className="bi bi-chevron-right" aria-hidden="true" />
          </button>
        </div>

        <dl className="spec-grid budget-totals">
          <div>
            <dt>Gasto confirmado</dt>
            <dd>
              <Money cents={payload.totals.actualCents} />
            </dd>
            <dd className="small muted">{payload.phase === 'current' && payload.observedDays ? `até o dia ${payload.observedDays}` : 'no mês'}</dd>
          </div>
          <div>
            <dt>Planejado</dt>
            <dd>{hasLimits ? <Money cents={payload.totals.limitCents} /> : <span className="muted">Sem limites</span>}</dd>
            <dd className="small muted">{hasLimits ? `em ${plural(limitedCount, 'categoria', 'categorias')}` : 'defina na tabela abaixo'}</dd>
          </div>
          {payload.phase === 'current' && (
            <div>
              <dt>Projeção até o dia {payload.daysInMonth}</dt>
              <dd>{payload.totals.projectedCents === null ? <span className="muted">Sem extrato</span> : <Money cents={payload.totals.projectedCents} />}</dd>
              <dd className="small muted">no ritmo dos dias com extrato</dd>
            </div>
          )}
          <div>
            <dt>{surplus >= 0n ? 'Sobra do mês' : 'Falta no mês'}</dt>
            <dd>
              <Money cents={(surplus >= 0n ? surplus : -surplus).toString()} className={surplus < 0n ? 'figure-negative' : ''} />
            </dd>
            <dd className="small muted">receitas menos gastos confirmados</dd>
          </div>
        </dl>

        <CoverageNotice payload={payload} />

        {!hasLimits && payload.previousMonthLimits > 0 && (
          <div className="row-tight">
            <button type="button" className="btn btn-sm btn-neutral" onClick={copyLimits} disabled={copyState.busy}>
              <i className="bi bi-files" aria-hidden="true" />
              {copyState.busy ? 'Copiando limites…' : `Copiar limites de ${formatMonth(shift(payload.month, -1), false)}`}
            </button>
          </div>
        )}
        <FormError message={copyState.error} />
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Planejado e realizado por categoria</h2>
          <span className="small muted">
            {payload.averageMonthsUsed === 0
              ? 'Média indisponível: nenhum dos três meses anteriores tem extrato completo'
              : `Média de ${plural(payload.averageMonthsUsed, 'mês completo', 'meses completos')} com extrato`}
          </span>
        </div>
        <table className="tbl tbl-data budget-table">
          <caption className="sr-only">Limite, gasto confirmado, projeção, média de três meses e situação de cada categoria de despesa em {monthName}.</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Gasto e limite</th>
              <th scope="col" className="right">
                {payload.phase === 'current' ? 'Projeção' : 'Gasto no mês'}
              </th>
              <th scope="col" className="right">
                Média 3 meses
              </th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payload.lines.map((line) => (
              <BudgetRow key={line.categoryId ?? 'sem-categoria'} line={line} month={payload.month} phase={payload.phase} onChanged={state.reload} />
            ))}
          </tbody>
        </table>
      </section>

      {payload.phase === 'past' && <MonthlyReview payload={payload} />}

      <EducationNotice>
        Os números comparam o que você planejou com o que os extratos mostram. A projeção repete o ritmo dos dias já cobertos e não é uma previsão. Nada aqui é recomendação financeira.
      </EducationNotice>
    </div>
  );
}
