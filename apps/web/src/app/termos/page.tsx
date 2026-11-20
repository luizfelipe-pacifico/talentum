import type { Metadata } from 'next';
import { TermsDocument } from '../../components/lp/legal-documents';
import { LegalPage } from '../../components/lp/legal-page';
import { LEGAL_VERSIONS } from '../../server/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso · Talentum',
  description: 'Regras de uso do site, da conta, da comunidade e do aplicativo Talentum.',
  alternates: { canonical: '/termos' },
};

export default function Page() {
  return (
    <LegalPage title="Termos de Uso" version={LEGAL_VERSIONS.terms} other={{ href: '/privacidade', label: 'Política de Privacidade' }}>
      <TermsDocument />
    </LegalPage>
  );
}
