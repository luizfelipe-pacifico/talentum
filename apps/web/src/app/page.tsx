/* Import relativo de propósito: o mesmo arquivo é compilado pelo app da Vercel
   e pela ponte de pré-visualização em /lp, que resolve "@/" para outra raiz. */
import { AuthNotice, isAuthNoticeKind } from '../components/lp/auth-notice';
import { LandingPage } from '../components/lp/landing-page';

export default async function Page({ searchParams }: { searchParams: Promise<{ auth?: string | string[] }> }) {
  const { auth } = await searchParams;
  return <LandingPage notice={isAuthNoticeKind(auth) ? <AuthNotice kind={auth} /> : null} />;
}
