/* Import relativo de propósito: o mesmo arquivo é compilado pelo app da Vercel
   e pela ponte de pré-visualização em /lp, que resolve "@/" para outra raiz. */
import { LandingPage } from '../components/lp/landing-page';

export default function Page() {
  return <LandingPage />;
}
