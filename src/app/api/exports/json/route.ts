import { download } from '@/server/download';
import { buildJsonExport, exportFileName } from '@/server/export/service';
import { guardWithProfile, isDenied } from '@/server/http';

/* Exportação completa em JSON (Stage 19). Formato documentado em
   docs/DATABASE.md, "Export format". O arquivo é gerado na hora e entregue
   como anexo; nada fica gravado no servidor. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return download(await buildJsonExport(guarded.profileId), exportFileName('json'), 'application/json; charset=utf-8');
}
