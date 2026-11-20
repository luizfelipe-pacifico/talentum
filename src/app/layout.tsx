import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import './globals.css';
import './vault.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { AppStateProvider } from '@/components/app-state';
import { VaultGate } from '@/components/vault-gate';

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

/* O nonce da Content-Security-Policy chega do middleware (src/middleware.ts).
   Ler o cabeçalho torna as páginas dinâmicas, que é o que permite um nonce novo
   a cada requisição; o app é local e não perde nada com isso. */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* O navegador esconde o valor do nonce do DOM depois de aplicá-lo; sem
            suppressHydrationWarning, o React acusaria `nonce=""` como divergência. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppStateProvider>
          {/* Nada do aplicativo é montado antes do desbloqueio do cofre local. */}
          <VaultGate>
            <AppShell>{children}</AppShell>
          </VaultGate>
        </AppStateProvider>
      </body>
    </html>
  );
}
