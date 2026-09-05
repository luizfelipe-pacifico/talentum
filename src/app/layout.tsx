import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';

export const metadata = {
  title: 'Talentum',
  description: 'Piloto automático financeiro local-first.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
