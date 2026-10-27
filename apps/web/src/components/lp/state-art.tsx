'use client';

/* Ilustração de estado da LP (docs/ESTADOS_VAZIOS.md). Decorativa, com alt
   vazio, sem arrastar e sem seleção; o CSS de .state-art completa o bloqueio. */

export function StateArt({ name }: { name: 'nao-encontrada' | 'erro-tela' | 'sem-versoes' }) {
  return (
    <img
      className="state-art"
      src={`/estados/${name}.svg`}
      alt=""
      width={200}
      height={200}
      decoding="async"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    />
  );
}
