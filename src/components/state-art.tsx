'use client';

/* Ilustração de estado vazio, de erro ou de ausência (docs/ESTADOS_VAZIOS.md).

   É decoração: o texto ao lado se sustenta sozinho, então a imagem tem
   alt vazio. Não pode ser arrastada nem selecionada como texto; o CSS de
   .state-art completa o bloqueio em todos os navegadores. */

export type StateArtName =
  | 'base-vazia'
  | 'falha-consulta'
  | 'sem-gastos'
  | 'sem-lancamentos'
  | 'sem-cartoes'
  | 'importar-extrato'
  | 'sem-obrigacoes'
  | 'nada-a-conciliar'
  | 'sem-faturas'
  | 'sem-patrimonio'
  | 'sem-metas'
  | 'sem-noticias'
  | 'historico-vazio'
  | 'perfil-vazio'
  | 'sem-notificacoes'
  | 'sem-contas'
  | 'nao-encontrada'
  | 'erro-tela';

/* Uma variante por tema, gerada por scripts/gerar-estados.mjs com o papel na
   cor exata da superfície. O CSS mostra só a do tema ativo, sem esperar
   JavaScript, então não há troca visível ao carregar. */
export function StateArt({ name, size = 'md' }: { name: StateArtName; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <>
      {(['claro', 'escuro'] as const).map((tema) => (
        <img
          key={tema}
          className={`state-art state-art-${size} state-art-${tema}`}
          src={tema === 'claro' ? `/estados/claro/${name}.svg` : `/estados/escuro/${name}.svg`}
          alt=""
          width={160}
          height={160}
          decoding="async"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
      ))}
    </>
  );
}
