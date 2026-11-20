import { download } from '@/server/download';
import { buildTransactionsCsv, exportFileName } from '@/server/export/service';
import { guardWithProfile, isDenied } from '@/server/http';

/* Lançamentos em CSV para planilha (Stage 19). Toda célula de texto passa pela
   neutralização de fórmula de `src/server/export/csv.ts` (docs/SECURITY.md,
   item 22). */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return download(await buildTransactionsCsv(guarded.profileId), exportFileName('csv'), 'text/csv; charset=utf-8');
}
