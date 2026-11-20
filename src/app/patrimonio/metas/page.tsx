import { Suspense } from 'react';
import { GoalsPage } from '@/components/goals';

/* `GoalsPage` lê `?sobra=` (valor vindo da revisão mensal do orçamento). */
export default function Page() {
  return (
    <Suspense>
      <GoalsPage />
    </Suspense>
  );
}
