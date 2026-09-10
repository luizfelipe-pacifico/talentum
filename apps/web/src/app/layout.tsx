import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '../styles/base.css';
import '../styles/lp.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Talentum: piloto automático financeiro local-first',
  description:
    'O Talentum lê seus extratos, organiza seus gastos e mostra o saldo que realmente sobra, mantendo os dados financeiros no seu dispositivo.',
  icons: {
    icon: [
      { url: '/marca/talentum-clara-64.webp', type: 'image/webp', media: '(prefers-color-scheme: light)' },
      { url: '/marca/talentum-escura-64.webp', type: 'image/webp', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
