/* Ponte temporária de pré-visualização.
   A landing page mora em apps/web e é publicada isolada na Vercel; esta rota
   apenas a renderiza em http://localhost:3000/lp durante o desenvolvimento.
   Remover antes do primeiro deploy: o pacote da Vercel não pode conter o
   sistema desktop, e o desktop não precisa carregar a LP. */

import '../../../apps/web/src/styles/lp.css';
import { LandingPage } from '../../../apps/web/src/components/lp/landing-page';

export const metadata = {
  title: 'Talentum: piloto automático financeiro local-first',
  description:
    'O Talentum lê seus extratos, organiza seus gastos e mostra o saldo que realmente sobra, mantendo os dados financeiros no seu dispositivo.',
};

export default function Page() {
  return <LandingPage />;
}
