import { isArtifactUrl } from '../../../../../server/auth-flow';
import { cloud } from '../../../../../server/cloudflare';
import { NextResponse } from 'next/server';
import { bffError, formText, redirectNoStore } from '../../../../../server/http';
import { sameOrigin } from '../../../../../server/site-url';

/* Download autorizado (docs/SECURITY.md, Open items, item 8).

   O BFF cria a concessão e a resgata em seguida, na mesma requisição: o Worker
   valida a concessão (uso único, 2 minutos, da própria pessoa) antes de revelar
   o endereço, e o valor da concessão nunca chega ao navegador. O destino final
   ainda passa por uma lista fixa de hosts do GitHub. */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(request: Request, ctx: { params: Promise<{ releaseId: string }> }) {
  if (!sameOrigin(request.headers)) return bffError('forbidden', 403);
  const { releaseId } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const artifactId = formText(form, 'artifactId');
  if (!artifactId || !ID.test(artifactId) || !ID.test(releaseId)) return NextResponse.json({ error: 'invalid_artifact' }, { status:400, headers: { 'Cache-Control': 'no-store' } });
  const created = await cloud(
    `/api/releases/${encodeURIComponent(releaseId)}/download-grants`,
    { method: 'POST', body: JSON.stringify({ artifactId }) },
    true,
  );
  if (!created.ok) return bffError('download_unavailable', created.status);
  const { grant } = (await created.json()) as { grant?: string };
  if (!grant) return bffError('download_unavailable', 502);
  const redeemed = await cloud('/api/download-grants/redeem', { method: 'POST', body: JSON.stringify({ grant }) }, true);
  if (!redeemed.ok) return bffError('download_unavailable', redeemed.status);
  const { downloadUrl } = (await redeemed.json()) as { downloadUrl?: unknown };
  if (!isArtifactUrl(downloadUrl)) return bffError('download_unavailable', 502);
  return redirectNoStore(downloadUrl, 303);
}
