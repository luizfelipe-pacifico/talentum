'use client';

/* Perfil e progresso (/perfil, Stage 17).

   XP, nível, missões e conquistas por hábitos que mantêm os dados úteis. O
   painel segue o padrão de progresso de apps de hábito (Duolingo, Apple
   Fitness): nível e barra no topo, missões com progresso e uma ação cada,
   conquistas com estado bloqueado visível. Sem ranking, sem comparação com
   outras pessoas, sem valores em dinheiro (docs/ROADMAP.md, Stage 17). */

import '@/app/local-data.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { StateArt } from '@/components/state-art';
import { callApi, getJson } from '@/lib/api-client';

type Mission = { id: string; title: string; description: string; current: number; target: number; done: boolean; reward: string; href: string | null; actionLabel: string | null; reviewMonth: string | null };
type Badge = { id: string; title: string; description: string; unlockedAt: string | null };
type Summary =
  | { hasProfile: false }
  | {
      hasProfile: true;
      xp: number;
      level: { level: number; title: string; floor: number; nextFloor: number | null; nextTitle: string | null };
      ledger: { date: string; xp: number; reason: string }[];
      badges: Badge[];
      missions: Mission[];
    };

const integer = new Intl.NumberFormat('pt-BR');
const day = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

const BADGE_ICON: Record<string, string> = {
  'primeiro-extrato': 'bi-file-earmark-arrow-up',
  'dez-semanas': 'bi-calendar-check',
  conferente: 'bi-check2-square',
  'tres-meses-em-dia': 'bi-calendar3',
  'mes-revisado': 'bi-journal-check',
  'copia-guardada': 'bi-shield-check',
};

export function ProfileProgressScreen() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: Summary }>({ status: 'loading' });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    getJson<Summary>('/api/gamification')
      .then((payload) => setState({ status: 'ready', payload }))
      .catch(() => setState({ status: 'error' }));
  }, []);
  useEffect(load, [load]);

  const review = async (month: string) => {
    setReviewing(month);
    setNotice(null);
    try {
      await callApi('POST', '/api/gamification/month-reviews', { json: { month } });
      setNotice('Mês marcado como revisado.');
      load();
    } catch {
      setNotice('Não foi possível marcar o mês como revisado. Tente de novo.');
    } finally {
      setReviewing(null);
    }
  };

  if (state.status === 'loading')
    return (
      <section className="card card-lg" aria-busy="true">
        <span className="sr-only">Consultando o seu progresso</span>
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </section>
    );
  if (state.status === 'error')
    return (
      <section className="card card-lg empty error-state" role="alert">
        <StateArt name="falha-consulta" />
        <h2 className="h-display">Não foi possível consultar o seu progresso</h2>
        <p className="muted">Nada foi alterado. Tente novamente.</p>
        <button type="button" className="btn btn-neutral" onClick={load}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  if (!state.payload.hasProfile)
    return (
      <section className="card card-lg empty">
        <StateArt name="perfil-vazio" />
        <h2 className="h-display">Perfil ainda não configurado</h2>
        <p className="muted">Faça o primeiro acesso para começar. O progresso conta importações, conferências e revisões feitas neste computador.</p>
        <Link className="btn btn-primary" href="/onboarding">
          Fazer o primeiro acesso
        </Link>
      </section>
    );

  const { xp, level, ledger, badges, missions } = state.payload;
  const span = level.nextFloor === null ? 1 : level.nextFloor - level.floor;
  const progress = level.nextFloor === null ? 1 : Math.min(1, (xp - level.floor) / span);
  const unlocked = badges.filter((badge) => badge.unlockedAt).length;

  return (
    <div className="stack-lg">
      <section className="card card-lg" aria-labelledby="titulo-nivel">
        <div className="level-head">
          <div>
            <p className="eyebrow">Nível {level.level}</p>
            <h2 className="h-display" id="titulo-nivel">
              {level.title}
            </h2>
          </div>
          <p className="level-xp">{integer.format(xp)} XP</p>
        </div>
        <div
          className="bar bar-lg"
          role="progressbar"
          aria-label={level.nextFloor === null ? 'Nível máximo alcançado' : `Progresso até o nível ${level.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="small muted">
          {level.nextFloor === null
            ? 'Você chegou ao último nível. O XP continua contando.'
            : `Faltam ${integer.format(level.nextFloor - xp)} XP para ${level.nextTitle}.`}{' '}
          XP vem de hábitos que mantêm seus dados em dia, nunca de gastar ou aportar dinheiro.
        </p>
      </section>

      <section className="card" aria-labelledby="titulo-missoes">
        <div className="card-header">
          <h2 className="h-display" id="titulo-missoes">
            Missões
          </h2>
        </div>
        <p role="status" aria-live="polite" className="small muted">
          {notice ?? ''}
        </p>
        <ul className="mission-list">
          {missions.map((mission) => (
            <li key={mission.id}>
              <div className="row-between">
                <strong>
                  {mission.done && <i className="bi bi-check-circle-fill" style={{ color: 'var(--ok)', marginRight: 6 }} aria-hidden="true" />}
                  {mission.title}
                  {mission.done && <span className="sr-only"> (concluída)</span>}
                </strong>
                <span className="tag">{mission.reward}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {mission.description}
              </p>
              {mission.target > 1 && (
                <div className="bar bar-xs" role="progressbar" aria-label={`${mission.title}: ${mission.current} de ${mission.target}`} aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={mission.current}>
                  <div className="bar-fill" style={{ width: `${(mission.current / mission.target) * 100}%` }} />
                </div>
              )}
              {!mission.done && (
                <div className="row-tight">
                  {mission.href && mission.actionLabel && (
                    <Link className="btn btn-sm btn-neutral" href={mission.href}>
                      {mission.actionLabel}
                    </Link>
                  )}
                  {mission.reviewMonth && (
                    <button type="button" className="btn btn-sm btn-primary" disabled={reviewing !== null} onClick={() => void review(mission.reviewMonth as string)}>
                      {reviewing ? 'Salvando…' : 'Marcar mês como revisado'}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="titulo-conquistas">
        <div className="card-header">
          <h2 className="h-display" id="titulo-conquistas">
            Conquistas
          </h2>
          <span className="small muted">
            {unlocked} de {badges.length}
          </span>
        </div>
        <ul className="badge-grid">
          {badges.map((badge) => (
            <li key={badge.id} data-locked={badge.unlockedAt ? 'false' : 'true'}>
              <i className={`bi ${badge.unlockedAt ? (BADGE_ICON[badge.id] ?? 'bi-award') : 'bi-lock'}`} aria-hidden="true" />
              <strong>{badge.title}</strong>
              <span className="small muted">
                {badge.unlockedAt ? `Conquistada em ${day.format(new Date(badge.unlockedAt))}` : `Bloqueada. ${badge.description}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="titulo-xp">
        <div className="card-header">
          <h2 className="h-display" id="titulo-xp">
            De onde veio o XP
          </h2>
        </div>
        {ledger.length === 0 ? (
          <p className="muted">Nenhum XP ainda. Importe um extrato ou confira um lançamento na conciliação para começar.</p>
        ) : (
          <ul className="ledger-list">
            {ledger.map((entry) => (
              <li key={`${entry.date}-${entry.reason}`}>
                <span>
                  {entry.reason}
                  <br />
                  <span className="small muted">{day.format(new Date(entry.date))}</span>
                </span>
                <span className="num">+{integer.format(entry.xp)} XP</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
