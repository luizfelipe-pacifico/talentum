import { ICONES } from './icons';

/* Ícone do Bootstrap Icons em SVG inline.

   O invólucro continua sendo `<i class="bi">`, para que as regras de tamanho
   e cor da folha da LP sigam valendo: o SVG mede 1em e pinta com a cor do
   texto. O conteúdo vem do pacote oficial, gerado por
   scripts/gerar-icones-lp.mjs, e é sempre decorativo. */
export function Icon({ name }: { name: string }) {
  return (
    <i className="bi" aria-hidden="true">
      <svg
        viewBox="0 0 16 16"
        width="1em"
        height="1em"
        fill="currentColor"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: ICONES[name] ?? '' }}
      />
    </i>
  );
}
