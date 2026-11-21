'use client';

/* Filme do produto: 32 segundos com as telas do aplicativo reconstruídas em
   código, a partir de dados fictícios (design/motion/filme-lp). Começa sem som
   quando metade dele entra na tela e pausa quando sai. Com movimento reduzido
   ou economia de dados, nada começa sozinho: fica o quadro de capa e os
   controles. Depois que a pessoa pausa, a rolagem não volta a tocar. */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

export function ProductFilm({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    // A primeira renderização ainda não sabe a preferência; a consulta direta evita um começo indevido.
    const prefersStill = reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!video || prefersStill || connection?.saveData) return;

    let automatic = false;
    let pausedByPerson = false;
    const play = () => {
      if (pausedByPerson || document.hidden) return;
      automatic = true;
      video.play().catch(() => undefined);
    };
    const pause = () => {
      automatic = true;
      video.pause();
    };
    const onPause = () => {
      if (!automatic) pausedByPerson = true;
      automatic = false;
    };
    const onPlay = () => {
      if (!automatic) pausedByPerson = false;
      automatic = false;
    };
    let visible = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) play();
        else if (!video.paused) pause();
      },
      { threshold: 0.5 },
    );
    const onVisibility = () => (document.hidden ? pause() : visible && play());

    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    document.addEventListener('visibilitychange', onVisibility);
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  return (
    <video
      ref={ref}
      className="lp-film-video"
      src={src}
      poster={poster}
      width={1920}
      height={1080}
      muted
      loop
      playsInline
      controls
      preload="none"
      aria-label={label}
    />
  );
}
