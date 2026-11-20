'use client';

/* Desafio do Cloudflare Turnstile dentro de um formulário.

   O widget grava o token no campo `cf-turnstile-response` do formulário que o
   contém; quem valida é o Worker, chamando o Siteverify com a chave secreta
   (docs/SECURITY.md, Turnstile). Este componente só desenha o desafio.

   O script vem de challenges.cloudflare.com e é inserido por este componente,
   que já roda com o nonce da página: a CSP com 'strict-dynamic' autoriza scripts
   inseridos por código confiável, e o middleware libera o iframe do desafio
   (`frame-src`). Sem chave de site configurada nada é desenhado, e o Worker
   decide se o formulário pode seguir sem desafio (somente fora de produção). */

import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function TurnstileWidget({ siteKey, action }: { siteKey: string | null; action: 'login' | 'community' }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let widgetId: string | null = null;
    let active = true;
    loadTurnstile()
      .then((api) => {
        if (!active || !container.current) return;
        widgetId = api.render(container.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          language: 'pt-br',
          size: 'flexible',
        });
      })
      .catch(() => {
        // Sem o script, o envio segue sem token e o Worker decide; a página
        // mostra o erro devolvido em vez de travar o formulário.
      });
    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, action]);

  if (!siteKey) return null;
  return <div className="lp-turnstile" ref={container} />;
}
