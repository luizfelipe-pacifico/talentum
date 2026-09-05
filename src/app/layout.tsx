import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { AppStateProvider } from '@/components/app-state';

export const metadata = {
  title: 'Talentum',
  description: 'Piloto automático financeiro local-first.',
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
