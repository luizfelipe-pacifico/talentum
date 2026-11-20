'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { callApi, postJson } from '@/lib/api-client';
import { centsToInput, formatBps, parseMoneyInput } from '@/lib/money-input';
import {
  EducationNotice,
  EmptyState,
  FormError,
  LoadingState,
  Money,
  ProgressBar,
  QueryError,
  errorMessage,
  dateInput,
  formatFullDate,
  newIdempotencyKey,
  plural,
  todayInput,
  useReloadable,
} from '@/components/planning-ui';

/* Metas de economia (Stage 12 de docs/ROADMAP.md).

   O valor guardado é a soma das contribuições datadas. A viabilidade compara
   o depósito mensal necessário com a sobra média medida nos extratos; sem
   mês completo medido, a tela diz que não sabe. A divisão de uma sobra entre
   metas é só aritmética e não indica onde guardar o dinheiro. */

type Feasibility = 'achieved' | 'no_deadline' | 'deadline_passed' | 'no_data' | 'feasible' | 'not_feasible';

type Plan = {
  savedCents: string;
  remainingCents: string;
  progressBps: number;
  monthsLeft: number | null;
  requiredMonthlyCents: string | null;
  feasibility: Feasibility;
};

type Goal = {
  id: string;
  name: string;
  targetCents: string;
  deadline: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  contributionCount: number;
  plan: Plan;
};

type Surplus = { averageCents: string | null; monthsUsed: number };

type ListPayload = { hasProfile: false } | { hasProfile: true; measuredSurplus: Surplus; goals: Goal[] };

type DetailPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      measuredSurplus: Surplus;
      goal: Goal;
      contributions: { id: string; kind: 'deposit' | 'withdrawal'; amountCents: string; contributedOn: string }[];
    };

const FEASIBILITY: Record<Feasibility, { label: string; icon: string; chip: string }> = {
  achieved: { label: 'Meta atingida', icon: 'bi-trophy', chip: 'chip-ok' },
  feasible: { label: 'Cabe na sobra medida', icon: 'bi-check2-circle', chip: 'chip-ok' },
  not_feasible: { label: 'Não cabe na sobra medida', icon: 'bi-exclamation-triangle', chip: 'chip-warn' },
  no_data: { label: 'Sobra ainda não medida', icon: 'bi-question-circle', chip: 'chip-info' },
  no_deadline: { label: 'Sem prazo', icon: 'bi-infinity', chip: '' },
  deadline_passed: { label: 'Prazo vencido', icon: 'bi-calendar-x', chip: 'chip-err' },
};

function FeasibilityChip({ feasibility }: { feasibility: Feasibility }) {
  const item = FEASIBILITY[feasibility];
  return (
    <span className={`chip ${item.chip}`}>
      <i className={`bi ${item.icon}`} aria-hidden="true" />
      {item.label}
    </span>
  );
}

/** Frase que explica o plano, com os números que levaram ao veredito. */
function PlanSentence({ goal, surplus }: { goal: Goal; surplus: Surplus }) {
  const { plan } = goal;
  if (plan.feasibility === 'achieved') return <>O valor guardado já alcançou o objetivo.</>;
  if (plan.feasibility === 'no_deadline') return <>Faltam <Money cents={plan.remainingCents} />. Sem prazo, não há depósito mensal calculado.</>;
  if (plan.feasibility === 'deadline_passed') {
    return <>O prazo de {goal.deadline ? formatFullDate(goal.deadline) : ''} passou e faltam <Money cents={plan.remainingCents} />. Defina um novo prazo para recalcular.</>;
  }
  const monthly = plan.requiredMonthlyCents ?? '0';
  const months = plural(plan.monthsLeft ?? 0, 'mês', 'meses');
  if (plan.feasibility === 'no_data') {
    return <>Depositar <Money cents={monthly} /> por mês durante {months} fecha a meta. Importe extratos de meses completos para comparar com a sua sobra.</>;
  }
  return (
    <>
      Depositar <Money cents={monthly} /> por mês durante {months} fecha a meta. A sobra média medida é de <Money cents={surplus.averageCents ?? '0'} /> por mês.
    </>
  );
}

function SurplusSummary({ surplus }: { surplus: Surplus }) {
  if (surplus.averageCents === null) {
    return (
      <p className="callout callout-info small">
        <i className="bi bi-info-circle" aria-hidden="true" />
        <span>
          A viabilidade usa a sobra média dos últimos meses com extrato completo. Nenhum mês completo foi importado ainda, então a comparação fica pendente.{' '}
          <Link href="/extratos/importar">Importar extrato</Link>
        </span>
      </p>
    );
  }
  const negative = BigInt(surplus.averageCents) < 0n;
  return (
    <p className="small muted">
      Sobra média medida: <Money cents={surplus.averageCents} /> por mês, em {plural(surplus.monthsUsed, 'mês completo', 'meses completos')} com extrato.
      {negative && ' Os gastos superaram as receitas nesse período.'}
    </p>
  );
}

function GoalForm({ onCreated, onCancel }: { onCreated: (goalId: string) => Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const targetCents = parseMoneyInput(target);
    if (!name.trim()) return setError('Dê um nome à meta, por exemplo Reserva de emergência.');
    if (!targetCents) return setError('Informe o valor da meta em reais, por exemplo 5.000,00.');
    if (deadline && deadline < todayInput()) return setError('O prazo precisa ser hoje ou uma data futura.');
    setBusy(true);
    setError(null);
    try {
      const created = await postJson<{ goalId: string }>('/api/goals', { name: name.trim(), targetCents, deadline: deadline || null });
      setName('');
      setTarget('');
      setDeadline('');
      await onCreated(created.goalId);
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
          Nome da meta
          <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Reserva de emergência" />
        </label>
        <label className="field field-amount">
          Valor da meta
          <input required inputMode="decimal" autoComplete="off" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          Prazo (opcional)
          <input type="date" min={todayInput()} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </label>
      </div>
      <FormError message={error} />
      <div className="row-tight">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Criando meta…' : 'Criar meta'}
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

function GoalRow({ goal, surplus }: { goal: Goal; surplus: Surplus }) {
  const done = goal.plan.feasibility === 'achieved';
  return (
    <li className="goal-row">
      <div className="goal-row-head">
        <Link href={`/patrimonio/metas/${goal.id}`} className="goal-name">
          {goal.name}
        </Link>
        <FeasibilityChip feasibility={goal.plan.feasibility} />
      </div>
      <div className="goal-progress">
        <ProgressBar bps={goal.plan.progressBps} tone={done ? 'done' : 'data'} label={`${goal.name}: ${formatBps(goal.plan.progressBps, 0)} guardado`} />
        <span className="small">
          <Money cents={goal.plan.savedCents} /> de <Money cents={goal.targetCents} /> · {formatBps(goal.plan.progressBps, 0)}
        </span>
      </div>
      <p className="small muted">
        {goal.deadline ? `Prazo: ${formatFullDate(goal.deadline)}. ` : ''}
        <PlanSentence goal={goal} surplus={surplus} />
      </p>
    </li>
  );
}

type Allocation = { goalId: string; name: string; cents: string };

function SurplusAllocator({ initialCents, measured, hasOpenGoals }: { initialCents: string | null; measured: string | null; hasOpenGoals: boolean }) {
  const startValue = initialCents ?? (measured && BigInt(measured) > 0n ? measured : null);
  const [amount, setAmount] = useState(startValue ? centsToInput(startValue) : '');
  const [mode, setMode] = useState<'proportional' | 'deadline'>('deadline');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ allocations: Allocation[]; unallocatedCents: string; amountCents: string; mode: string } | null>(null);
  const anchor = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialCents) anchor.current?.scrollIntoView({ block: 'start' });
  }, [initialCents]);

  async function simulate(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents) return setError('Informe a sobra em reais, por exemplo 400,00.');
    setBusy(true);
    setError(null);
    try {
      setResult(await postJson('/api/goals/surplus-allocation', { amountCents, mode }));
    } catch (cause) {
      setError(errorMessage(cause, 'A simulação não pôde ser feita. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" ref={anchor} aria-labelledby="dividir-sobra">
      <div className="card-header">
        <h2 className="h-display" id="dividir-sobra">
          Dividir uma sobra entre as metas
        </h2>
      </div>
      {!hasOpenGoals ? (
        <p className="small muted">Todas as metas ativas já foram atingidas. Crie uma meta para simular a divisão.</p>
      ) : (
        <form className="stack" onSubmit={simulate} noValidate>
          <div className="field-row">
            <label className="field field-amount">
              Valor da sobra
              <input inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
            </label>
            <fieldset className="field segmented-field">
              <legend>Critério da divisão</legend>
              <span className="segmented">
                <button type="button" aria-pressed={mode === 'deadline'} onClick={() => setMode('deadline')}>
                  Pelo prazo
                </button>
                <button type="button" aria-pressed={mode === 'proportional'} onClick={() => setMode('proportional')}>
                  Pelo que falta
                </button>
              </span>
            </fieldset>
          </div>
          <p className="small muted">
            {mode === 'deadline'
              ? 'Pelo prazo: cada meta recebe na proporção do depósito mensal que precisa, então a de prazo mais curto pesa mais. Metas sem prazo recebem o que sobrar.'
              : 'Pelo que falta: cada meta recebe na proporção do valor que ainda falta para ela.'}
          </p>
          <FormError message={error} />
          <div className="row-tight">
            <button type="submit" className="btn btn-neutral" disabled={busy}>
              {busy ? 'Simulando…' : 'Simular divisão'}
            </button>
          </div>
        </form>
      )}
      {result && (
        <div className="stack" aria-live="polite">
          <table className="tbl tbl-data">
            <caption className="sr-only">Divisão simulada da sobra entre as metas ativas.</caption>
            <thead>
              <tr>
                <th scope="col">Meta</th>
                <th scope="col" className="right">
                  Parte da sobra
                </th>
              </tr>
            </thead>
            <tbody>
              {result.allocations.map((item) => (
                <tr key={item.goalId}>
                  <th scope="row">{item.name}</th>
                  <td className="right">
                    <Money cents={item.cents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {BigInt(result.unallocatedCents) > 0n && (
            <p className="small muted">
              <Money cents={result.unallocatedCents} /> ficam sem destino: é mais do que falta para completar todas as metas.
            </p>
          )}
          <p className="small muted">A simulação não registra nada. Para guardar, abra a meta e registre a contribuição.</p>
        </div>
      )}
    </section>
  );
}

export function GoalsPage() {
  const state = useReloadable<ListPayload>('/api/goals');
  const router = useRouter();
  const params = useSearchParams();
  const fromBudget = params.get('sobra');
  const initialSurplus = fromBudget && /^\d{1,13}$/.test(fromBudget) && BigInt(fromBudget) > 0n ? fromBudget : null;
  const [creating, setCreating] = useState(false);

  if (state.status === 'loading') return <LoadingState label="Consultando as metas." />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="as metas" />;
  const { payload } = state;

  if (!payload.hasProfile) {
    return (
      <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="As metas ficam no seu perfil local. Conclua o primeiro acesso para criar a primeira.">
        <Link className="btn btn-primary" href="/onboarding">
          Concluir primeiro acesso
        </Link>
      </EmptyState>
    );
  }

  const open = (goalId: string) => router.push(`/patrimonio/metas/${goalId}`);

  if (payload.goals.length === 0) {
    return (
      <div className="stack-lg">
        <EmptyState art="sem-metas" title="Nenhuma meta criada" text="Uma meta tem um valor e, se quiser, um prazo. O Talentum calcula quanto guardar por mês e compara com a sobra dos seus extratos." />
        <section className="card card-lg">
          <h2 className="h-display">Criar a primeira meta</h2>
          <GoalForm onCreated={async (goalId) => open(goalId)} />
        </section>
      </div>
    );
  }

  const active = payload.goals.filter((goal) => goal.status === 'active');
  const archived = payload.goals.filter((goal) => goal.status === 'archived');
  const openGoals = active.filter((goal) => goal.plan.feasibility !== 'achieved');

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`}>
      <section className="card card-lg">
        <div className="card-header">
          <h2 className="h-display">{plural(active.length, 'meta ativa', 'metas ativas')}</h2>
          {!creating && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Nova meta
            </button>
          )}
        </div>
        <SurplusSummary surplus={payload.measuredSurplus} />
        {creating && (
          <div className="inset">
            <GoalForm
              onCreated={async (goalId) => {
                setCreating(false);
                open(goalId);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}
        {active.length === 0 ? (
          <p className="small muted">Nenhuma meta ativa. As metas arquivadas estão abaixo.</p>
        ) : (
          <ul className="goal-list">
            {active.map((goal) => (
              <GoalRow key={goal.id} goal={goal} surplus={payload.measuredSurplus} />
            ))}
          </ul>
        )}
      </section>

      <SurplusAllocator initialCents={initialSurplus} measured={payload.measuredSurplus.averageCents} hasOpenGoals={openGoals.length > 0} />

      {archived.length > 0 && (
        <section className="card">
          <h2 className="h-display">Arquivadas</h2>
          <ul className="goal-list">
            {archived.map((goal) => (
              <GoalRow key={goal.id} goal={goal} surplus={payload.measuredSurplus} />
            ))}
          </ul>
        </section>
      )}

      <EducationNotice>
        A viabilidade e a divisão da sobra são contas feitas com os seus números. Elas não indicam onde guardar o dinheiro nem qual investimento escolher.
      </EducationNotice>
    </div>
  );
}

/* ── Detalhe da meta ──────────────────────────────────────────── */

function ContributionForm({ goalId, saved, onSaved }: { goalId: string; saved: string; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uma chave por intenção: repetir o envio do mesmo formulário não grava duas vezes.
  const key = useRef(newIdempotencyKey());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents) return setError('Informe o valor em reais, por exemplo 200,00.');
    if (kind === 'withdrawal' && BigInt(amountCents) > BigInt(saved)) return setError('A retirada é maior que o valor guardado na meta.');
    if (!date || date > todayInput()) return setError('A data precisa ser hoje ou uma data passada.');
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/goals/${encodeURIComponent(goalId)}/contributions`, { kind, amountCents, contributedOn: date, idempotencyKey: key.current });
      key.current = newIdempotencyKey();
      setAmount('');
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <fieldset className="segmented">
        <legend className="sr-only">Tipo de registro</legend>
        <button type="button" aria-pressed={kind === 'deposit'} onClick={() => setKind('deposit')}>
          <i className="bi bi-plus-circle" aria-hidden="true" />
          Depósito
        </button>
        <button type="button" aria-pressed={kind === 'withdrawal'} onClick={() => setKind('withdrawal')} disabled={BigInt(saved) <= 0n}>
          <i className="bi bi-dash-circle" aria-hidden="true" />
          Retirada
        </button>
      </fieldset>
      <div className="field-row">
        <label className="field field-amount">
          Valor
          <input inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          Data
          <input type="date" max={todayInput()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <FormError message={error} />
      <div className="row-tight">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Registrando…' : kind === 'deposit' ? 'Registrar depósito' : 'Registrar retirada'}
        </button>
      </div>
      <p className="small muted">O registro anota o que você guardou. O dinheiro continua onde você o colocou; o Talentum não movimenta contas.</p>
    </form>
  );
}

function GoalSettings({ goal, onSaved }: { goal: Goal; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(centsToInput(goal.targetCents));
  const [deadline, setDeadline] = useState(goal.deadline ? dateInput(new Date(goal.deadline)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const targetCents = parseMoneyInput(target);
    if (!name.trim()) return setError('A meta precisa de um nome.');
    if (!targetCents) return setError('Informe o valor da meta em reais.');
    setBusy(true);
    setError(null);
    try {
      await callApi('PATCH', `/api/goals/${encodeURIComponent(goal.id)}`, { json: { name: name.trim(), targetCents, deadline: deadline || null } });
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'active' | 'archived') {
    setBusy(true);
    setError(null);
    try {
      await callApi('PATCH', `/api/goals/${encodeURIComponent(goal.id)}`, { json: { status } });
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await callApi('DELETE', `/api/goals/${encodeURIComponent(goal.id)}`);
      router.push('/patrimonio/metas');
    } catch (cause) {
      setError(errorMessage(cause, 'A meta não pôde ser excluída. Tente novamente.'));
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="ajustar-meta">
      <h2 className="h-display" id="ajustar-meta">
        Ajustar a meta
      </h2>
      <form className="stack" onSubmit={save} noValidate>
        <div className="field-row">
          <label className="field">
            Nome da meta
            <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field field-amount">
            Valor da meta
            <input inputMode="decimal" autoComplete="off" value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
          <label className="field">
            Prazo (opcional)
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </label>
        </div>
        <FormError message={error} />
        <div className="row-tight">
          <button type="submit" className="btn btn-neutral" disabled={busy}>
            Salvar ajustes
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setStatus(goal.status === 'active' ? 'archived' : 'active')}>
            {goal.status === 'active' ? 'Arquivar meta' : 'Reativar meta'}
          </button>
          {!confirming && (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirming(true)}>
              Excluir meta
            </button>
          )}
        </div>
      </form>
      {confirming && (
        <div className="callout callout-err">
          <div className="stack">
            <p className="callout-title" id="excluir-meta-titulo">
              Excluir a meta {goal.name}?
            </p>
            <p className="small" id="excluir-meta-texto">
              {goal.contributionCount > 0
                ? `As ${plural(goal.contributionCount, 'contribuição registrada', 'contribuições registradas')} saem junto e não podem ser recuperadas. Para guardar o histórico, arquive a meta.`
                : 'A meta sai da lista e não pode ser recuperada.'}
            </p>
            <div className="row-tight">
              <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
                Excluir meta
              </button>
              <button type="button" className="btn btn-sm btn-neutral" onClick={() => setConfirming(false)} disabled={busy}>
                Manter meta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function GoalDetailPage({ goalId }: { goalId: string }) {
  const state = useReloadable<DetailPayload>(`/api/goals/${encodeURIComponent(goalId)}`);
  const [removing, setRemoving] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  if (state.status === 'loading') return <LoadingState label="Consultando a meta." />;
  if (state.status === 'error' && state.notFound) {
    return (
      <EmptyState art="sem-metas" title="Meta não encontrada" text="Esta meta não existe neste computador ou foi excluída.">
        <Link className="btn btn-primary" href="/patrimonio/metas">
          Ver todas as metas
        </Link>
      </EmptyState>
    );
  }
  if (state.status === 'error') return <QueryError retry={state.retry} subject="a meta" />;
  const { payload } = state;
  if (!payload.hasProfile) {
    return (
      <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="As metas ficam no seu perfil local.">
        <Link className="btn btn-primary" href="/onboarding">
          Concluir primeiro acesso
        </Link>
      </EmptyState>
    );
  }

  const { goal, contributions, measuredSurplus } = payload;

  async function removeContribution(id: string) {
    setRemoving(id);
    setListError(null);
    try {
      await callApi('DELETE', `/api/goals/${encodeURIComponent(goal.id)}/contributions/${encodeURIComponent(id)}`);
      if (state.status === 'ready') await state.reload();
    } catch (cause) {
      setListError(errorMessage(cause, 'O registro não pôde ser removido. Tente novamente.'));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`}>
      <Link className="btn-link" href="/patrimonio/metas">
        <i className="bi bi-arrow-left-short" aria-hidden="true" />
        Todas as metas
      </Link>

      <section className="card card-lg">
        <div className="card-header">
          <div className="stack-xs">
            <p className="eyebrow">{goal.status === 'archived' ? 'Meta arquivada' : 'Meta'}</p>
            <h2 className="h-display-lg">{goal.name}</h2>
          </div>
          <FeasibilityChip feasibility={goal.plan.feasibility} />
        </div>
        <div className="goal-progress goal-progress-lg">
          <ProgressBar bps={goal.plan.progressBps} tone={goal.plan.feasibility === 'achieved' ? 'done' : 'data'} label={`${formatBps(goal.plan.progressBps, 0)} da meta guardado`} />
        </div>
        <dl className="spec-grid">
          <div>
            <dt>Guardado</dt>
            <dd>
              <Money cents={goal.plan.savedCents} />
            </dd>
            <dd className="small muted">{formatBps(goal.plan.progressBps, 0)} da meta</dd>
          </div>
          <div>
            <dt>Falta</dt>
            <dd>
              <Money cents={goal.plan.remainingCents} />
            </dd>
            <dd className="small muted">de <Money cents={goal.targetCents} /></dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{goal.deadline ? formatFullDate(goal.deadline) : <span className="muted">Sem prazo</span>}</dd>
            <dd className="small muted">{goal.plan.monthsLeft !== null && goal.plan.monthsLeft > 0 ? `${plural(goal.plan.monthsLeft, 'mês', 'meses')} de depósito, contando este` : ' '}</dd>
          </div>
          <div>
            <dt>Depósito mensal necessário</dt>
            <dd>{goal.plan.requiredMonthlyCents === null ? <span className="muted">Não calculado</span> : <Money cents={goal.plan.requiredMonthlyCents} />}</dd>
            <dd className="small muted">arredondado para cima</dd>
          </div>
        </dl>
        <p className="small">
          <PlanSentence goal={goal} surplus={measuredSurplus} />
        </p>
      </section>

      <div className="planning-split">
        <section className="card" aria-labelledby="registrar-contribuicao">
          <h2 className="h-display" id="registrar-contribuicao">
            Registrar contribuição
          </h2>
          <ContributionForm goalId={goal.id} saved={goal.plan.savedCents} onSaved={state.reload} />
        </section>

        <section className="card" aria-labelledby="historico-meta">
          <h2 className="h-display" id="historico-meta">
            Contribuições
          </h2>
          <FormError message={listError} />
          {contributions.length === 0 ? (
            <p className="small muted">Nenhuma contribuição registrada. O primeiro depósito aparece aqui com a data informada.</p>
          ) : (
            <ul className="entity-list">
              {contributions.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>
                      <Money cents={item.kind === 'withdrawal' ? `-${item.amountCents}` : item.amountCents} sign />
                    </strong>
                    <small className="muted">
                      {item.kind === 'withdrawal' ? 'Retirada' : 'Depósito'} em {formatFullDate(item.contributedOn)}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet"
                    onClick={() => removeContribution(item.id)}
                    disabled={removing !== null}
                    aria-label={`Remover ${item.kind === 'withdrawal' ? 'retirada' : 'depósito'} de ${formatFullDate(item.contributedOn)}`}
                  >
                    {removing === item.id ? 'Removendo…' : 'Remover'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <GoalSettings key={`${goal.name}|${goal.targetCents}|${goal.deadline}|${goal.status}`} goal={goal} onSaved={state.reload} />

      <EducationNotice>O depósito mensal é uma conta: o que falta dividido pelos meses até o prazo. Não é recomendação de quanto guardar nem de onde guardar.</EducationNotice>
    </div>
  );
}
