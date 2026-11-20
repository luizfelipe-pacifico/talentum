import { ImportBatchPage } from '@/components/import-batch';

export default async function Page({ params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;
  return <ImportBatchPage importBatchId={loteId} />;
}
