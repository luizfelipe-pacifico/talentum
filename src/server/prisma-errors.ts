/* Classificação dos erros conhecidos do Prisma.

   Duas falhas de escrita são esperadas numa API com checagem prévia: a
   restrição única que a outra requisição acabou de ocupar (P2002) e a linha que
   sumiu entre a leitura e a escrita (P2025). Elas não são falha do servidor;
   viram `409` e `404` no formato único de erro (docs/ARCHITECTURE.md, §5).

   Puro e sem importar o cliente do Prisma, para o teste do Node carregar este
   arquivo direto. Reconhece o erro pelo nome da classe e pelo código, que é o
   que o cliente gerado expõe; um objeto qualquer com `code` não basta. */

export type PrismaErrorKind = 'conflict' | 'not_found';

export function prismaErrorKind(error: unknown): PrismaErrorKind | null {
  if (!(error instanceof Error) || error.name !== 'PrismaClientKnownRequestError') return null;
  const code = (error as Error & { code?: unknown }).code;
  if (code === 'P2002') return 'conflict';
  if (code === 'P2025') return 'not_found';
  return null;
}
