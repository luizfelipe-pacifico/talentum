import { Icon } from '../components/lp/icon';
import { StateArt } from '../components/lp/state-art';

/* Endereço inexistente na LP: mesma voz e mesma paleta, um caminho de volta. */
export default function NotFound() {
  return (
    <main className="lp-root lp-status-page">
      <div className="lp-wrap lp-status">
        <StateArt name="nao-encontrada" />
        <h1 className="lp-h-display-lg">Página não encontrada</h1>
        <p className="lp-lede">Este endereço não existe no site do Talentum.</p>
        <a className="lp-btn lp-btn-primary" href="/">
          Voltar à página inicial
          <Icon name="bi-arrow-right" />
        </a>
      </div>
    </main>
  );
}
