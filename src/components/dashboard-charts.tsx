'use client';

import { useEffect, useState } from 'react';
import { getJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

/* Os dois gráficos do painel que faltavam.

   G-1, projeção de caixa: linha em degraus, série única, o único elemento da
   tela que mostra o futuro. G-3, entradas e saídas por mês: barra divergente
   ancorada no zero.

   Regras de docs/DASHBOARD.md aplicadas aqui: o título enuncia a pergunta que o
   gráfico responde (R-9), toda visualização tem tabela equivalente (R-11), o
   rótulo direto vai só no que importa (R-12), a cor nunca é o único canal
   (R-35) e nenhum período sem cobertura vira zero (G-3). */

function shortDay(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function monthLabel(iso: string) {
  const [year, month] = iso.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function Money({ cents, sign = false }: { cents: string; sign?: boolean }) {
  const money = formatCents(cents);
  const prefix = sign && !money.negative && cents !== '0' ? '+' : '';
  return (
    <span className={money.negative ? 'num figure-negative' : 'num'}>
      {money.symbol} {prefix}
      {money.value}
    </span>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <section className="card" aria-busy="true">
      <p className="eyebrow">{title}</p>
      <span className="skeleton skeleton-chart" />
    </section>
  );
}

/* ── G-1: projeção de caixa ─────────────────────────────────────── */

type ProjectionPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      period: { start: string; end: string };
      balanceCents: string;
      committedCents: string;
      riskFreeBalanceCents: string;
      estimatedObligations: number;
      accountsWithUnknownBalance: number;
      obligations: { id: string; description: string; amountCents: string; dueDate: string; isEstimated: boolean }[];
      projection: {
        shortfallDay: string | null;
        endingBalanceCents: string;
        points: { day: string; balanceCents: string; dueCents: string }[];
      };
    };

/* União discriminada por membro, não por união dentro do membro: só assim o
   TypeScript estreita `payload` depois de checar `status`. */
type ChartState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: T };

export function CashProjectionChart() {
  const [state, setState] = useState<ChartState<ProjectionPayload>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getJson<ProjectionPayload>('/api/dashboard/risk-free-balance', controller.signal)
      .then((payload) => active && setState({ status: 'ready', payload }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') return <ChartSkeleton title="O dinheiro dura até o fim do período?" />;
  if (state.status === 'error' || !state.payload.hasProfile) return null;

  const { projection, obligations } = state.payload;
  const points = projection.points;
  if (points.length < 2 || obligations.length === 0) return null;

  const values = points.map((point) => Number(BigInt(point.balanceCents)));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const width = 720;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 28, left: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index: number) => padding.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + ((max - value) / span) * plotHeight;
  const zeroY = y(0);

  // Linha em degraus: o saldo só muda no dia em que uma obrigação vence.
  const steps = points
    .map((point, index) => {
      const px = x(index);
      const py = y(values[index]);
      return index === 0 ? `M ${px} ${py}` : `H ${px} V ${py}`;
    })
    .join(' ');

  const area = `${steps} V ${zeroY} H ${padding.left} Z`;
  const shortfallIndex = projection.shortfallDay
    ? points.findIndex((point) => point.day === projection.shortfallDay)
    : -1;

  const negative = BigInt(projection.endingBalanceCents) < 0n;

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="h-display">
          {negative
            ? 'O dinheiro não cobre os compromissos do período'
            : 'O dinheiro cobre os compromissos do período'}
        </h2>
        <span className="small muted">
          {shortDay(points[0].day)} a {shortDay(points[points.length - 1].day)}
        </span>
      </div>

      <figure className="chart">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Projeção do saldo até o fim do período. Saldo final projetado de ${formatCents(projection.endingBalanceCents).value} reais.`}
          preserveAspectRatio="none"
        >
          <path d={area} className="projection-area" />
          <path d={steps} className="projection-line" fill="none" />
          <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} className="chart-zero" />
          {shortfallIndex >= 0 && (
            <circle cx={x(shortfallIndex)} cy={y(values[shortfallIndex])} r="5" className="projection-shortfall" />
          )}
        </svg>
        <figcaption className="small muted">
          A projeção desconta apenas o que já está comprometido. Renda futura prevista não entra — se
          entrasse, isto deixaria de ser saldo livre de risco e viraria previsão.
        </figcaption>
      </figure>

      {projection.shortfallDay && (
        <p className="callout callout-warn">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <span className="small">
            O saldo projetado fica negativo em <strong>{shortDay(projection.shortfallDay)}</strong>.
          </span>
        </p>
      )}

      {state.payload.estimatedObligations > 0 && (
        <p className="small muted">
          {state.payload.estimatedObligations}{' '}
          {state.payload.estimatedObligations === 1
            ? 'obrigação tem valor aproximado'
            : 'obrigações têm valor aproximado'}
          , então a projeção é uma estimativa nesses pontos.
        </p>
      )}

      {/* Tabela equivalente: canal de acessibilidade e fonte de verdade dos
          valores (R-11). Só os dias em que algo vence — os degraus da linha. */}
      <table className="tbl tbl-data">
        <caption className="sr-only">Obrigações que vencem no período e o saldo projetado após cada uma.</caption>
        <thead>
          <tr>
            <th scope="col">Vence em</th>
            <th scope="col">Compromisso</th>
            <th scope="col" className="right">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((obligation) => (
            <tr key={obligation.id}>
              <td className="num">{shortDay(obligation.dueDate.slice(0, 10))}</td>
              <td>
                {obligation.description}
                {obligation.isEstimated && <span className="small muted"> · aproximado</span>}
              </td>
              <td className="right">
                <Money cents={`-${obligation.amountCents}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ── G-3: entradas e saídas por mês ─────────────────────────────── */

type CashFlowPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      coverageRanges: number;
      months: {
        month: string;
        incomeCents: string;
        expenseCents: string;
        netCents: string;
        coverage: 'full' | 'partial';
      }[];
    };

export function CashFlowChart() {
  const [state, setState] = useState<ChartState<CashFlowPayload>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getJson<CashFlowPayload>('/api/dashboard/cash-flow', controller.signal)
      .then((payload) => active && setState({ status: 'ready', payload }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') return <ChartSkeleton title="Eu gasto mais do que ganho?" />;
  if (state.status === 'error' || !state.payload.hasProfile) return null;

  const months = state.payload.months;
  if (months.length === 0) return null;

  const amounts = months.flatMap((month) => [Number(BigInt(month.incomeCents)), Number(BigInt(month.expenseCents))]);
  const peak = Math.max(...amounts, 1);

  const barWidth = 34;
  const gap = 18;
  const width = Math.max(months.length * (barWidth + gap) + gap, 240);
  const half = 90;
  const height = half * 2 + 26;

  const partial = months.filter((month) => month.coverage === 'partial').length;
  const totalNet = months.reduce((sum, month) => sum + BigInt(month.netCents), 0n);

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="h-display">
          {totalNet < 0n
            ? 'No período coberto, você gastou mais do que ganhou'
            : 'No período coberto, você ganhou mais do que gastou'}
        </h2>
        <span className="small muted">Somente meses com extrato importado.</span>
      </div>

      <figure className="chart chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Entradas e saídas por mês, com entradas acima e saídas abaixo da linha zero.">
          {months.map((month, index) => {
            const left = gap + index * (barWidth + gap);
            const income = Number(BigInt(month.incomeCents));
            const expense = Number(BigInt(month.expenseCents));
            const incomeHeight = (income / peak) * (half - 8);
            const expenseHeight = (expense / peak) * (half - 8);
            const dim = month.coverage === 'partial';
            return (
              <g key={month.month} opacity={dim ? 0.55 : 1}>
                <rect
                  x={left}
                  y={half - incomeHeight}
                  width={barWidth}
                  height={Math.max(incomeHeight, 1)}
                  rx="4"
                  className="flow-income"
                />
                <rect
                  x={left}
                  y={half + 2}
                  width={barWidth}
                  height={Math.max(expenseHeight, 1)}
                  rx="4"
                  className="flow-expense"
                />
                <text x={left + barWidth / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">
                  {monthLabel(month.month)}
                </text>
              </g>
            );
          })}
          {/* Cinza neutro na linha zero, conforme R-18. */}
          <line x1="0" x2={width} y1={half} y2={half} className="chart-zero" />
        </svg>
      </figure>

      {partial > 0 && (
        <p className="callout callout-info">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span className="small">
            {partial} {partial === 1 ? 'mês está' : 'meses estão'} com extrato parcial e {partial === 1 ? 'aparece' : 'aparecem'}{' '}
            esmaecido. Meio mês de extrato parece mês de gasto baixo.
          </span>
        </p>
      )}

      <table className="tbl tbl-data">
        <caption className="sr-only">Entradas, saídas e resultado por mês, apenas nos meses com extrato.</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" className="right">
              Entradas
            </th>
            <th scope="col" className="right">
              Saídas
            </th>
            <th scope="col" className="right">
              Resultado
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <td>
                {monthLabel(month.month)}
                {month.coverage === 'partial' && <span className="small muted"> · parcial</span>}
              </td>
              <td className="right">
                <Money cents={month.incomeCents} sign />
              </td>
              <td className="right">
                <Money cents={`-${month.expenseCents}`} />
              </td>
              <td className="right">
                <Money cents={month.netCents} sign />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="small muted">
        Meses sem extrato importado não aparecem. Mostrá-los como barra vazia afirmaria que não houve
        movimento, quando o que existe é ausência de dado.
      </p>
    </section>
  );
}
