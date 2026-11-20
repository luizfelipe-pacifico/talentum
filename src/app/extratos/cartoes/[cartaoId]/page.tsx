import { CardDetailPage } from '@/components/card-detail';

export default async function Page({ params }: { params: Promise<{ cartaoId: string }> }) {
  const { cartaoId } = await params;
  return <CardDetailPage cardId={cartaoId} />;
}
