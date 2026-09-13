import { Suspense } from 'react';
import { StatementsPage } from '@/components/statements';

/* `StatementsPage` lê `?conta=` com `useSearchParams`, que exige fronteira de
   Suspense para a renderização estática do App Router. */
export default function Page() {
  return (
    <Suspense fallback={<section className="card" aria-busy="true"><span className="skeleton skeleton-line" /></section>}>
      <StatementsPage />
    </Suspense>
  );
}
