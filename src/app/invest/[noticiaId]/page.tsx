import { NewsArticle } from '@/components/invest/news-article';

export default async function Page({ params }: { params: Promise<{ noticiaId: string }> }) {
  const { noticiaId } = await params;
  return <NewsArticle newsId={noticiaId} />;
}
