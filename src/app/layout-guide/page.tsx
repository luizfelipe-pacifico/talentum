import { notFound } from 'next/navigation';
import { LayoutGuidePage } from '@/components/layout-guide';

/* Referência interna de design: não faz parte do produto e não é publicada. */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <LayoutGuidePage />;
}
