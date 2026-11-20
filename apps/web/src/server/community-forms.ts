/* Regras puras dos formulários da comunidade e da conta na LP.

   Sem import do Next nem do Node: roda nas rotas do BFF, nas páginas e nos
   testes (`tests/regression/web-community-bff.test.mjs`). Nada aqui autoriza
   coisa alguma; quem decide autoria, moderação e limites é o Worker. Este
   módulo só impede que um valor da URL ou do formulário vire outro caminho do
   Worker e traduz códigos de erro em avisos legíveis. */

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{8,64}$/;

/** ID opaco aceito em caminho do Worker. Recusa `..`, barras, vazio e excesso. */
export function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID.test(value);
}

/** Chave de idempotência gerada pela página ao desenhar o formulário. */
export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value);
}

/** Limites espelhados do Worker, para o navegador recusar antes do envio. */
export const LIMITS = {
  title: { min: 5, max: 120 },
  body: { min: 10, max: 4000 },
  comment: { min: 1, max: 2000 },
  reason: { min: 5, max: 500 },
  publicName: { min: 2, max: 40 },
} as const;

export type NoticeTone = 'ok' | 'warn';
export type Notice = { tone: NoticeTone; text: string };

/** Avisos mostrados depois de um envio. A chave viaja em `?aviso=`. */
export const NOTICES = {
  publicada: { tone: 'ok', text: 'Sugestão publicada.' },
  editada: { tone: 'ok', text: 'Alteração salva.' },
  excluida: { tone: 'ok', text: 'Sugestão excluída. Ela aparece como removida para quem já a acompanhava.' },
  comentada: { tone: 'ok', text: 'Comentário publicado.' },
  'comentario-excluido': { tone: 'ok', text: 'Comentário excluído.' },
  denunciada: { tone: 'ok', text: 'Denúncia recebida. A moderação vai analisar o conteúdo.' },
  moderada: { tone: 'ok', text: 'Decisão de moderação registrada.' },
  nome: { tone: 'ok', text: 'Nome público atualizado.' },
  'sessao-encerrada': { tone: 'ok', text: 'Sessão encerrada. Aquele navegador vai precisar entrar de novo.' },
  desafio: {
    tone: 'warn',
    text: 'Não foi possível confirmar que o envio veio de uma pessoa. Conclua a verificação e envie de novo.',
  },
  limite: { tone: 'warn', text: 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.' },
  sessao: { tone: 'warn', text: 'Sua sessão terminou. Entre de novo para continuar.' },
  titulo: { tone: 'warn', text: 'O título precisa ter entre 5 e 120 caracteres.' },
  texto: { tone: 'warn', text: 'O texto está fora do tamanho aceito. Revise e envie de novo.' },
  motivo: { tone: 'warn', text: 'Descreva o motivo da denúncia em 5 a 500 caracteres.' },
  'nome-invalido': { tone: 'warn', text: 'O nome público precisa ter entre 2 e 40 caracteres.' },
  confirmacao: { tone: 'warn', text: 'Digite EXCLUIR, em letras maiúsculas, para confirmar a exclusão da conta.' },
  bloqueada: { tone: 'warn', text: 'Esta sugestão está encerrada ou oculta e não aceita mudanças.' },
  permissao: { tone: 'warn', text: 'Sua conta não tem permissão para esta ação.' },
  repetido: { tone: 'warn', text: 'Este formulário já foi enviado com outro conteúdo. Recarregue a página e envie de novo.' },
  'nao-encontrado': { tone: 'warn', text: 'O conteúdo não existe mais ou foi removido.' },
  'mfa-ativa': { tone: 'ok', text: 'Verificação em duas etapas ativada. A partir de agora, cada entrada pede um código do app.' },
  'mfa-desativada': { tone: 'ok', text: 'Verificação em duas etapas desativada. A entrada volta a pedir só a conta Google.' },
  'mfa-ja-ativa': { tone: 'warn', text: 'A verificação em duas etapas já está ativa nesta conta.' },
  'mfa-expirada': { tone: 'warn', text: 'A configuração do app autenticador expirou. Comece de novo em Ativar app autenticador.' },
  'codigo-invalido': { tone: 'warn', text: 'O código não confere. Use o código de 6 dígitos que o app mostra agora.' },
  'mfa-bloqueada': { tone: 'warn', text: 'Muitos códigos errados. Aguarde 15 minutos e tente de novo.' },
  'codigos-novos': { tone: 'ok', text: 'Novos códigos de recuperação gerados. Os anteriores deixaram de valer.' },
  indisponivel: { tone: 'warn', text: 'O serviço da comunidade não respondeu. Nada foi alterado. Tente de novo em alguns minutos.' },
  erro: { tone: 'warn', text: 'O envio não pôde ser concluído. Nada foi alterado. Tente de novo.' },
} as const satisfies Record<string, Notice>;

export type NoticeKey = keyof typeof NOTICES;

export function isNoticeKey(value: unknown): value is NoticeKey {
  return typeof value === 'string' && Object.hasOwn(NOTICES, value);
}

/** Aviso a partir do parâmetro da URL; valores desconhecidos não mostram nada. */
export function noticeFrom(value: unknown): Notice | null {
  const first = Array.isArray(value) ? value[0] : value;
  return isNoticeKey(first) ? NOTICES[first] : null;
}

/** Traduz o código estável do Worker para a chave de aviso; nunca expõe o código. */
export function noticeForWorkerError(code: string | null, status: number): NoticeKey {
  switch (code) {
    case 'CHALLENGE_FAILED':
    case 'CHALLENGE_UNAVAILABLE':
      return 'desafio';
    case 'RATE_LIMITED':
      return 'limite';
    case 'AUTH_REQUIRED':
      return 'sessao';
    case 'INVALID_TITLE':
      return 'titulo';
    case 'INVALID_BODY':
      return 'texto';
    case 'INVALID_REASON':
      return 'motivo';
    case 'INVALID_PUBLIC_NAME':
      return 'nome-invalido';
    case 'CONFIRMATION_REQUIRED':
      return 'confirmacao';
    case 'POST_LOCKED':
      return 'bloqueada';
    case 'FORBIDDEN':
      return 'permissao';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'repetido';
    case 'POST_NOT_FOUND':
    case 'COMMENT_NOT_FOUND':
    case 'REPORT_NOT_FOUND':
    case 'SESSION_NOT_FOUND':
    case 'PROFILE_NOT_FOUND':
      return 'nao-encontrado';
    case 'MFA_ALREADY_ACTIVE':
      return 'mfa-ja-ativa';
    case 'MFA_NOT_PENDING':
    case 'NOTHING_TO_REVEAL':
      return 'mfa-expirada';
    case 'INVALID_MFA_CODE':
      return 'codigo-invalido';
    case 'MFA_LOCKED':
      return 'mfa-bloqueada';
    case 'WORKER_UNAVAILABLE':
    case 'WORKER_NOT_CONFIGURED':
      return 'indisponivel';
    default:
      if (status === 429) return 'limite';
      if (status === 401) return 'sessao';
      if (status >= 500) return 'indisponivel';
      return 'erro';
  }
}

/** Código de 6 dígitos do app autenticador. Espaços digitados são ignorados. */
export function normalizeTotpCode(value: string | null): string | null {
  const compact = value?.replace(/\s+/g, '') ?? '';
  return /^\d{6}$/.test(compact) ? compact : null;
}

/** Código de recuperação no formato `ABCD-1234`; aceita minúsculas e sem hífen. */
export function normalizeRecoveryCode(value: string | null): string | null {
  const compact = value?.replace(/[\s-]+/g, '').toUpperCase() ?? '';
  return /^[A-Z0-9]{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}

/** Segredo base32 em grupos de 4, para digitar à mão no app. */
export function groupSecret(secret: string): string {
  return (secret.replace(/\s+/g, '').match(/.{1,4}/g) ?? []).join(' ');
}

/** Ações de moderação aceitas pelo Worker. */
export const MODERATION_ACTIONS = ['HIDE', 'RESTORE', 'CLOSE', 'REOPEN', 'DISMISS'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

const LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});
const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** `2026-11-20` ou ISO completo para "20 de novembro de 2026". Inválido vira texto vazio. */
export function formatLongDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? '' : LONG_DATE.format(date);
}

/** "novembro de 2026", para "membro desde". */
export function formatMonthYear(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : MONTH_YEAR.format(date);
}

/** Plural com numeral: `plural(1, 'voto', 'votos')` -> "1 voto". */
export function plural(total: number, one: string, many: string): string {
  return `${total} ${total === 1 ? one : many}`;
}
