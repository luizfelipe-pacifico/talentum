'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { callApi, getJson, postJson, ApiError } from '@/lib/api-client';

type Step = 'profile' | 'accounts' | 'position' | 'review';
type Payload = {
  hasProfile: boolean;
  onboarding: null | { id: string; status: string; currentStep: Step; version: number; completedAt: string | null; answers: Record<string, unknown> };
};

const routes: Record<Step, string> = {
  profile: '/onboarding/perfil', accounts: '/onboarding/contas', position: '/onboarding/posicao-atual', review: '/onboarding/revisao',
};

export function Onboarding({ step }: { step: Step }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  async function load() {
    setError('');
    try {
      let result = await getJson<Payload>('/api/onboarding');
      if (!result.onboarding) result = await postJson<Payload>('/api/onboarding', {});
      setPayload(result);
      const answers = result.onboarding?.answers ?? {};
      setDisplayName(typeof answers.displayName === 'string' ? answers.displayName : '');
      setCurrency(typeof answers.currency === 'string' ? answers.currency : 'BRL');
      setTimezone(typeof answers.timezone === 'string' ? answers.timezone : timezone);
      setPrivacyAccepted(answers.privacyAccepted === true);
    } catch { setError('Não foi possível carregar o primeiro acesso.'); }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: Step, answers: Record<string, string | boolean | number | null> = {}) {
    if (!payload?.onboarding) return;
    setSaving(true); setError('');
    try {
      const result = await callApi<Payload>('PATCH', `/api/onboarding/${payload.onboarding.id}`, {
        json: { currentStep: next, version: payload.onboarding.version, answers },
      });
      setPayload(result);
      window.location.assign(routes[next]);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : 'Não foi possível salvar esta etapa.');
      setSaving(false);
    }
  }

  async function complete() {
    if (!payload?.onboarding) return;
    setSaving(true); setError('');
    try {
      await postJson(`/api/onboarding/${payload.onboarding.id}/complete`, {});
      window.location.assign('/dashboard');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : 'Não foi possível concluir o primeiro acesso.');
      setSaving(false);
    }
  }

  if (!payload && !error) return <section className="card card-lg" aria-busy="true"><p className="muted">Carregando primeiro acesso…</p></section>;

  return <section className="card card-lg onboarding-card">
    <p className="eyebrow">Primeiro acesso · {(['profile','accounts','position','review'].indexOf(step) + 1)} de 4</p>
    {error && <div className="callout callout-danger" role="alert"><i className="bi bi-exclamation-triangle"/><p>{error}</p></div>}

    {step === 'profile' && <>
      <h2 className="h-display-lg">Seus dados financeiros ficam aqui</h2>
      <p className="muted">Extratos, saldos e respostas são processados no backend local e permanecem neste dispositivo.</p>
      <label className="field">Como prefere ser chamado?<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} placeholder="Opcional"/></label>
      <label className="field">Moeda<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="BRL">Real brasileiro (BRL)</option></select></label>
      <label className="field">Fuso horário<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
      <label className="check-row"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)}/><span>Entendi que os dados financeiros permanecem no dispositivo.</span></label>
      <button className="btn btn-primary" disabled={saving || !privacyAccepted || !timezone} onClick={() => save('accounts', { displayName, currency, timezone, privacyAccepted })}>Salvar e continuar</button>
    </>}

    {step === 'accounts' && <>
      <h2 className="h-display-lg">Instituições e contas</h2>
      <p className="muted">Cadastre as contas que deseja considerar. Você também pode seguir agora e retornar depois.</p>
      <div className="row-tight"><Link className="btn btn-primary" href="/contas/nova">Cadastrar conta</Link><button className="btn btn-neutral" disabled={saving} onClick={() => save('position')}>Continuar</button></div>
    </>}

    {step === 'position' && <>
      <h2 className="h-display-lg">Posição atual</h2>
      <p className="muted">Um extrato pode preencher parte da fotografia sem digitação. Nenhum arquivo é enviado à nuvem.</p>
      <div className="row-tight"><Link className="btn btn-primary" href="/extratos/importar">Importar extrato</Link><button className="btn btn-neutral" disabled={saving} onClick={() => save('review')}>Revisar agora</button></div>
    </>}

    {step === 'review' && <>
      <h2 className="h-display-lg">Revise sua base</h2>
      <p className="muted">Você pode concluir mesmo sem contas; nesse caso, o Dashboard continuará no estado vazio e não inventará valores.</p>
      <dl className="review-list"><div><dt>Moeda</dt><dd>{currency}</dd></div><div><dt>Fuso</dt><dd>{timezone}</dd></div><div><dt>Privacidade</dt><dd>{privacyAccepted ? 'Confirmada' : 'Pendente'}</dd></div></dl>
      <div className="row-tight"><Link className="btn btn-neutral" href="/onboarding/perfil">Corrigir</Link><button className="btn btn-primary" disabled={saving || !privacyAccepted} onClick={complete}>Concluir primeiro acesso</button></div>
    </>}
  </section>;
}
