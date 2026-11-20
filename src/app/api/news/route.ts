import { requireActionCode, ok } from '@/server/http';
import { listNews } from '@/server/cloud-news';

/* Lista de notícias econômicas públicas (Etapa 15).

   Lida do Worker pelo backend local, sem enviar dado algum do perfil. A tela
   recebe `status` para distinguir "sem endereço configurado", "sem conexão" e
   lista confirmada; nenhum desses estados afirma algo que não foi consultado. */

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  return ok(await listNews());
}
