/* Data de publicação por extenso, com hora (UX writing, regra 6): o ano só
   aparece quando não é o ano corrente. Notícia nunca usa data relativa. */
export function formatPublished(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${day}, ${time}`;
}
