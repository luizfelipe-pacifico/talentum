'use client';

/* Movimento da landing page.
   Tudo aqui verifica prefers-reduced-motion: com movimento reduzido, os
   componentes renderizam o estado final e nenhum listener é registrado. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Icon } from './icon';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return reduced;
}

type RevealProps = {
  children: ReactNode;
  /** Atraso em milissegundos para escalonar itens de uma mesma fileira. */
  delay?: number;
  variant?: 'up' | 'left' | 'right' | 'scale' | 'blur';
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header' | 'figure';
  /** Quando falso, recolhe ao sair da viewport e revela de novo ao voltar. */
  once?: boolean;
};

type RevealPhase = 'static' | 'armed' | 'in';

/** Revela uma vez ao entrar na viewport. Repetir a entrada a cada rolagem
    transforma um gesto de chegada em ruído.

    O HTML do servidor nasce visível (fase `static`). Só depois de hidratar o
    componente arma a animação, e apenas para blocos ainda fora da tela: se o
    JavaScript falhar, nada fica escondido, e o que já está à vista não pisca. */
export function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
  as = 'div',
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<RevealPhase>('static');
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (reduced || !node) return;

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    setPhase('armed');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPhase('in');
            if (once) observer.disconnect();
          } else if (!once) {
            setPhase('armed');
          }
        }
      },
      // Margem simétrica: o bloco só recolhe depois de sair de verdade da tela.
      { rootMargin: '-6% 0px -6% 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, once]);

  const phaseClass = phase === 'armed' ? 'lp-armed' : phase === 'in' ? 'lp-armed lp-in' : '';
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref as never}
      className={`lp-reveal lp-reveal-${variant} ${phaseClass} ${className}`.trim()}
      style={{ '--lp-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Camada de parallax: desloca o conteúdo conforme a posição do bloco na tela. */
export function Parallax({
  children,
  speed = 0.14,
  className = '',
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      // Só calcula quando o bloco está por perto da viewport.
      if (rect.bottom < -400 || rect.top > window.innerHeight + 400) return;
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      // Limite rígido: em viewport muito alta o deslocamento cru jogaria a
      // camada para fora da seção, que é recortada.
      const bruto = center * -speed;
      const limite = 72;
      const deslocamento = Math.max(-limite, Math.min(limite, bruto));
      node.style.setProperty('--lp-shift', `${deslocamento.toFixed(2)}px`);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduced, speed]);

  return (
    <div ref={ref} className={`lp-parallax ${className}`.trim()}>
      {children}
    </div>
  );
}

/** Publica a posição do ponteiro como variáveis CSS para inclinação e foco de luz. */
export function PointerScene({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      node.style.setProperty('--lp-mx', x.toFixed(4));
      node.style.setProperty('--lp-my', y.toFixed(4));
      node.style.setProperty('--lp-tilt-x', ((0.5 - y) * 7).toFixed(2));
      node.style.setProperty('--lp-tilt-y', ((x - 0.5) * 9).toFixed(2));
      node.style.setProperty('--lp-drift-x', ((x - 0.5) * 18).toFixed(2));
      node.style.setProperty('--lp-drift-y', ((y - 0.5) * 12).toFixed(2));
    },
    [reduced],
  );

  const reset = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    for (const [property, value] of [
      ['--lp-mx', '0.5'],
      ['--lp-my', '0.5'],
      ['--lp-tilt-x', '0'],
      ['--lp-tilt-y', '0'],
      ['--lp-drift-x', '0'],
      ['--lp-drift-y', '0'],
    ]) {
      node.style.setProperty(property, value);
    }
  }, []);

  return (
    <div ref={ref} className={`lp-pointer ${className}`.trim()} onPointerMove={onPointerMove} onPointerLeave={reset}>
      {children}
    </div>
  );
}

/** Barra de leitura: quanto da página já foi percorrido. */
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = ref.current;
      if (!node) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      node.style.setProperty('--lp-progress', Math.min(1, Math.max(0, ratio)).toFixed(4));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="lp-progress" aria-hidden="true" />;
}

/** Navegação com marcação da seção em leitura.

    No desktop é uma lista em linha. Abaixo de 1000px vira um menu recolhível
    em `<details>`: seis links em duas linhas fixas ocupavam um quinto da tela
    do celular. O menu abre e fecha sem JavaScript; o script só o fecha depois
    que um link é escolhido. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  // Nenhum item ativo no herói: ele não está na lista.
  const [ativo, setAtivo] = useState('');
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const alvos = ['topo', ...items.map((item) => item.id)]
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!alvos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Vence a seção visível mais próxima do topo da janela.
        const visiveis = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visiveis[0]?.target.id;
        if (id) setAtivo(id === 'topo' ? '' : id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    for (const alvo of alvos) observer.observe(alvo);
    return () => observer.disconnect();
  }, [items]);

  const fecharMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  const links = (aoEscolher?: () => void) =>
    items.map((item) => (
      <li key={item.id}>
        <a href={`#${item.id}`} aria-current={ativo === item.id ? 'true' : undefined} onClick={aoEscolher}>
          {item.label}
        </a>
      </li>
    ));

  return (
    <>
      <ul className="lp-nav">{links()}</ul>
      <details className="lp-nav-menu" ref={menuRef}>
        <summary>
          <Icon name="bi-list" />
          Seções
        </summary>
        <ul className="lp-nav-menu-list">{links(fecharMenu)}</ul>
      </details>
    </>
  );
}

/** Atalho de retorno ao topo, visível depois da primeira dobra. */
export function BackToTop() {
  const [visivel, setVisivel] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisivel(window.scrollY > window.innerHeight * 0.9);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <button
      type="button"
      className={`lp-to-top ${visivel ? 'lp-to-top-on' : ''}`.trim()}
      onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })}
      aria-label="Voltar ao topo da página"
      tabIndex={visivel ? 0 : -1}
      aria-hidden={!visivel}
    >
      <Icon name="bi-arrow-up" />
    </button>
  );
}
