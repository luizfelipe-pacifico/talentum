'use client';

import Link from 'next/link';
import { StateArt } from '@/components/state-art';

/* Falha ao renderizar uma tela. A mensagem técnica fica fora da interface
   (CLAUDE.md): a pessoa vê o que aconteceu e como seguir. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="card card-lg empty error-state" role="alert" aria-labelledby="erro-tela">
      <StateArt name="erro-tela" size="lg" />
      <h2 id="erro-tela" className="h-display">Esta tela não pôde ser exibida</h2>
      <p className="muted">
        Algo falhou ao montar a página. Seus dados locais não foram alterados. Tente de novo ou volte ao Início.
      </p>
      <div className="row-tight" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Tentar novamente
        </button>
        <Link className="btn btn-neutral" href="/">Voltar ao Início</Link>
      </div>
    </section>
  );
}
