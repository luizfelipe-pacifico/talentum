'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, callApi, getJson, postJson } from '@/lib/api-client';

/* Regras de categorização (Feature 6 de docs/PRODUCT.md).

   Uma regra liga o início, o texto inteiro ou um trecho da descrição do
   lançamento a uma categoria. "Igual a" e "Começa com" são aplicadas na hora,
   em cada importação; "Contém" vira sugestão na conciliação, porque um trecho
   pode aparecer em estabelecimentos diferentes. Nenhuma regra muda uma
   categoria escolhida à mão. */

type Rule = { id: string; categoryId: string; pattern: string; matchType: 'contains' | 'startsWith' | 'exact'; priority: number; category: { name: string } };
type Category = { id: string; name: string; kind: string };

const MATCH_LABEL: Record<Rule['matchType'], string> = { startsWith: 'Começa com', exact: 'É igual a', contains: 'Contém (vira sugestão)' };
const message = (cause: unknown) => (cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : 'Não foi possível concluir a operação. Nada foi alterado.');

export function MerchantRulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<Rule['matchType']>('startsWith');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ruleList, categoryList] = await Promise.all([
        getJson<{ rules?: Rule[] }>('/api/merchant-rules'),
        getJson<{ categories?: Category[] }>('/api/categories'),
      ]);
      setRules(ruleList.rules ?? []);
      setCategories((categoryList.categories ?? []).filter((category) => category.kind !== 'transfer'));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await postJson('/api/merchant-rules', { categoryId, pattern: pattern.trim(), matchType });
      setPattern('');
      await load();
      setNotice('Regra salva. Ela vale para as próximas importações.');
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await postJson<{ applied: number; suggested: number; conflicts: number }>('/api/merchant-rules/apply', {});
      const parts = [
        `${result.applied} ${result.applied === 1 ? 'lançamento recebeu' : 'lançamentos receberam'} categoria`,
        `${result.suggested} ${result.suggested === 1 ? 'ficou' : 'ficaram'} como sugestão na conciliação`,
      ];
      if (result.conflicts > 0) parts.push(`${result.conflicts} com regras em conflito`);
      setNotice(`${parts.join(', ')}.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(rule: Rule) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await callApi('DELETE', `/api/merchant-rules/${rule.id}`);
      await load();
      setNotice(`A regra “${rule.pattern}” foi desativada. As categorias que ela já aplicou continuam como estão.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <section className="card" aria-busy="true"><p className="muted">Consultando as regras de categorização…</p></section>;
  if (status === 'error') return <section className="card error-state" role="alert"><h2 className="h-display">Regras indisponíveis</h2><p className="muted">Não foi possível consultar as regras. Nada foi alterado.</p><button type="button" className="btn btn-neutral" onClick={() => { setStatus('loading'); void load(); }}>Tentar novamente</button></section>;

  return (
    <section className="card card-lg stack">
      <div>
        <h2 className="h-display">Regras de categorização</h2>
        <p className="muted">Quando a descrição de um lançamento importado combina com uma regra, ele recebe a categoria da regra. Categorias escolhidas à mão nunca mudam.</p>
      </div>
      {error && <p className="callout callout-err small" role="alert">{error}</p>}
      {notice && <p className="callout callout-ok small" role="status">{notice}</p>}
      {categories.length === 0 ? (
        <p className="muted">Crie uma categoria acima para poder criar regras.</p>
      ) : (
        <form className="stack-sm" onSubmit={create}>
          <div className="grid grid-260">
            <label className="field">Descrição do lançamento<select value={matchType} onChange={(event) => setMatchType(event.target.value as Rule['matchType'])}>{(Object.keys(MATCH_LABEL) as Rule['matchType'][]).map((key) => <option key={key} value={key}>{MATCH_LABEL[key]}</option>)}</select></label>
            <label className="field">Texto<input required minLength={2} maxLength={120} value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="Ex.: mercado sintético" /></label>
            <label className="field">Categoria<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
          <div className="row-tight"><button type="submit" disabled={busy} className="btn btn-primary">Salvar regra</button></div>
        </form>
      )}
      {rules.length === 0 ? (
        <p className="muted">Nenhuma regra ativa. Você também pode criar uma regra ao escolher a categoria de um lançamento na conciliação.</p>
      ) : (
        <>
          <ul className="entity-list">
            {rules.map((rule) => (
              <li key={rule.id}>
                <span><strong>{rule.pattern}</strong><small className="muted">{MATCH_LABEL[rule.matchType]} · {rule.category.name}</small></span>
                <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => deactivate(rule)}>Desativar regra</button>
              </li>
            ))}
          </ul>
          <div className="row-tight"><button type="button" disabled={busy} className="btn btn-neutral" onClick={apply}>Aplicar regras aos lançamentos pendentes</button></div>
        </>
      )}
    </section>
  );
}
