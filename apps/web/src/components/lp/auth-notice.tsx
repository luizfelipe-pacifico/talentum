import { Icon } from './icon';

/* Retorno visível do login. Sem ele, quem cancelava ou encontrava erro voltava
   ao topo da LP sem saber o que tinha acontecido. */

const MESSAGES = {
  erro: { icon: 'bi-exclamation-triangle', text: 'Não foi possível entrar agora. Tente novamente em alguns minutos.' },
  cancelado: { icon: 'bi-info-circle', text: 'O login foi cancelado. Nenhuma conta foi criada.' },
} as const;

export type AuthNoticeKind = keyof typeof MESSAGES;

export const isAuthNoticeKind = (value: unknown): value is AuthNoticeKind =>
  typeof value === 'string' && Object.hasOwn(MESSAGES, value);

export function AuthNotice({ kind }: { kind: AuthNoticeKind }) {
  const message = MESSAGES[kind];
  return (
    <p className="lp-chip lp-chip-warn lp-auth-notice" role="status">
      <Icon name={message.icon} />
      {message.text}
    </p>
  );
}
