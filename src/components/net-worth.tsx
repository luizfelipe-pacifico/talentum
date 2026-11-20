'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { callApi, postJson } from '@/lib/api-client';
import { centsToInput, formatBps, parseMoneyInput } from '@/lib/money-input';
import {
  EmptyState,
  FormError,
  LoadingState,
  Money,
  QueryError,
  errorMessage,
  formatFullDate,
  newIdempotencyKey,
  plural,
  todayInput,
  useReloadable,
} from '@/components/planning-ui';

/* Patrimônio e próximo aporte (Stage 14 de docs/ROADMAP.md).

   A divisão em quatro pilares e a banda de 22,5% a 27,5% vêm da metodologia
   ARCA, de Thiago Nigro (docs/ARCA-VISION.md). A tela atribui a metodologia,
   mostra proporções e simula aporte novo sem venda. Não recomenda produto. */

type Pillar = 'stocks' | 'real_estate' | 'cash' | 'international';
type AssetPillar = Pillar | 'outside';
type PillarStatus = 'balanced' | 'lagging' | 'overweight';

type Survival = { riskFreeBalanceCents: string | null; active: boolean; reasons: ('negative_risk_free_balance' | 'overdue_debt')[] };

type PortfolioPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      band: { minBps: number; targetBps: number; maxBps: number };
      summary: {
        netWorthCents: string;
        pillarTotalCents: string;
        outsideCents: string;
        pillars: { pillar: Pillar; cents: string; shareBps: number; status: PillarStatus }[];
        referenceDate: string | null;
        assetsWithoutValue: number;
        balanced: boolean;
      };
      assets: { id: string; name: string; pillar: AssetPillar; valueCents: string | null; capturedAt: string | null; snapshotCount: number }[];
      survival: Survival;
    };

export const PILLAR_INFO: Record<AssetPillar, { letter: string; label: string; hint: string }> = {
  stocks: { letter: 'A', label: 'Ações', hint: 'ações de empresas brasileiras' },
  real_estate: { letter: 'R', label: 'Imóveis', hint: 'imóveis e fundos imobiliários' },
  cash: { letter: 'C', label: 'Caixa', hint: 'reserva e renda fixa com liquidez' },
  international: { letter: 'A', label: 'Ativos internacionais', hint: 'investimentos no exterior ou em moeda estrangeira' },
  outside: { letter: '', label: 'Fora dos pilares', hint: 'bens que contam no patrimônio, mas não na divisão, como um veículo' },
};

const PILLAR_ORDER: AssetPillar[] = ['stocks', 'real_estate', 'cash', 'international', 'outside'];

const STATUS: Record<PillarStatus, { label: string; icon: string; chip: string }> = {
  balanced: { label: 'Na banda', icon: 'bi-check2-circle', chip: 'chip-ok' },
  lagging: { label: 'Abaixo da banda', icon: 'bi-arrow-down-circle', chip: 'chip-warn' },
  overweight: { label: 'Acima da banda', icon: 'bi-arrow-up-circle', chip: 'chip-info' },
};

function StatusChip({ status }: { status: PillarStatus }) {
  const item = STATUS[status];
  return (
    <span className={`chip ${item.chip}`}>
      <i className={`bi ${item.icon}`} aria-hidden="true" />
      {item.label}
    </span>
  );
}

/** Atribuição da metodologia e aviso de que nada aqui é recomendação. Obrigatório (ROADMAP, Stage 14). */
export function MethodologyNotice() {
  return (
    <aside className="callout callout-info planning-notice">
      <i className="bi bi-bookmark" aria-hidden="true" />
      <p className="small">
        A divisão em quatro pilares iguais e a banda de 22,5% a 27,5% seguem a metodologia ARCA, criada por Thiago Nigro. O Talentum calcula proporções e simulações com os valores
        que você informou; não recomenda produto, compra ou venda, e o resultado não é orientação financeira individual.
      </p>
    </aside>
  );
}

function PillarBars({ pillars, band }: { pillars: Extract<PortfolioPayload, { hasProfile: true }>['summary']['pillars']; band: { minBps: number; targetBps: number; maxBps: number } }) {
  // Escala de 0 a 50%, ampliada só quando um pilar passa disso, para a banda não virar um fio.
  const maxShare = Math.max(...pillars.map((item) => item.shareBps), 5_000);
  const scale = Math.ceil(maxShare / 1_000) * 1_000;
  const at = (bps: number) => `${(bps / scale) * 100}%`;
  return (
    <ul className="arca-list">
      {pillars.map((item) => {
        const info = PILLAR_INFO[item.pillar];
        return (
          <li key={item.pillar} className="arca-row">
            <div className="arca-row-head">
              <span className="arca-name">
                <span className="arca-letter" aria-hidden="true">
                  {info.letter}
                </span>
                <span>
                  <strong>{info.label}</strong>
                  <span className="small muted"> · {info.hint}</span>
                </span>
              </span>
              <StatusChip status={item.status} />
            </div>
            <div className="arca-track" aria-hidden="true">
              <span className="arca-band" style={{ left: at(band.minBps), width: at(band.maxBps - band.minBps) }} />
              <span className="arca-fill" style={{ width: at(Math.min(item.shareBps, scale)) }} />
              <span className="arca-target" style={{ left: at(band.targetBps) }} />
            </div>
            <p className="arca-figures small">
              <span className="num arca-share">{formatBps(item.shareBps)}</span>
              <Money cents={item.cents} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function AssetForm({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<AssetPillar>('cash');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const valueCents = parseMoneyInput(value, { allowZero: true });
    if (!name.trim()) return setError('Dê um nome ao bem, por exemplo Tesouro Selic ou Apartamento.');
    if (valueCents === null) return setError('Informe o valor atual em reais, por exemplo 10.000,00.');
    if (!date || date > todayInput()) return setError('A data do valor precisa ser hoje ou uma data passada.');
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/assets', { name: name.trim(), pillar, valueCents, capturedAt: date, idempotencyKey: key.current });
      key.current = newIdempotencyKey();
      setName('');
      setValue('');
      await onCreated();
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
          Nome do bem
          <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Tesouro Selic" />
        </label>
        <label className="field">
          Pilar
          <select value={pillar} onChange={(event) => setPillar(event.target.value as AssetPillar)}>
            {PILLAR_ORDER.map((item) => (
              <option key={item} value={item}>
                {PILLAR_INFO[item].label}: {PILLAR_INFO[item].hint}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field field-amount">
          Valor atual
          <input inputMode="decimal" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          Data do valor
          <input type="date" max={todayInput()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <FormError message={error} />
      <div className="row-tight">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Cadastrando…' : 'Cadastrar bem'}
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

type AssetRow = Extract<PortfolioPayload, { hasProfile: true }>['assets'][number];

function AssetItem({ asset, onChanged }: { asset: AssetRow; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'view' | 'value' | 'pillar' | 'confirm-delete'>('view');
  const [value, setValue] = useState(asset.valueCents ? centsToInput(asset.valueCents) : '');
  const [date, setDate] = useState(todayInput);
  const [pillar, setPillar] = useState<AssetPillar>(asset.pillar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setMode('view');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveValue(event: FormEvent) {
    event.preventDefault();
    const valueCents = parseMoneyInput(value, { allowZero: true });
    if (valueCents === null) return setError('Informe o valor em reais, por exemplo 10.000,00.');
    if (!date || date > todayInput()) return setError('A data do valor precisa ser hoje ou uma data passada.');
    await run(async () => {
      await postJson(`/api/assets/${encodeURIComponent(asset.id)}/snapshots`, { valueCents, capturedAt: date, idempotencyKey: key.current });
      key.current = newIdempotencyKey();
    });
  }

  return (
    <li className="asset-item">
      <div className="asset-item-main">
        <span className="stack-xs">
          <strong>{asset.name}</strong>
          <span className="small muted">
            {asset.capturedAt ? `Valor de ${formatFullDate(asset.capturedAt)}` : 'Sem valor informado'}
            {asset.snapshotCount > 1 && ` · ${plural(asset.snapshotCount, 'valor registrado', 'valores registrados')}`}
          </span>
        </span>
        <span className="asset-value">{asset.valueCents === null ? <span className="small muted">Sem valor</span> : <Money cents={asset.valueCents} />}</span>
      </div>
      {mode === 'view' && (
        <div className="row-tight">
          <button type="button" className="btn btn-sm btn-neutral" onClick={() => setMode('value')}>
            Atualizar valor
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setMode('pillar')}>
            Mudar pilar
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setMode('confirm-delete')}>
            Excluir
          </button>
        </div>
      )}
      {mode === 'value' && (
        <form className="stack inset" onSubmit={saveValue} noValidate onKeyDown={(event) => event.key === 'Escape' && setMode('view')}>
          <div className="field-row">
            <label className="field field-amount">
              Novo valor de {asset.name}
              <input inputMode="decimal" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
            </label>
            <label className="field">
              Data do valor
              <input type="date" max={todayInput()} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
          <p className="small muted">O valor anterior fica no histórico; o patrimônio passa a usar o mais recente.</p>
          <div className="row-tight">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar valor'}
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setMode('view')} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {mode === 'pillar' && (
        <form
          className="stack inset"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => callApi('PATCH', `/api/assets/${encodeURIComponent(asset.id)}`, { json: { pillar } }));
          }}
        >
          <label className="field">
            Pilar de {asset.name}
            <select value={pillar} onChange={(event) => setPillar(event.target.value as AssetPillar)}>
              {PILLAR_ORDER.map((item) => (
                <option key={item} value={item}>
                  {PILLAR_INFO[item].label}: {PILLAR_INFO[item].hint}
                </option>
              ))}
            </select>
          </label>
          <div className="row-tight">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              Salvar pilar
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setMode('view')} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {mode === 'confirm-delete' && (
        <div className="callout callout-err">
          <div className="stack-xs">
            <p className="small">
              Excluir <strong>{asset.name}</strong> apaga {plural(asset.snapshotCount, 'o valor registrado', `os ${asset.snapshotCount} valores registrados`)} e tira o bem do patrimônio. Não
              pode ser desfeito.
            </p>
            <div className="row-tight">
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => callApi('DELETE', `/api/assets/${encodeURIComponent(asset.id)}`))}>
                Excluir bem
              </button>
              <button type="button" className="btn btn-sm btn-neutral" disabled={busy} onClick={() => setMode('view')}>
                Manter bem
              </button>
            </div>
          </div>
        </div>
      )}
      <FormError message={error} />
    </li>
  );
}

function NoProfile() {
  return (
    <EmptyState art="perfil-vazio" title="Primeiro acesso não concluído" text="O patrimônio fica no seu perfil local. Conclua o primeiro acesso para cadastrar seus bens.">
      <Link className="btn btn-primary" href="/onboarding">
        Concluir primeiro acesso
      </Link>
    </EmptyState>
  );
}

export function NetWorthPage() {
  const state = useReloadable<PortfolioPayload>('/api/portfolio');
  const [adding, setAdding] = useState(false);

  if (state.status === 'loading') return <LoadingState label="Consultando o patrimônio." rows={4} />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="o patrimônio" />;
  const { payload } = state;
  if (!payload.hasProfile) return <NoProfile />;

  if (payload.assets.length === 0) {
    return (
      <div className="stack-lg">
        <EmptyState
          art="sem-patrimonio"
          title="Nenhum bem cadastrado"
          text="Cadastre seus investimentos e bens com o valor atual e a data. O Talentum soma o patrimônio e mostra como ele se divide entre os quatro pilares."
        />
        <section className="card card-lg">
          <h2 className="h-display">Cadastrar o primeiro bem</h2>
          <AssetForm onCreated={state.reload} />
        </section>
        <MethodologyNotice />
      </div>
    );
  }

  const { summary, band } = payload;
  const outOfBand = summary.pillars.filter((item) => item.status !== 'balanced').length;

  return (
    <div className={`stack-lg ${state.refreshing ? 'is-refreshing' : ''}`}>
      <section className="card card-lg">
        <p className="eyebrow">Patrimônio total</p>
        <p className="figure figure-hero">
          <Money cents={summary.netWorthCents} />
        </p>
        <p className="small muted">
          {summary.referenceDate ? `Soma dos últimos valores informados; o mais antigo é de ${formatFullDate(summary.referenceDate)}.` : 'Nenhum bem tem valor informado.'}
          {BigInt(summary.outsideCents) > 0n && (
            <>
              {' '}
              Inclui <Money cents={summary.outsideCents} /> fora dos pilares.
            </>
          )}
          {summary.assetsWithoutValue > 0 && ` ${plural(summary.assetsWithoutValue, 'bem está', 'bens estão')} sem valor e fora da soma.`}
        </p>
      </section>

      <section className="card" aria-labelledby="quatro-pilares">
        <div className="card-header">
          <h2 className="h-display" id="quatro-pilares">
            {BigInt(summary.pillarTotalCents) === 0n
              ? 'Nenhum valor nos quatro pilares'
              : summary.balanced
                ? 'Os quatro pilares estão na banda'
                : `${plural(outOfBand, 'pilar está', 'pilares estão')} fora da banda`}
          </h2>
          <span className="small muted">
            Meta de {formatBps(band.targetBps, 0)} por pilar; banda de {formatBps(band.minBps)} a {formatBps(band.maxBps)} de <Money cents={summary.pillarTotalCents} />
          </span>
        </div>
        {BigInt(summary.pillarTotalCents) > 0n ? (
          <>
            <PillarBars pillars={summary.pillars} band={band} />
            <p className="legend-row small muted" aria-hidden="true">
              <span className="legend">
                <span className="legend-swatch arca-legend-fill" />
                Participação
              </span>
              <span className="legend">
                <span className="legend-swatch arca-legend-band" />
                Banda de 22,5% a 27,5%
              </span>
            </p>
          </>
        ) : (
          <p className="small muted">Todos os bens com valor estão fora dos pilares. Mude o pilar de um bem para ver a divisão.</p>
        )}
        {payload.survival.active ? (
          <p className="callout callout-warn small">
            <i className="bi bi-life-preserver" aria-hidden="true" />
            <span>
              Modo sobrevivência ativo: a simulação de aportes fica pausada até a situação de liquidez se normalizar. <Link href="/planejamento/sobrevivencia">Ver modo sobrevivência</Link>
            </span>
          </p>
        ) : (
          <Link className="btn-link" href="/patrimonio/aportes">
            Simular o próximo aporte
            <i className="bi bi-arrow-right-short" aria-hidden="true" />
          </Link>
        )}
      </section>

      <section className="card" aria-labelledby="bens">
        <div className="card-header">
          <h2 className="h-display" id="bens">
            Bens
          </h2>
          {!adding && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Cadastrar bem
            </button>
          )}
        </div>
        {adding && (
          <div className="inset">
            <AssetForm
              onCreated={async () => {
                await state.reload();
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
        {PILLAR_ORDER.map((pillar) => {
          const items = payload.assets.filter((asset) => asset.pillar === pillar);
          if (items.length === 0) return null;
          return (
            <div key={pillar} className="asset-group">
              <h3 className="asset-group-title">{PILLAR_INFO[pillar].label}</h3>
              <ul className="asset-list">
                {items.map((asset) => (
                  <AssetItem key={`${asset.id}:${asset.valueCents}:${asset.pillar}`} asset={asset} onChanged={state.reload} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <MethodologyNotice />
    </div>
  );
}

/* ── Próximo aporte ───────────────────────────────────────────── */

type Step = {
  pillar: Pillar;
  beforeCents: string;
  beforeShareBps: number;
  beforeStatus: PillarStatus;
  allocationCents: string;
  afterCents: string;
  afterShareBps: number;
  afterStatus: PillarStatus;
};

type Simulation =
  | { status: 'survival'; survival: Survival }
  | { status: 'ok'; amountCents: string; totalBeforeCents: string; totalAfterCents: string; steps: Step[] };

function SurvivalPause() {
  return (
    <section className="card card-lg" aria-labelledby="aporte-pausado">
      <div className="callout callout-warn">
        <i className="bi bi-life-preserver" aria-hidden="true" />
        <div className="stack-xs">
          <p className="callout-title" id="aporte-pausado">
            Simulação pausada pelo modo sobrevivência
          </p>
          <p className="small">
            O Saldo Livre de Risco está negativo ou há dívida em atraso. Nesse caso, a metodologia põe a divisão entre pilares em segundo plano até as contas do mês fecharem e as
            dívidas caras saírem da frente.
          </p>
          <div className="row-tight">
            <Link className="btn btn-sm btn-neutral" href="/planejamento/sobrevivencia">
              Ver modo sobrevivência
            </Link>
            <Link className="btn btn-sm btn-quiet" href="/planejamento/dividas">
              Ver dívidas
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function NextContributionPage() {
  const state = useReloadable<PortfolioPayload>('/api/portfolio');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Simulation | null>(null);

  if (state.status === 'loading') return <LoadingState label="Consultando o patrimônio." />;
  if (state.status === 'error') return <QueryError retry={state.retry} subject="o patrimônio" />;
  const { payload } = state;
  if (!payload.hasProfile) return <NoProfile />;

  if (payload.assets.length === 0) {
    return (
      <div className="stack-lg">
        <EmptyState art="sem-patrimonio" title="Cadastre o patrimônio antes de simular" text="A simulação divide o aporte conforme o quanto cada pilar tem hoje. Sem bens cadastrados, não há divisão para equilibrar.">
          <Link className="btn btn-primary" href="/patrimonio">
            Cadastrar bens
          </Link>
        </EmptyState>
        <MethodologyNotice />
      </div>
    );
  }

  if (payload.survival.active) {
    return (
      <div className="stack-lg">
        <SurvivalPause />
        <MethodologyNotice />
      </div>
    );
  }

  async function simulate(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents) return setError('Informe o valor do aporte em reais, por exemplo 500,00.');
    setBusy(true);
    setError(null);
    try {
      setResult(await postJson<Simulation>('/api/portfolio/contribution-simulation', { amountCents }));
    } catch (cause) {
      setError(errorMessage(cause, 'A simulação não pôde ser feita. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  const lagging = result?.status === 'ok' ? result.steps.filter((step) => step.beforeStatus === 'lagging') : [];
  const receivers = result?.status === 'ok' ? result.steps.filter((step) => BigInt(step.allocationCents) > 0n) : [];

  return (
    <div className="stack-lg">
      <section className="card card-lg" aria-labelledby="simular-aporte">
        <h2 className="h-display" id="simular-aporte">
          Quanto você vai aportar?
        </h2>
        <form className="stack" onSubmit={simulate} noValidate>
          <div className="field-row">
            <label className="field field-amount">
              Valor do aporte
              <input inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
            </label>
          </div>
          <FormError message={error} />
          <div className="row-tight">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Simulando…' : 'Simular aporte'}
            </button>
          </div>
        </form>
        <p className="small muted">A simulação só divide dinheiro novo. Nenhuma venda é considerada, e nada é registrado.</p>
      </section>

      {result?.status === 'survival' && <SurvivalPause />}

      {result?.status === 'ok' && (
        <section className="card" aria-labelledby="resultado-aporte" aria-live="polite">
          <h2 className="h-display" id="resultado-aporte">
            {receivers.length === 1
              ? `Todo o aporte vai para ${PILLAR_INFO[receivers[0].pillar].label}`
              : `O aporte se divide entre ${plural(receivers.length, 'pilar', 'pilares')}`}
          </h2>
          <ol className="calc-steps small">
            <li>Modo sobrevivência desligado: a simulação pode seguir.</li>
            <li>
              Total nos quatro pilares: <Money cents={result.totalBeforeCents} /> hoje e <Money cents={result.totalAfterCents} /> com o aporte de <Money cents={result.amountCents} />.
            </li>
            <li>
              {lagging.length === 0
                ? 'Nenhum pilar está abaixo de 22,5% hoje.'
                : `Abaixo da banda hoje: ${lagging.map((step) => `${PILLAR_INFO[step.pillar].label} (${formatBps(step.beforeShareBps)})`).join(', ')}.`}
            </li>
            <li>O dinheiro vai primeiro ao pilar mais baixo até ele alcançar o seguinte, e depois aos dois juntos, sem passar de 25% do novo total. Pilar acima da meta não recebe.</li>
          </ol>
          <div className="table-scroll">
            <table className="tbl tbl-data contribution-table">
              <caption className="sr-only">Valor e participação de cada pilar antes e depois do aporte simulado.</caption>
              <thead>
                <tr>
                  <th scope="col">Pilar</th>
                  <th scope="col" className="right">
                    Hoje
                  </th>
                  <th scope="col" className="right">
                    Aporte simulado
                  </th>
                  <th scope="col" className="right">
                    Depois
                  </th>
                  <th scope="col">Situação depois</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((step) => (
                  <tr key={step.pillar} className={BigInt(step.allocationCents) > 0n ? 'is-receiver' : ''}>
                    <th scope="row">{PILLAR_INFO[step.pillar].label}</th>
                    <td className="right">
                      <Money cents={step.beforeCents} />
                      <span className="small muted cell-sub">{formatBps(step.beforeShareBps)}</span>
                    </td>
                    <td className="right">
                      <strong>
                        <Money cents={step.allocationCents} />
                      </strong>
                    </td>
                    <td className="right">
                      <Money cents={step.afterCents} />
                      <span className="small muted cell-sub">{formatBps(step.afterShareBps)}</span>
                    </td>
                    <td>
                      <StatusChip status={step.afterStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Para registrar o aporte depois de feito, atualize o valor do bem em Patrimônio.</p>
        </section>
      )}

      <MethodologyNotice />
    </div>
  );
}
