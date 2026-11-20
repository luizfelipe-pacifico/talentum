import QRCode from 'qrcode';
import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { startTotpEnrollment } from '@/server/vault/service';

const schema = z.object({ password: z.string().min(1).max(1024) }).strict();

/* Começa o cadastro do autenticador. O QR é gerado aqui, sem serviço externo, e vai como
   matriz de módulos: a tela desenha o SVG, nenhum HTML gerado no servidor é injetado. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha.', 400);
  try {
    const enrollment = await startTotpEnrollment(parsed.data.password);
    const qr = QRCode.create(enrollment.uri, { errorCorrectionLevel: 'M' });
    const cells = Array.from(qr.modules.data, (value) => (value ? '1' : '0')).join('');
    return ok({ secret: enrollment.secret, qr: { size: qr.modules.size, cells } });
  } catch (error) {
    return vaultFailure(error);
  }
}
