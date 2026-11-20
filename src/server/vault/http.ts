/* Respostas das rotas do cofre: mensagens públicas e cookie de sessão.

   As mensagens não dizem qual fator falhou (senha, código do autenticador ou
   código de recuperação) e nunca citam caminho, arquivo ou detalhe interno. */

import { NextResponse } from 'next/server';
import { passwordProblemMessage } from '@/lib/password-policy';
import { fail, NO_STORE } from '@/server/http';
import { MigrationError } from './migrations.ts';
import { VaultError } from './service.ts';
import { sessionCookie } from './session.ts';

const MESSAGES: Record<VaultError['code'], { status: number; message: string }> = {
  VAULT_NOT_SET_UP: { status: 409, message: 'Crie a senha do Talentum antes de continuar.' },
  VAULT_ALREADY_SET_UP: { status: 409, message: 'A senha do Talentum já foi criada neste computador.' },
  VAULT_LOCKED: { status: 401, message: 'O Talentum está bloqueado. Desbloqueie para continuar.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Os dados informados não conferem. Confira e tente de novo.' },
  UNLOCK_THROTTLED: { status: 429, message: 'Muitas tentativas erradas. Aguarde para tentar de novo.' },
  WEAK_PASSWORD: { status: 400, message: 'Escolha uma senha mais forte.' },
  TOTP_NOT_PENDING: { status: 409, message: 'O cadastro do autenticador expirou. Comece de novo.' },
  TOTP_ALREADY_ENABLED: { status: 409, message: 'O autenticador já está ativo.' },
  TOTP_NOT_ENABLED: { status: 409, message: 'O autenticador não está ativo.' },
  INVALID_TOTP: { status: 400, message: 'O código não confere. Digite o código que aparece agora no aplicativo autenticador.' },
};

export function vaultFailure(error: unknown): NextResponse {
  if (error instanceof VaultError) {
    const entry = MESSAGES[error.code];
    const message = error.code === 'WEAK_PASSWORD' && error.passwordProblem ? passwordProblemMessage(error.passwordProblem) : entry.message;
    if (!error.retryAfterSeconds) return fail(error.code, message, entry.status);
    // O corpo também leva o prazo, para a tela mostrar a contagem sem ler cabeçalho.
    return NextResponse.json(
      { error: { code: error.code, message, retryAfterSeconds: error.retryAfterSeconds } },
      { status: entry.status, headers: { ...NO_STORE, 'Retry-After': String(error.retryAfterSeconds) } },
    );
  }
  if (error instanceof MigrationError) {
    return fail('VAULT_DATABASE_UNAVAILABLE', 'Não foi possível preparar os dados deste computador. Nada foi apagado. Reinicie o Talentum e tente de novo.', 500);
  }
  return fail('VAULT_UNAVAILABLE', 'Não foi possível concluir. Nada foi alterado. Tente de novo.', 500);
}

export function setSession(response: NextResponse, request: Request, token: string | null): NextResponse {
  response.headers.append('Set-Cookie', sessionCookie(request, token));
  return response;
}
