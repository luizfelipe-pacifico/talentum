'use client';

/* Carrossel de pranchas. Sem avanço automático: quem lê decide o ritmo.
   Navegação por botões, teclado e indicadores, com anúncio para leitor de tela. */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from './motion';

export type Plate = {
  id: string;
  numeral: string;
  title: string;
  caption: string;
  art: ReactNode;
};

export function PlateCarousel({ plates }: { plates: Plate[] }) {
  const [index, setIndex] = useState(0);
  const total = plates.length;

  const go = useCallback(
    (next: number) => setIndex(((next % total) + total) % total),
    [total],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    }
  };

  const current = plates[index];

  return (
    <div
      className="lp-carousel"
      role="group"
      aria-roledescription="carrossel"
      aria-label="Pranchas do Talentum"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="lp-carousel-stage">
        <div className="lp-carousel-track" style={{ transform: `translate3d(${index * -100}%, 0, 0)` }}>
          {plates.map((plate, position) => (
            <figure
              key={plate.id}
              className="lp-plate"
              aria-hidden={position !== index}
              // Slides fora de foco não recebem tabulação nem leitura.
              inert={position !== index}
            >
              <div className="lp-plate-art">{plate.art}</div>
              <figcaption className="lp-plate-caption">
                <span className="lp-plate-numeral">{plate.numeral}</span>
                <h3 className="lp-h-display">{plate.title}</h3>
                <p className="lp-muted">{plate.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="lp-carousel-controls">
        <button type="button" className="lp-round" onClick={() => go(index - 1)} aria-label="Prancha anterior">
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </button>

        <ol className="lp-dots">
          {plates.map((plate, position) => (
            <li key={plate.id}>
              <button
                type="button"
                className={position === index ? 'lp-dot lp-dot-on' : 'lp-dot'}
                aria-label={`Ir para ${plate.numeral}, ${plate.title}`}
                aria-current={position === index}
                onClick={() => go(position)}
              />
            </li>
          ))}
        </ol>

        <button type="button" className="lp-round" onClick={() => go(index + 1)} aria-label="Próxima prancha">
          <i className="bi bi-arrow-right" aria-hidden="true" />
        </button>
      </div>

      <p className="lp-tiny lp-muted lp-carousel-status" aria-live="polite">
        {current.numeral} de {total} · {current.title}
      </p>
    </div>
  );
}

export type Shot = {
  id: string;
  icon: string;
  title: string;
  caption: string;
  src: string;
  alt: string;
};

const INTERVALO = 6000;

/** Carrossel das capturas do sistema. Ele desliza sozinho de lado, com abas
    nomeadas por ícone, e para assim que alguém encosta, foca ou pede pausa.
    Com movimento reduzido, o avanço automático nem começa. */
export function ShotCarousel({ shots }: { shots: Shot[] }) {
  const [index, setIndex] = useState(0);
  const [pausado, setPausado] = useState(false);
  const reduzido = useReducedMotion();
  const total = shots.length;

  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);

  // Com movimento reduzido a troca continua acontecendo, só que sem o
  // deslize: quem pediu menos movimento não quer perder o conteúdo.
  const automatico = !pausado;

  useEffect(() => {
    if (!automatico) return;
    const timer = window.setInterval(() => setIndex((atual) => (atual + 1) % total), INTERVALO);
    return () => window.clearInterval(timer);
  }, [automatico, total]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    }
  };

  return (
    <div
      className="lp-shots-carousel"
      role="group"
      aria-roledescription="carrossel"
      aria-label="Telas do aplicativo"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setPausado(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPausado(false);
      }}
    >
      <div className="lp-shots-tabs" role="tablist" aria-label="Escolher tela">
        {shots.map((shot, position) => (
          <button
            key={shot.id}
            type="button"
            role="tab"
            aria-selected={position === index}
            className={position === index ? 'lp-shots-tab lp-shots-tab-on' : 'lp-shots-tab'}
            onClick={() => go(position)}
          >
            <i className={`bi ${shot.icon}`} aria-hidden="true" />
            {shot.title}
          </button>
        ))}
      </div>

      <div className="lp-shots-meter" aria-hidden="true">
        {automatico && !reduzido && <span key={index} className="lp-shots-meter-fill" />}
      </div>

      <div className="lp-shots-stage">
        <div className="lp-shots-track" style={{ transform: `translate3d(${index * -100}%, 0, 0)` }}>
          {shots.map((shot, position) => (
            <figure
              key={shot.id}
              className={position === index ? 'lp-shot-slide lp-shot-slide-on' : 'lp-shot-slide'}
              aria-hidden={position !== index}
              inert={position !== index}
            >
              <img
                className="lp-lut-suave"
                src={shot.src}
                alt={shot.alt}
                width={1120}
                height={700}
                loading={position === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
              <figcaption>
                <span className="lp-shot-icon" aria-hidden="true">
                  <i className={`bi ${shot.icon}`} />
                </span>
                <span>
                  <h3>{shot.title}</h3>
                  <p>{shot.caption}</p>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="lp-shots-nav">
        <button type="button" className="lp-round" onClick={() => go(index - 1)} aria-label="Tela anterior">
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="lp-round"
          onClick={() => setPausado((atual) => !atual)}
          aria-label={pausado ? 'Retomar a troca automática' : 'Pausar a troca automática'}
        >
          <i className={`bi ${pausado ? 'bi-play-fill' : 'bi-pause-fill'}`} aria-hidden="true" />
        </button>

        {/* Só anuncia quando a troca é decisão de quem lê: no modo automático
            um aviso a cada seis segundos atrapalharia o leitor de tela. */}
        <p className="lp-tiny lp-muted" aria-live={automatico ? 'off' : 'polite'}>
          Tela {index + 1} de {total}: {shots[index].title}
        </p>

        <button type="button" className="lp-round" onClick={() => go(index + 1)} aria-label="Próxima tela">
          <i className="bi bi-arrow-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
