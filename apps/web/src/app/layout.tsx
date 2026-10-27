import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '../styles/base.css';
import '../styles/lp.css';
import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '../site';

const TITLE = 'Talentum: piloto automático financeiro local-first';
const DESCRIPTION =
  'O Talentum lê seus extratos, organiza seus gastos e mostra o saldo que realmente sobra, mantendo os dados financeiros no seu dispositivo.';

/* A LP é pública e indexável. As rotas privadas (/downloads e o BFF) ficam
   fora pelo robots.txt e pelo sitemap, não por esta tag. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Talentum',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: 'Talentum',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/telas/dashboard.webp',
        width: 1120,
        height: 700,
        alt: 'Tela inicial do Talentum, aplicativo de organização financeira local-first',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/telas/dashboard.webp'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/marca/talentum-clara.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/marca/talentum-escura.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#1a110a',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A leitura torna a renderização dinâmica e permite que o Next aplique aos
  // scripts o nonce gerado pelo middleware para esta resposta.
  await headers();
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
