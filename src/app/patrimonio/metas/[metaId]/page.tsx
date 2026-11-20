import { GoalDetailPage } from '@/components/goals';

export default async function Page({ params }: { params: Promise<{ metaId: string }> }) {
  const { metaId } = await params;
  return <GoalDetailPage goalId={metaId} />;
}
