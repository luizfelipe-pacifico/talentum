'use client';

/* Ajudantes de formulário das páginas internas da LP. Os formulários funcionam
   sem JavaScript; estes componentes só melhoram o caminho quando ele existe. */

import { useEffect, useRef, useState } from 'react';
import { TurnstileWidget } from './turnstile-widget';

/** Envia o formulário que o contém assim que a página hidrata (retomada de sessão). */
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    marker.current?.closest('form')?.requestSubmit();
  }, []);
  return <span ref={marker} hidden />;
}

/**
 * Desafio do Turnstile que só aparece quando o formulário fica visível.
 *
 * Responder, denunciar e editar ficam em `<details>` fechados; desenhar um
 * desafio para cada um carregaria vários iframes sem uso. O widget nasce quando
 * o bloco é aberto.
 */
export function FormChallenge({ siteKey, action }: { siteKey: string | null; action: 'login' | 'community' }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const details = marker.current?.closest('details');
    if (!details) {
      setVisible(true);
      return;
    }
    const update = () => setVisible(details.open);
    update();
    details.addEventListener('toggle', update);
    return () => details.removeEventListener('toggle', update);
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      {visible ? <TurnstileWidget siteKey={siteKey} action={action} /> : null}
    </>
  );
}

/** Desativa o botão depois do primeiro envio, contra clique duplo. A chave de idempotência cobre o resto. */
export function SubmitButton({ children, className = 'lp-btn lp-btn-primary', pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    const onSubmit = () => setPending(true);
    // Voltar pelo histórico restaura a página do cache: o botão precisa reabrir.
    const onShow = () => setPending(false);
    form.addEventListener('submit', onSubmit);
    window.addEventListener('pageshow', onShow);
    return () => {
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  return (
    <button ref={button} type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      {pending ? pendingLabel : children}
    </button>
  );
}
