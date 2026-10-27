import Link from 'next/link';
import { StateArt } from '@/components/state-art';

/* Rota inexistente. Fica dentro do shell, então a navegação continua à mão;
   o cabeçalho vem de NOT_FOUND_META em src/lib/navigation.ts. */
export default function NotFound() {
  return (
    <section className="card card-lg empty" aria-labelledby="nao-encontrada">
      <StateArt name="nao-encontrada" size="lg" />
      <h2 id="nao-encontrada" className="h-display">Página não encontrada</h2>
      <p className="muted">Este endereço não corresponde a nenhuma área do Talentum. Nenhum dado foi alterado.</p>
      <div className="row-tight" style={{ justifyContent: 'center' }}>
        <Link className="btn btn-primary" href="/">Voltar ao Início</Link>
        <Link className="btn btn-neutral" href="/dashboard">Abrir Dashboard</Link>
      </div>
    </section>
  );
}
