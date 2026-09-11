'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-state';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { useDashboardData, type DashboardMetrics } from '@/hooks/use-dashboard-data';
import { formatCents, formatPercent, formatPeriod } from '@/lib/format';

/* Dashboard.

   Regras aplicadas, de docs/DASHBOARD.md: um único veredito (R-1), explicável
   sem clique (R-2), no máximo seis elementos de métrica (R-3), todo número com
   comparação (R-4), quatro estados desenhados (R-28) e nenhum zero renderizado
   sem confirmação do backend (R-29). */

function Money({ cents, hero = false }: { cents: string; hero?: boolean }) {
  const money = formatCents(cents);
  return (
    <p className={hero ? 'figure figure-hero' : 'figure'}>
      <span className="figure-symbol">{money.symbol}</span>
      <span className={money.negative ? 'figure-value figure-negative' : 'figure-value'}>{money.value}</span>
    </p>
  );
}

/** Comparação obrigatória. Sem base, diz que não há base — nunca inventa "0%". */
function Delta({ change, label }: { change: number | null; label: string }) {
  const text = formatPercent(change);
  if (text === null) return <p className="small muted">Sem base de comparação {label}.</p>;
  const direction = change === 0 ? 'flat' : (change as number) > 0 ? 'up' : 'down';
  const icon =
    direction === 'up' ? 'bi-arrow-up-right' : direction === 'down' ? 'bi-arrow-down-right' : 'bi-dash';
  return (
    <p className={`delta delta-${direction}`}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      <span className="num">{text}</span>
      <span className="muted">{label}</span>
    </p>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="card">
      <p className="eyebrow">{title}</p>
      {children}
    </article>
  );
}

function Skeleton() {
  return (
    <div className="stack-lg" aria-busy="true" aria-live="polite">
      <p className="sr-only">Consultando o banco local.</p>
      <section className="card card-lg">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-hero" />
        <span className="skeleton skeleton-line" />
      </section>
      <section className="grid grid-260">
        {[0, 1, 2, 3].map((index) => (
          <article key={index} className="card">
            <span className="skeleton skeleton-eyebrow" />
            <span className="skeleton skeleton-metric" />
            <span className="skeleton skeleton-line" />
          </article>
        ))}
      </section>
    </div>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <section className="card card-lg error-state" role="alert">
      <p className="eyebrow">Indicadores indisponíveis</p>
      <h2 className="h-display">Não foi possível consultar o banco local</h2>
      <p className="muted">
        Nenhum valor é exibido enquanto a consulta não responder. Um saldo mostrado agora seria uma
        afirmação sem base.
      </p>
      <button type="button" className="btn btn-neutral" onClick={retry}>
        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        Tentar novamente
      </button>
    </section>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <section className="card card-lg empty">
      <i className="bi bi-hdd" aria-hidden="true" />
      <h2 className="h-display">Sua base financeira ainda está vazia</h2>
      <p className="muted">
        Importe um extrato ou cadastre sua posição atual. Nenhum valor é presumido: os indicadores
        aparecem quando existirem dados gravados no banco local.
      </p>
      <div className="row-tight">
        <button type="button" className="btn btn-primary" onClick={onImport}>
          Importar extrato
        </button>
        <Link className="btn btn-neutral" href="/onboarding">
          Cadastrar posição atual
        </Link>
      </div>
    </section>
  );
}

function CategoryChart() {
  const state = useCategoryBreakdown();

  if (state.status === 'loading') {
    return (
      <section className="card">
        <p className="eyebrow">Para onde o dinheiro foi</p>
        <span className="skeleton skeleton-chart" />
      </section>
    );
  }
  if (state.status === 'error' || !state.payload.hasProfile) return null;

  const { slices, totalCents, period } = state.payload;
  const total = BigInt(totalCents);
  if (total === 0n) return null;

  const largest = slices.reduce(
    (max, slice) => (BigInt(slice.cents) > max ? BigInt(slice.cents) : max),
    0n,
  );

  return (
    <section className="card">
      {/* O título enuncia a pergunta que o gráfico responde (R-9). */}
      <div className="card-header">
        <h2 className="h-display">Para onde o dinheiro foi</h2>
        <span className="small muted">{formatPeriod(period.start, period.end)}</span>
      </div>

      {/* O gráfico é a própria tabela: os valores continuam legíveis sem depender
          da cor e a barra é acessório visual (R-11, R-35). */}
      <table className="catbar">
        <caption className="sr-only">Gastos por categoria no período, do maior para o menor.</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Participação</th>
            <th scope="col" className="right">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice) => {
            const cents = BigInt(slice.cents);
            const share = largest > 0n ? Number((cents * 1000n) / largest) / 10 : 0;
            const percent = Number((cents * 1000n) / total) / 10;
            const recessive = slice.name === 'Sem categoria' || slice.name === 'Outros';
            return (
              <tr key={slice.name}>
                <th scope="row">{slice.name}</th>
                <td>
                  <span className="catbar-track" aria-hidden="true">
                    <span
                      className={recessive ? 'catbar-fill catbar-fill-recessive' : 'catbar-fill'}
                      style={{ width: `${Math.max(share, 1)}%` }}
                    />
                  </span>
                  <span className="catbar-share num">{percent.toFixed(1).replace('.', ',')}%</span>
                </td>
                <td className="right num">{formatCents(slice.cents).value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {slices.some((slice) => slice.name === 'Sem categoria') && (
        <p className="small muted">
          Lançamentos sem categoria aparecem como grupo próprio para que a soma das barras continue
          igual ao total de gastos.
        </p>
      )}
    </section>
  );
}

function Metrics({ data }: { data: DashboardMetrics }) {
  const period = formatPeriod(data.period.start, data.period.end);
  const incomplete = data.accountsWithUnknownBalance > 0;

  return (
    <div className="stack-lg">
      {/* Veredito: o número que o produto existe para entregar. */}
      <section className="card card-lg verdict">
        <p className="eyebrow">Saldo Livre de Risco · {period}</p>
        <Money cents={data.riskFreeBalanceCents} hero />
        <p className="verdict-formula">
          <span className="num">{formatCents(data.balanceCents).value}</span> em conta
          <i className="bi bi-dash" aria-hidden="true" />
          <span className="num">{formatCents(data.committedCents).value}</span> já comprometidos
          {data.committedCount > 0 &&
            ` em ${data.committedCount} ${data.committedCount === 1 ? 'obrigação' : 'obrigações'}`}
        </p>
        {incomplete && (
          <p className="callout callout-warn">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span className="small">
              {data.accountsWithUnknownBalance}{' '}
              {data.accountsWithUnknownBalance === 1 ? 'conta ainda não tem' : 'contas ainda não têm'}{' '}
              saldo informado. O valor acima está incompleto.
            </span>
          </p>
        )}
      </section>

      <section className="grid grid-260">
        <Card title="Saldo em conta">
          <Money cents={data.balanceCents} />
          <p className="small muted">
            {data.accountsWithKnownBalance}{' '}
            {data.accountsWithKnownBalance === 1
              ? 'conta com saldo conhecido'
              : 'contas com saldo conhecido'}
          </p>
        </Card>

        <Card title="Gastos do mês">
          <Money cents={data.monthExpensesCents} />
          <Delta change={data.monthExpensesChange} label="no mesmo período do mês anterior" />
        </Card>

        <Card title="Média diária">
          <Money cents={data.dailyAverageCents} />
          <Delta change={data.dailyAverageChange} label="no ritmo do mês anterior" />
        </Card>

        <Card title="Comprometido no período">
          <Money cents={data.committedCents} />
          <p className="small muted">
            {data.committedCount === 0
              ? 'Nenhuma obrigação cadastrada para este período.'
              : `${data.committedCount} ${
                  data.committedCount === 1 ? 'obrigação vence' : 'obrigações vencem'
                } até o fim do período.`}
          </p>
        </Card>
      </section>

      {data.pendingCount > 0 && (
        <section className="card attention">
          <div className="card-header">
            <h2 className="h-display">Precisa da sua decisão</h2>
          </div>
          <p className="muted">
            {data.pendingCount}{' '}
            {data.pendingCount === 1
              ? 'lançamento aguarda confirmação'
              : 'lançamentos aguardam confirmação'}
            . Até lá eles não entram no saldo nem nos gastos.
          </p>
          <Link className="btn btn-primary" href="/conciliacao">
            Abrir fila de conciliação
          </Link>
        </section>
      )}

      <CategoryChart />
    </div>
  );
}

export function DashboardPage() {
  const app = useApp();
  const state = useDashboardData();

  if (state.status === 'loading') return <Skeleton />;
  if (state.status === 'error') return <ErrorState retry={state.retry} />;
  if (!state.payload.hasProfile) return <EmptyState onImport={app.openImport} />;

  const data = state.payload;
  const withoutBase =
    data.accountsWithKnownBalance === 0 &&
    data.accountsWithUnknownBalance === 0 &&
    data.importCount === 0;

  return withoutBase ? <EmptyState onImport={app.openImport} /> : <Metrics data={data} />;
}
