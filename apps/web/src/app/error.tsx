'use client';

import { StateArt } from '../components/lp/state-art';

/* Falha ao montar a página. Nenhum detalhe técnico chega à tela (CLAUDE.md). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="lp-root lp-status-page">
      <div className="lp-wrap lp-status" role="alert">
        <StateArt name="erro-tela" />
        <h1 className="lp-h-display-lg">Esta página não pôde ser exibida</h1>
        <p className="lp-lede">Algo falhou do nosso lado. Tente de novo em instantes.</p>
        <div className="lp-cta-row">
          <button type="button" className="lp-btn lp-btn-primary" onClick={() => reset()}>
            Tentar novamente
          </button>
          <a className="lp-btn" href="/">
            Voltar à página inicial
          </a>
        </div>
      </div>
    </main>
  );
}
