/* Pranchas do Talentum: gravuras originais em SVG.
   Nada aqui vem de banco de imagens: são desenhos vetoriais próprios, em
   currentColor, para responderem ao tema claro e escuro sem segundo arquivo. */

type ArtProps = { className?: string };

/** Filtros compartilhados: grão de papel, vinheta e o LUT de imagem do projeto. */
export function ArtDefs() {
  return (
    <svg className="lp-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="lp-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.42" intercept="0" />
          </feComponentTransfer>
        </filter>

        <filter id="lp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* LUT Talentum · Arquivo: mesma curva do arquivo .cube distribuído no ateliê. */}
        <filter id="lut-talentum" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.86 0.13 0.03 0 0.021
                    0.06 0.83 0.08 0 0.014
                    0.03 0.10 0.79 0 0.006
                    0    0    0    1 0"
          />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.02" exponent="0.94" offset="0.012" />
            <feFuncG type="gamma" amplitude="1" exponent="0.98" offset="0.008" />
            <feFuncB type="gamma" amplitude="0.97" exponent="1.06" offset="0.004" />
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="0.88" />
        </filter>

        <pattern id="lp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        </pattern>

        <pattern id="lp-hatch-dense" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)">
          <line x1="0" y1="0" x2="0" y2="3.4" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
        </pattern>

        <radialGradient id="lp-halo" cx="50%" cy="46%" r="52%">
          <stop offset="0%" stopColor="var(--lp-amber)" stopOpacity="0.28" />
          <stop offset="70%" stopColor="var(--lp-amber)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--lp-amber)" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Prancha I: a balança, símbolo da marca, em traço de gravura. */
export function PlateBalance({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 420 420" role="img" aria-labelledby="lp-balance-title">
      <title id="lp-balance-title">Gravura de uma balança de dois pratos atravessada por um traço âmbar ascendente</title>
      <circle cx="210" cy="200" r="168" fill="url(#lp-halo)" />
      <circle cx="210" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="210" cy="200" r="158" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.2" />

      {[...Array(48)].map((_, index) => {
        const angle = (index / 48) * Math.PI * 2;
        const inner = index % 4 === 0 ? 138 : 145;
        return (
          <line
            key={index}
            x1={210 + Math.cos(angle) * inner}
            y1={200 + Math.sin(angle) * inner}
            x2={210 + Math.cos(angle) * 150}
            y2={200 + Math.sin(angle) * 150}
            stroke="currentColor"
            strokeWidth={index % 4 === 0 ? 1.2 : 0.6}
            opacity="0.4"
          />
        );
      })}

      <g stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M210 92v192" />
        <path d="M120 130h180" />
        <path d="M150 300h120" />
        <path d="M210 284c-22 0-38 8-46 16h92c-8-8-24-16-46-16z" />
        <path d="M120 130l-34 62h68z" />
        <path d="M300 130l-34 62h68z" />
        <path d="M120 130v6" />
        <path d="M300 130v6" />
      </g>

      <path d="M86 192h68l-34 62z" fill="url(#lp-hatch)" opacity="0.55" />
      <path d="M266 192h68l-34 62z" fill="url(#lp-hatch)" opacity="0.35" />

      <circle cx="210" cy="120" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M96 268c46-26 86-62 118-108 30-44 62-78 100-104"
        fill="none"
        stroke="var(--lp-amber)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="314" cy="56" r="7" fill="var(--lp-amber)" />
    </svg>
  );
}

/** Prancha II: astrolábio: o tempo e as órbitas que o dinheiro percorre. */
export function PlateAstrolabe({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 400" role="img" aria-labelledby="lp-astro-title">
      <title id="lp-astro-title">Astrolábio com anéis concêntricos e marcações de meses</title>
      <g fill="none" stroke="currentColor">
        <circle cx="200" cy="200" r="186" strokeWidth="1" opacity="0.25" />
        <circle cx="200" cy="200" r="170" strokeWidth="2" opacity="0.55" />
        <circle cx="200" cy="200" r="128" strokeWidth="1" opacity="0.45" />
        <circle cx="200" cy="200" r="88" strokeWidth="1" opacity="0.4" />
        <circle cx="200" cy="200" r="42" strokeWidth="1.6" opacity="0.6" />
        <ellipse cx="200" cy="200" rx="170" ry="64" strokeWidth="0.9" opacity="0.35" />
        <ellipse cx="200" cy="200" rx="64" ry="170" strokeWidth="0.9" opacity="0.35" />
        <ellipse cx="200" cy="200" rx="150" ry="112" strokeWidth="0.7" opacity="0.25" transform="rotate(28 200 200)" />
      </g>

      {[...Array(12)].map((_, index) => {
        const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
        return (
          <g key={index}>
            <line
              x1={200 + Math.cos(angle) * 128}
              y1={200 + Math.sin(angle) * 128}
              x2={200 + Math.cos(angle) * 170}
              y2={200 + Math.sin(angle) * 170}
              stroke="currentColor"
              strokeWidth="1.4"
              opacity="0.5"
            />
            <circle
              cx={200 + Math.cos(angle) * 149}
              cy={200 + Math.sin(angle) * 149}
              r={index % 3 === 0 ? 4.5 : 2.5}
              fill={index % 3 === 0 ? 'var(--lp-amber)' : 'currentColor'}
              opacity={index % 3 === 0 ? 1 : 0.5}
            />
          </g>
        );
      })}

      <circle cx="200" cy="200" r="16" fill="var(--lp-amber)" opacity="0.9" />
      <path d="M200 158v84M158 200h84" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
    </svg>
  );
}

/** Prancha III: ampulheta: o custo do tempo que não se administra. */
export function PlateHourglass({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 260 400" role="img" aria-labelledby="lp-hour-title">
      <title id="lp-hour-title">Ampulheta com areia caindo</title>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M56 40h148M56 360h148" strokeLinecap="round" />
        <path d="M74 40v34c0 40 56 74 56 126s-56 86-56 126v34" />
        <path d="M186 40v34c0 40-56 74-56 126s56 86 56 126v34" />
      </g>
      <path d="M84 62c0 34 46 62 46 96 0-34 46-62 46-96z" fill="url(#lp-hatch-dense)" opacity="0.75" />
      <path d="M92 338c0-30 38-52 38-78 0 26 38 48 38 78z" fill="var(--lp-amber)" opacity="0.55" />
      <line x1="130" y1="196" x2="130" y2="292" stroke="var(--lp-amber)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="130" cy="300" r="3.4" fill="var(--lp-amber)" />
    </svg>
  );
}

/** Prancha IV: quatro colunas: a carteira em equilíbrio. */
export function PlateColumns({ className }: ArtProps) {
  const columns = [40, 128, 216, 304];
  const heights = [118, 146, 168, 96];
  return (
    <svg className={className} viewBox="0 0 400 260" role="img" aria-labelledby="lp-col-title">
      <title id="lp-col-title">Quatro colunas clássicas de alturas diferentes sobre uma base comum</title>
      <line x1="14" y1="228" x2="386" y2="228" stroke="currentColor" strokeWidth="2.6" />
      <line x1="24" y1="236" x2="376" y2="236" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {columns.map((x, index) => {
        const height = heights[index];
        const top = 228 - height;
        return (
          <g key={x}>
            <rect x={x - 6} y={top - 12} width={68} height={12} fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x={x} y={top} width={56} height={height} fill="url(#lp-hatch)" opacity="0.5" />
            <rect x={x} y={top} width={56} height={height} fill="none" stroke="currentColor" strokeWidth="2" />
            {[14, 28, 42].map((offset) => (
              <line
                key={offset}
                x1={x + offset}
                y1={top + 8}
                x2={x + offset}
                y2={220}
                stroke="currentColor"
                strokeWidth="0.8"
                opacity="0.45"
              />
            ))}
            <rect x={x - 4} y={220} width={64} height={8} fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx={x + 28} cy={top - 24} r="5" fill="var(--lp-amber)" opacity={index === 3 ? 1 : 0.35} />
          </g>
        );
      })}
    </svg>
  );
}

/** Prancha V: cofre e chave: a guarda local dos dados. */
export function PlateVault({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 300" role="img" aria-labelledby="lp-vault-title">
      <title id="lp-vault-title">Cofre antigo com fechadura circular e chave</title>
      <rect x="40" y="36" width="256" height="228" rx="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="56" y="52" width="224" height="196" rx="6" fill="url(#lp-hatch)" opacity="0.35" />
      <rect x="56" y="52" width="224" height="196" rx="6" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      <circle cx="168" cy="150" r="58" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="168" cy="150" r="42" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle cx="168" cy="150" r="14" fill="var(--lp-amber)" opacity="0.85" />
      {[...Array(8)].map((_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <line
            key={index}
            x1={168 + Math.cos(angle) * 58}
            y1={150 + Math.sin(angle) * 58}
            x2={168 + Math.cos(angle) * 74}
            y2={150 + Math.sin(angle) * 74}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        );
      })}
      <g stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M312 138h56" />
        <circle cx="304" cy="138" r="14" />
        <path d="M356 138v16M340 138v12" />
      </g>
    </svg>
  );
}

/** Prancha VI: bússola: a decisão orientada. */
export function PlateCompass({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 320 320" role="img" aria-labelledby="lp-compass-title">
      <title id="lp-compass-title">Rosa dos ventos com agulha apontando para o alto</title>
      <circle cx="160" cy="160" r="140" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="160" cy="160" r="120" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
      {[...Array(4)].map((_, index) => {
        const angle = (index / 4) * Math.PI * 2 - Math.PI / 2;
        const x = 160 + Math.cos(angle) * 120;
        const y = 160 + Math.sin(angle) * 120;
        return <line key={index} x1="160" y1="160" x2={x} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.4" />;
      })}
      <path d="M160 40l26 96-26-18-26 18z" fill="var(--lp-amber)" />
      <path d="M160 280l26-96-26 18-26-18z" fill="url(#lp-hatch-dense)" opacity="0.8" />
      <path d="M160 280l26-96-26 18-26-18z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="160" cy="160" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

/** Prancha VII: o livro-razão: cada lançamento no seu lugar. */
export function PlateLedger({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 300" role="img" aria-labelledby="lp-ledger-title">
      <title id="lp-ledger-title">Livro-razão aberto com colunas e lançamentos</title>
      <path d="M24 54c56-18 108-18 176 6 68-24 120-24 176-6v206c-56-18-108-18-176 6-68-24-120-24-176-6z" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M200 60v206" stroke="currentColor" strokeWidth="2" />
      {[...Array(9)].map((_, index) => {
        const y = 86 + index * 20;
        return (
          <g key={index} stroke="currentColor" opacity={index % 3 === 0 ? 0.7 : 0.35}>
            <line x1="44" y1={y} x2="182" y2={y} strokeWidth="0.9" />
            <line x1="218" y1={y} x2="356" y2={y} strokeWidth="0.9" />
          </g>
        );
      })}
      <rect x="150" y="98" width="32" height="10" fill="var(--lp-amber)" opacity="0.75" />
      <rect x="324" y="138" width="32" height="10" fill="var(--lp-amber)" opacity="0.45" />
      <rect x="150" y="178" width="32" height="10" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

/** Prancha VIII: arco: a passagem entre o presente e o futuro. */
export function PlateArch({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 320 360" role="img" aria-labelledby="lp-arch-title">
      <title id="lp-arch-title">Arco clássico com aduelas e chave âmbar</title>
      <path d="M40 340V180a120 120 0 0 1 240 0v160" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M76 340V182a84 84 0 0 1 168 0v158" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      {[...Array(9)].map((_, index) => {
        const angle = Math.PI + (index / 8) * Math.PI;
        const x1 = 160 + Math.cos(angle) * 84;
        const y1 = 182 + Math.sin(angle) * 84;
        const x2 = 160 + Math.cos(angle) * 120;
        const y2 = 182 + Math.sin(angle) * 120;
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.6" opacity="0.55" />;
      })}
      <path d="M142 62h36l8 34h-52z" fill="var(--lp-amber)" opacity="0.9" />
      <rect x="24" y="340" width="272" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

/** Ornamento de divisão: folha de louro simetrizada. */
export function Laurel({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 320 40" aria-hidden="true" focusable="false">
      <line x1="0" y1="20" x2="118" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="202" y1="20" x2="320" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <g stroke="currentColor" fill="none" strokeWidth="1.4">
        <path d="M128 20c8-10 20-12 28-6-8 10-20 12-28 6z" />
        <path d="M128 20c8 10 20 12 28 6-8-10-20-12-28-6z" />
        <path d="M192 20c-8-10-20-12-28-6 8 10 20 12 28 6z" />
        <path d="M192 20c-8 10-20 12-28 6 8-10 20-12 28-6z" />
      </g>
      <circle cx="160" cy="20" r="4" fill="var(--lp-amber)" />
    </svg>
  );
}

/** Prancha IX: a coruja de Atena: o saber que só levanta voo ao entardecer. */
export function PlateOwl({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 320 340" role="img" aria-labelledby="lp-owl-title">
      <title id="lp-owl-title">Coruja estilizada pousada sobre um ramo, em traço de gravura</title>
      <circle cx="160" cy="150" r="132" fill="url(#lp-halo)" />
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M160 44c-46 0-82 34-82 82 0 20 4 36 4 52 0 34 32 62 78 62s78-28 78-62c0-16 4-32 4-52 0-48-36-82-82-82z" />
        <path d="M78 96l-16-34 38 14M242 96l16-34-38 14" />
        <circle cx="122" cy="132" r="30" />
        <circle cx="198" cy="132" r="30" />
        <path d="M160 148l-14 22h28z" />
        <path d="M160 176v34" />
      </g>
      <circle cx="122" cy="132" r="12" fill="var(--lp-amber)" />
      <circle cx="198" cy="132" r="12" fill="var(--lp-amber)" />
      <path d="M108 196c14 26 38 42 52 42s38-16 52-42z" fill="url(#lp-hatch)" opacity="0.5" />
      <g stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M56 286h208" />
        <path d="M140 240v46M180 240v46" />
        <path d="M126 286l-10 14M136 286l0 14M146 286l10 14" />
        <path d="M174 286l-10 14M184 286l0 14M194 286l10 14" />
      </g>
    </svg>
  );
}

/** Prancha X: o talento: a moeda pesada que dá nome ao projeto. */
export function PlateCoins({ className }: ArtProps) {
  const pilhas = [
    { x: 74, alturas: 5 },
    { x: 160, alturas: 8 },
    { x: 246, alturas: 3 },
  ];
  return (
    <svg className={className} viewBox="0 0 340 280" role="img" aria-labelledby="lp-coins-title">
      <title id="lp-coins-title">Três pilhas de moedas antigas sobre uma linha de base</title>
      {pilhas.map((pilha) =>
        [...Array(pilha.alturas)].map((_, index) => {
          const y = 236 - index * 17;
          const destaque = index === pilha.alturas - 1;
          return (
            <g key={`${pilha.x}-${index}`}>
              <ellipse
                cx={pilha.x}
                cy={y}
                rx="42"
                ry="13"
                fill={destaque ? 'var(--lp-amber)' : 'url(#lp-hatch)'}
                opacity={destaque ? 0.85 : 0.55}
              />
              <ellipse cx={pilha.x} cy={y} rx="42" ry="13" fill="none" stroke="currentColor" strokeWidth="2" />
            </g>
          );
        }),
      )}
      <line x1="16" y1="252" x2="324" y2="252" stroke="currentColor" strokeWidth="2.4" />
      <g fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.7">
        <circle cx="160" cy="98" r="7" />
        <path d="M160 62v18M160 116v18M124 98h18M178 98h18" />
      </g>
    </svg>
  );
}

/** Prancha XI: a carta de navegação: o mês inteiro visto de cima. */
export function PlateMap({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 300" role="img" aria-labelledby="lp-map-title">
      <title id="lp-map-title">Carta de navegação antiga com rota pontilhada e rosa dos ventos</title>
      <rect x="18" y="18" width="364" height="264" rx="6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <rect x="30" y="30" width="340" height="240" rx="4" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <g stroke="currentColor" strokeWidth="0.6" opacity="0.28">
        {[...Array(9)].map((_, index) => (
          <line key={`v${index}`} x1={60 + index * 36} y1="30" x2={60 + index * 36} y2="270" />
        ))}
        {[...Array(6)].map((_, index) => (
          <line key={`h${index}`} x1="30" y1={64 + index * 36} x2="370" y2={64 + index * 36} />
        ))}
      </g>
      <path
        d="M70 226c46-6 62-52 104-64 44-13 58 26 96 8 24-11 30-42 44-58"
        fill="none"
        stroke="var(--lp-amber)"
        strokeWidth="3"
        strokeDasharray="9 8"
        strokeLinecap="round"
      />
      <circle cx="70" cy="226" r="6" fill="var(--lp-amber)" />
      <circle cx="314" cy="112" r="6" fill="none" stroke="var(--lp-amber)" strokeWidth="3" />
      <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.75">
        <circle cx="322" cy="228" r="26" />
        <path d="M322 202v52M296 228h52M304 210l36 36M340 210l-36 36" />
      </g>
      <path d="M52 62c18-10 34-4 46 8-14 12-32 14-46 2z" fill="url(#lp-hatch-dense)" opacity="0.6" />
    </svg>
  );
}

/** Prancha XII: o frontão: o que se constrói para durar. */
export function PlateTemple({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 260" role="img" aria-labelledby="lp-temple-title">
      <title id="lp-temple-title">Fachada de templo clássico com frontão e seis colunas</title>
      <path d="M200 26l176 74H24z" fill="url(#lp-hatch)" opacity="0.45" />
      <path d="M200 26l176 74H24z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="24" y="100" width="352" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" />
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const x = 44 + index * 56;
        return (
          <g key={index}>
            <rect x={x} y="116" width="36" height="102" fill="none" stroke="currentColor" strokeWidth="2" />
            {[9, 18, 27].map((offset) => (
              <line key={offset} x1={x + offset} y1="122" x2={x + offset} y2="212" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
            ))}
          </g>
        );
      })}
      <rect x="24" y="218" width="352" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <line x1="14" y1="238" x2="386" y2="238" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <circle cx="200" cy="72" r="9" fill="var(--lp-amber)" />
    </svg>
  );
}

/** Prancha XIII: a pena: o registro que sustenta a memória. */
export function PlateQuill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 300 300" role="img" aria-labelledby="lp-quill-title">
      <title id="lp-quill-title">Pena de escrever apoiada em tinteiro</title>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M96 214c34-6 74-30 104-70 26-34 38-72 40-104-32 6-72 22-104 54-34 34-46 82-40 120z" />
        <path d="M110 200c22-40 52-76 100-116" />
        <path d="M96 214l-38 38" strokeLinecap="round" />
        <path d="M58 252h72" strokeLinecap="round" />
        <ellipse cx="196" cy="242" rx="46" ry="16" />
        <path d="M150 242v14c0 9 21 16 46 16s46-7 46-16v-14" />
      </g>
      <path d="M120 176c20-34 46-64 84-98-8 34-30 70-60 92z" fill="url(#lp-hatch-dense)" opacity="0.55" />
      <ellipse cx="196" cy="242" rx="30" ry="9" fill="var(--lp-amber)" opacity="0.7" />
    </svg>
  );
}

/** Ornamento de fundo: roseta concêntrica para camadas discretas. */
export function Rosette({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      {[...Array(16)].map((_, index) => (
        <ellipse
          key={index}
          cx="200"
          cy="200"
          rx="180"
          ry="66"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.5"
          transform={`rotate(${(index * 180) / 16} 200 200)`}
        />
      ))}
      <circle cx="200" cy="200" r="30" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
