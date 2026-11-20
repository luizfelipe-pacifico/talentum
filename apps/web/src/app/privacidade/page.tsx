import type { Metadata } from 'next';
import { PrivacyDocument } from '../../components/lp/legal-documents';
import { LegalPage } from '../../components/lp/legal-page';
import { LEGAL_VERSIONS } from '../../server/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade · Talentum',
  description: 'O que a conta Talentum guarda na nuvem, por quanto tempo, e o que nunca sai do seu dispositivo.',
  alternates: { canonical: '/privacidade' },
};

export default function Page() {
  return (
    <LegalPage title="Política de Privacidade" version={LEGAL_VERSIONS.privacy} other={{ href: '/termos', label: 'Termos de Uso' }}>
      <PrivacyDocument />
    </LegalPage>
  );
}
