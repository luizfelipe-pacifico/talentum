'use client';

import { useState } from 'react';

type ApiStatus = { status: string; service: string; timestamp: string };

export default function Home() {
  const [result, setResult] = useState<ApiStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function verifyApi() {
    setLoading(true);
    setError('');

    try {
      const challengeResponse = await fetch('/api/action-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'GET', path: '/api/system/status' }),
      });
      if (!challengeResponse.ok) throw new Error('Não foi possível autorizar a verificação.');

      const { actionCode } = (await challengeResponse.json()) as { actionCode: string };
      const statusResponse = await fetch('/api/system/status', {
        headers: { 'X-Action-Code': actionCode },
        cache: 'no-store',
      });
      if (!statusResponse.ok) throw new Error('A API local não respondeu corretamente.');

      setResult((await statusResponse.json()) as ApiStatus);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Falha inesperada.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="panel" aria-labelledby="title">
        <i className="bi bi-bank2 brand-icon" aria-hidden="true" />
        <p className="eyebrow">Pré-alpha</p>
        <h1 id="title">Talentum</h1>
        <p>Base local do Next.js full-stack conectada ao Electron.</p>
        <button type="button" onClick={verifyApi} disabled={loading}>
          <i className="bi bi-shield-check" aria-hidden="true" />
          {loading ? 'Verificando…' : 'Verificar API REST'}
        </button>
        <div className="result" aria-live="polite">
          {result && `API ${result.status} — ${result.service}`}
          {error && <span className="error">{error}</span>}
        </div>
      </section>
    </main>
  );
}
