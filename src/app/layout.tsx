import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import './globals.css';
import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { AppStateProvider } from '@/components/app-state';

export const metadata: Metadata = {
  title: 'Talentum',
  description: 'Piloto automático financeiro local-first.',
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
      <body>
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
