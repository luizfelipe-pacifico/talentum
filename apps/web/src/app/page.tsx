import { AuthNotice, isAuthNoticeKind } from '../components/lp/auth-notice';
import { LandingPage } from '../components/lp/landing-page';

export default async function Page({ searchParams }: { searchParams: Promise<{ auth?: string | string[] }> }) {
  const { auth } = await searchParams;
  return <LandingPage notice={isAuthNoticeKind(auth) ? <AuthNotice kind={auth} /> : null} />;
}
