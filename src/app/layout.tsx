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
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/marca/talentum-clara.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/marca/talentum-escura.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

/* Aplica o tema salvo antes da primeira pintura. Sem isso, quem usa o tema
   escuro via um clarão do tema claro até a hidratação. Mesma chave e mesmas
   regras de src/components/app-state.tsx. */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("talentum:tema");if(t==="Escuro"||(t==="Sistema"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
