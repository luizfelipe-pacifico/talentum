/* Landing page do Talentum.
   O conteúdo desta página deriva do README e da documentação do repositório.
   Regra que vale para cada linha daqui: nada planejado pode ser apresentado
   como pronto, e nenhum valor exibido representa a vida financeira de alguém. */

import {
  ArtDefs,
  Laurel,
  PlateArch,
  PlateAstrolabe,
  PlateBalance,
  PlateCoins,
  PlateColumns,
  PlateCompass,
  PlateHourglass,
  PlateLedger,
  PlateMap,
  PlateOwl,
  PlateQuill,
  PlateTemple,
  PlateVault,
  Rosette,
} from './art';
import { PlateCarousel, ShotCarousel, type Plate, type Shot } from './carousel';
import { LegalNotices } from './legal';
import { BackToTop, Parallax, PointerScene, ReadingProgress, Reveal, SectionNav } from './motion';

const REPO = 'https://github.com/luizfelipe-pacifico/talentum';

const NAV = [
  { id: 'problema', label: 'O problema' },
  { id: 'metodo', label: 'O método' },
  { id: 'saldo', label: 'Saldo livre' },
  { id: 'sistema', label: 'O sistema' },
  { id: 'privacidade', label: 'Privacidade' },
  { id: 'projeto', label: 'O projeto' },
];

const DORES = [
  {
    icon: 'bi-eye-slash',
    title: 'O número que engana',
    text: 'Você vê dois mil na conta e sente folga. No dia dez vence a fatura, no dia quinze o aluguel. O saldo era uma ilusão de curto prazo, e a folga virou dívida.',
  },
  {
    icon: 'bi-hourglass-split',
    title: 'A disciplina que não escala',
    text: 'Anotar cada café exige um hábito diário. Hábito diário é a primeira coisa que uma rotina corrida devora. A planilha não morre por burrice, morre por cansaço.',
  },
  {
    icon: 'bi-droplet-half',
    title: 'O ralo invisível',
    text: 'Assinatura esquecida, tarifa velada, reajuste silencioso, parcela que continua depois da compra terminar. Ninguém percebe olhando um mês por vez.',
  },
  {
    icon: 'bi-signpost-2',
    title: 'A decisão adiada',
    text: 'Sem saber quanto sobra, investir vira aposta e meta vira promessa. O dinheiro fica parado na conta corrente esperando uma clareza que nunca chega.',
  },
];

const STEPS = [
  {
    icon: 'bi-file-earmark-arrow-up',
    title: 'Importar',
    text: 'Você arrasta o extrato em OFX ou PDF. O arquivo é lido dentro do seu computador e não sai dele em momento algum.',
  },
  {
    icon: 'bi-diagram-3',
    title: 'Organizar',
    text: 'Regras locais classificam a maior parte dos lançamentos, agrupam recorrências e reconhecem transferências entre suas próprias contas.',
  },
  {
    icon: 'bi-check2-circle',
    title: 'Conciliar',
    text: 'Só o que ficou duvidoso chega até você, em cartões de decisão rápida. Confirmar leva um toque, e o valor original nunca é sobrescrito.',
  },
  {
    icon: 'bi-calculator',
    title: 'Calcular',
    text: 'Faturas abertas, contas recorrentes e débitos previstos saem do saldo. O que resta é o dinheiro que você pode gastar sem criar um problema.',
  },
  {
    icon: 'bi-signpost-split',
    title: 'Planejar',
    text: 'Com o número certo na mão, meta deixa de ser desejo e aporte deixa de ser palpite. Cada decisão passa a ter uma conta por trás.',
  },
];

const TELAS: Shot[] = [
  {
    id: 'inicio',
    icon: 'bi-speedometer2',
    title: 'Início',
    src: '/telas/dashboard.webp',
    alt: 'Tela inicial do Talentum com os indicadores zerados e o banco local vazio',
    caption:
      'A posição do dia em poucos segundos de leitura. Como nenhuma conta foi cadastrada, todos os indicadores mostram zero e a tela chama a primeira importação.',
  },
  {
    id: 'extratos',
    icon: 'bi-receipt',
    title: 'Extratos',
    src: '/telas/extratos.webp',
    alt: 'Tela de extratos do Talentum, ainda sem nenhum lançamento importado',
    caption:
      'O lugar onde os lançamentos aparecem depois da importação, com filtros por período, conta, categoria e origem do lote que os trouxe.',
  },
  {
    id: 'conciliacao',
    icon: 'bi-check2-square',
    title: 'Conciliação',
    src: '/telas/conciliacao.webp',
    alt: 'Tela de conciliação do Talentum com a fila de pendências vazia',
    caption:
      'A fila do que a automação não teve confiança para decidir sozinha. Aqui, fila vazia é sucesso, não falta de conteúdo.',
  },
  {
    id: 'patrimonio',
    icon: 'bi-columns-gap',
    title: 'Patrimônio',
    src: '/telas/patrimonio.webp',
    alt: 'Tela de patrimônio do Talentum, sem ativos cadastrados',
    caption:
      'Os quatro pilares e a simulação do próximo aporte, que só ganham números depois que você cadastra a sua posição atual.',
  },
];

const AREAS = [
  {
    icon: 'bi-speedometer2',
    title: 'Início',
    text: 'Saldo livre, média de gastos, alertas do dia, progresso das metas e a situação da carteira, tudo em uma tela.',
  },
  {
    icon: 'bi-credit-card',
    title: 'Extratos, cartões e benefícios',
    text: 'Importação de PDF e OFX, lista inteligente de lançamentos, faturas, recorrências, anuidade, cashback, milhas e pontos.',
  },
  {
    icon: 'bi-check2-square',
    title: 'Conciliação',
    text: 'Triagem rápida do que ficou incerto, ajuste de juros e descontos, conferência de fatura e lançamento expresso de dinheiro.',
  },
  {
    icon: 'bi-pie-chart',
    title: 'Patrimônio e metas',
    text: 'Caixinhas de objetivo com cálculo de viabilidade, destinação do superávit e orientação de aporte pelos quatro pilares.',
  },
  {
    icon: 'bi-newspaper',
    title: 'Invest',
    text: 'Notícias de economia filtradas pelos ativos que você tem, com resumo objetivo e crédito sempre visível para a fonte.',
  },
  {
    icon: 'bi-clock-history',
    title: 'Histórico e perfil',
    text: 'Linha do tempo com pontos de restauração, exportação em formatos abertos, backup, missões, níveis e conquistas.',
  },
];

const PILLARS = [
  { letter: 'A', title: 'Ações', text: 'Crescimento e participação em empresas brasileiras negociadas na B3.' },
  { letter: 'R', title: 'Real Estate', text: 'Exposição imobiliária e geração de renda por fundos e ativos do setor.' },
  { letter: 'C', title: 'Caixa', text: 'Segurança, reserva e liquidez em Tesouro Selic e CDBs de liquidez diária.' },
  { letter: 'A', title: 'Ativos internacionais', text: 'Diversificação global e proteção cambial via ETFs, BDRs e ativos no exterior.' },
];

const PLATES: Plate[] = [
  {
    id: 'balanca',
    numeral: 'Prancha I',
    title: 'A balança',
    caption:
      'Dois pratos e um traço que sobe. O símbolo diz o que o produto faz: pesar o que entra contra o que já está comprometido, e mostrar para onde a linha aponta.',
    art: <PlateBalance className="lp-art" />,
  },
  {
    id: 'astrolabio',
    numeral: 'Prancha II',
    title: 'O astrolábio',
    caption:
      'Faturas fecham, salários caem, assinaturas renovam. Dinheiro é um fenômeno de calendário antes de ser um fenômeno de vontade.',
    art: <PlateAstrolabe className="lp-art" />,
  },
  {
    id: 'ampulheta',
    numeral: 'Prancha III',
    title: 'A ampulheta',
    caption:
      'A planilha não falha por falta de inteligência: falha por falta de tempo. Toda fricção removida aqui é tempo devolvido ao seu dia.',
    art: <PlateHourglass className="lp-art lp-art-tall" />,
  },
  {
    id: 'colunas',
    numeral: 'Prancha IV',
    title: 'As quatro colunas',
    caption:
      'Ações, imóveis, caixa e ativos internacionais. Nenhuma coluna sustenta sozinha o que quatro sustentam juntas.',
    art: <PlateColumns className="lp-art" />,
  },
  {
    id: 'cofre',
    numeral: 'Prancha V',
    title: 'O cofre',
    caption:
      'A chave não sai da sua mesa. Extratos, saldos e transações ficam no seu dispositivo, porque a nuvem não precisa saber quanto você tem.',
    art: <PlateVault className="lp-art" />,
  },
  {
    id: 'bussola',
    numeral: 'Prancha VI',
    title: 'A bússola',
    caption:
      'Um número sem explicação é um oráculo. O Talentum mostra a conta inteira: o que foi descontado, por qual motivo e até quando.',
    art: <PlateCompass className="lp-art" />,
  },
  {
    id: 'coruja',
    numeral: 'Prancha VII',
    title: 'A coruja de Atena',
    caption:
      'A sabedoria chega depois do fato. O extrato de ontem é o que ensina a decidir hoje, e por isso a leitura vem sempre antes do conselho.',
    art: <PlateOwl className="lp-art" />,
  },
  {
    id: 'talento',
    numeral: 'Prancha VIII',
    title: 'O talento',
    caption:
      'A unidade antiga de grande valor. Administrar aquilo que foi confiado é o verbo que dá nome ao projeto inteiro.',
    art: <PlateCoins className="lp-art" />,
  },
];

const COLECAO = [
  {
    numeral: 'XII',
    title: 'O frontão',
    text: 'Construir para durar exige base, coluna e cornija. Um orçamento também.',
    art: <PlateTemple className="lp-art" />,
  },
  {
    numeral: 'XI',
    title: 'A carta',
    text: 'A rota do mês: por onde o dinheiro entra, por onde passa e onde ele termina.',
    art: <PlateMap className="lp-art" />,
  },
  {
    numeral: 'XIII',
    title: 'A pena',
    text: 'Todo lançamento corrigido guarda o valor original. A memória não se apaga.',
    art: <PlateQuill className="lp-art" />,
  },
  {
    numeral: 'VIII',
    title: 'O arco',
    text: 'A passagem entre o presente apertado e o futuro planejado tem chave de abóbada.',
    art: <PlateArch className="lp-art" />,
  },
  {
    numeral: 'X',
    title: 'O talento',
    text: 'A moeda pesada que dá nome ao projeto: valor confiado, não valor recebido.',
    art: <PlateCoins className="lp-art" />,
  },
  {
    numeral: 'IX',
    title: 'A coruja',
    text: 'O saber que levanta voo ao entardecer, quando o mês já pode ser lido inteiro.',
    art: <PlateOwl className="lp-art" />,
  },
];

/* Marca em WebP: o SVG original é um PNG embutido de quase 200 KB.
   Os derivados são gerados por scripts/preparar-imagens-lp.mjs. */
function BrandMark({ fundo = 'claro' }: { fundo?: 'claro' | 'escuro' }) {
  const arquivo = fundo === 'escuro' ? 'talentum-escura' : 'talentum-clara';
  return (
    <img
      src={`/marca/${arquivo}-64.webp`}
      srcSet={`/marca/${arquivo}-64.webp 1x, /marca/${arquivo}-128.webp 2x`}
      alt=""
      width={39}
      height={34}
      decoding="async"
    />
  );
}

export function LandingPage() {
  return (
    <div className="lp-root">
      <ArtDefs />
      <ReadingProgress />
      <div className="lp-grain" aria-hidden="true" />

      <a className="lp-skip" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <a className="lp-brand" href="#topo">
            <BrandMark fundo="escuro" />
            <span className="lp-brand-name">Talentum</span>
          </a>
          <nav aria-label="Seções da página">
            <SectionNav items={NAV} />
          </nav>
          <a className="lp-btn lp-btn-sm" href={REPO} target="_blank" rel="noreferrer noopener">
            <i className="bi bi-github" aria-hidden="true" />
            Repositório
          </a>
        </div>
      </header>

      <main id="conteudo">
        {/* ── Herói ────────────────────────────────────────────── */}
        <section className="lp-hero" id="topo">
          <PointerScene className="lp-hero-scene">
            <div className="lp-spotlight" aria-hidden="true" />
            <div className="lp-wrap lp-hero-grid">
              <div className="lp-hero-copy">
                <Reveal>
                  <p className="lp-eyebrow">Pré-alpha · local-first · código aberto</p>
                </Reveal>
                <Reveal delay={90}>
                  <h1 className="lp-h-display-xl">
                    Clareza para o presente.
                    <span className="lp-amber-line">Disciplina para o futuro.</span>
                  </h1>
                </Reveal>
                <Reveal delay={180}>
                  <p className="lp-lede">
                    O Talentum lê seus extratos, organiza o que você gasta e mostra quanto realmente sobra depois de
                    tudo o que já está prometido. Sem planilha, sem digitação diária e sem entregar sua vida
                    financeira para a nuvem.
                  </p>
                </Reveal>
                <Reveal delay={260}>
                  <div className="lp-cta-row">
                    <a className="lp-btn lp-btn-primary" href="#problema">
                      Entender a proposta
                      <i className="bi bi-arrow-down" aria-hidden="true" />
                    </a>
                    <a className="lp-btn" href={REPO} target="_blank" rel="noreferrer noopener">
                      Ler o código
                      <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                    </a>
                  </div>
                </Reveal>
                <Reveal delay={340}>
                  <p className="lp-chip lp-chip-warn">
                    <i className="bi bi-cone-striped" aria-hidden="true" />
                    Em construção: ainda não existe instalador público
                  </p>
                </Reveal>
                <Reveal delay={400}>
                  <ul className="lp-hero-meta">
                    <li>
                      <i className="bi bi-windows" aria-hidden="true" /> Windows e Linux
                    </li>
                    <li>
                      <i className="bi bi-hdd" aria-hidden="true" /> SQLite no seu dispositivo
                    </li>
                    <li>
                      <i className="bi bi-git" aria-hidden="true" /> Auditável por qualquer pessoa
                    </li>
                  </ul>
                </Reveal>
              </div>

              <div className="lp-hero-art">
                <Parallax speed={0.1}>
                  <div className="lp-tilt">
                    <PlateBalance className="lp-art lp-art-hero" />
                  </div>
                </Parallax>
              </div>
            </div>
          </PointerScene>

          <div className="lp-wrap">
            <p className="lp-scroll-hint">
              <i className="bi bi-chevron-double-down" aria-hidden="true" />
              <span>Role para ler</span>
            </p>
          </div>
        </section>

        {/* ── A dor ────────────────────────────────────────────── */}
        <section className="lp-section" id="problema">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal>
                  <p className="lp-eyebrow">O problema</p>
                </Reveal>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">O saldo do banco raramente conta a história inteira</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    Faturas, assinaturas, débitos automáticos e metas futuras competem pelo mesmo dinheiro. Enquanto
                    isso, registrar tudo à mão cria uma rotina que quase ninguém sustenta por mais de três semanas.
                    O resultado é sempre o mesmo: a pessoa trabalha, ganha, paga as contas e mesmo assim termina o mês
                    sem saber para onde o dinheiro foi.
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <p className="lp-quote-inline">
                    Educação financeira não falta por preguiça. Falta porque a conta certa exige um tempo que o dia
                    não tem.
                  </p>
                </Reveal>
              </div>

              <Reveal variant="scale" className="lp-two-art">
                <Parallax speed={0.12}>
                  <PlateHourglass className="lp-art lp-art-tall" />
                </Parallax>
              </Reveal>
            </div>

            <div className="lp-grid lp-grid-2 lp-problem-list">
              {DORES.map((dor, index) => (
                <Reveal key={dor.title} as="article" delay={(index % 2) * 110} className="lp-card lp-card-hover">
                  <i className={`bi ${dor.icon}`} aria-hidden="true" />
                  <h3 className="lp-h-display">{dor.title}</h3>
                  <p>{dor.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── O método ─────────────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="metodo">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <Reveal>
                <p className="lp-eyebrow">A solução</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Cinco passos, e só um deles é seu</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  A automação faz o trabalho bruto. Você entra apenas onde o julgamento humano é insubstituível, e
                  entra por um toque, não por um formulário.
                </p>
              </Reveal>
            </div>

            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} as="li" delay={index * 90} className="lp-step">
                  <span className="lp-step-index">{String(index + 1).padStart(2, '0')}</span>
                  <i className={`bi ${step.icon}`} aria-hidden="true" />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={120}>
              <div className="lp-laurel">
                <Laurel className="lp-laurel-art" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Saldo Livre de Risco ─────────────────────────────── */}
        <section className="lp-section" id="saldo">
          <div className="lp-wrap">
            <div className="lp-two lp-two-reverse">
              <Reveal className="lp-two-art" variant="left">
                <div className="lp-figure">
                  <p className="lp-figure-head">Exemplo ilustrativo · não representa nenhuma conta real</p>
                  <div className="lp-figure-body">
                    <table className="lp-calc">
                      <tbody>
                        <tr>
                          <th scope="row">Saldos confirmados</th>
                          <td>R$ 4.000,00</td>
                        </tr>
                        <tr>
                          <th scope="row">Fatura aberta do cartão</th>
                          <td>− R$ 1.200,00</td>
                        </tr>
                        <tr>
                          <th scope="row">Contas recorrentes do mês</th>
                          <td>− R$ 860,00</td>
                        </tr>
                        <tr>
                          <th scope="row">Débitos automáticos previstos</th>
                          <td>− R$ 340,00</td>
                        </tr>
                        <tr className="lp-total">
                          <th scope="row">Saldo Livre de Risco</th>
                          <td>R$ 1.600,00</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="lp-tiny lp-muted">
                      Entradas futuras incertas não aumentam esse número. O aplicativo prefere um saldo menor e
                      verdadeiro a um saldo maior e otimista.
                    </p>
                  </div>
                </div>
              </Reveal>

              <div>
                <Reveal>
                  <p className="lp-eyebrow">A métrica central</p>
                </Reveal>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Saldo Livre de Risco</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    É o dinheiro que sobra depois de considerar faturas abertas, contas recorrentes e débitos
                    previstos até o fim do período. Uma única linha que substitui a falsa sensação de folga por uma
                    leitura do que realmente pode ser gasto hoje.
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <ul className="lp-checks">
                    <li>
                      <i className="bi bi-check2" aria-hidden="true" />
                      A fórmula e o período ficam abertos na própria tela, porque um número sem explicação seria um
                      oráculo.
                    </li>
                    <li>
                      <i className="bi bi-check2" aria-hidden="true" />
                      Havendo dívida cara ou saldo negativo, o produto entra em modo de sobrevivência e pausa as
                      sugestões de aporte.
                    </li>
                    <li>
                      <i className="bi bi-check2" aria-hidden="true" />
                      Cada correção sua fica registrada com antes, depois e motivo, e pode ser revertida quando você
                      quiser.
                    </li>
                  </ul>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ── O sistema hoje ───────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="sistema">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <Reveal>
                <p className="lp-eyebrow">O sistema hoje</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Telas reais, banco vazio, nenhum número inventado</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  As imagens abaixo são capturas do aplicativo em desenvolvimento, não são ilustrações de marketing.
                  Como nenhuma conta foi cadastrada, tudo aparece zerado: o Talentum não exibe dado fictício para
                  parecer mais pronto do que está.
                </p>
              </Reveal>
            </div>

            <Reveal delay={160}>
              <ShotCarousel shots={TELAS} />
            </Reveal>
          </div>
        </section>

        {/* ── As seis salas ────────────────────────────────────── */}
        <section className="lp-section" id="salas">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <Reveal>
                <p className="lp-eyebrow">O que vai existir</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Seis salas, uma casa</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Cada área resolve uma parte do ciclo, e funções globais atravessam todas elas: notificações
                  acionáveis, importação rápida, seleção de conta e lançamento expresso de despesa em dinheiro.
                </p>
              </Reveal>
            </div>

            <div className="lp-grid lp-grid-3">
              {AREAS.map((area, index) => (
                <Reveal key={area.title} as="article" delay={(index % 3) * 100} className="lp-card lp-card-hover">
                  <i className={`bi ${area.icon}`} aria-hidden="true" />
                  <h3 className="lp-h-display">{area.title}</h3>
                  <p>{area.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Patrimônio ───────────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="arca">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal>
                  <p className="lp-eyebrow">Patrimônio</p>
                </Reveal>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Quatro colunas sustentam melhor que uma</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    Depois que o mês está sob controle, entra a parte de longo prazo. O módulo patrimonial usa como
                    referência a metodologia ARCA, idealizada por <strong>Thiago Nigro (Primo Rico)</strong>, que
                    divide o patrimônio em quatro pilares com meta-base de 25% em cada um.
                  </p>
                </Reveal>
              </div>
              <Reveal className="lp-two-art" variant="right">
                <Parallax speed={0.08}>
                  <PlateColumns className="lp-art" />
                </Parallax>
              </Reveal>
            </div>

            <ul className="lp-pillars">
              {PILLARS.map((pillar, index) => (
                <Reveal key={pillar.title} as="li" delay={index * 90} className="lp-pillar">
                  <span className="lp-pillar-letter">{pillar.letter}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </Reveal>
              ))}
            </ul>

            <Reveal delay={120}>
              <p className="lp-band">
                <i className="bi bi-rulers" aria-hidden="true" />
                <span>
                  Um pilar é considerado equilibrado entre <strong>22,5% e 27,5%</strong>. A banda existe para que
                  oscilação de mercado não vire alarme, e o motor prioriza o aporte novo no pilar mais defasado,{' '}
                  <strong>sem sugerir venda de nada</strong>.
                </span>
              </p>
            </Reveal>

            <Reveal delay={160}>
              <p className="lp-callout lp-callout-info">
                <i className="bi bi-info-circle" aria-hidden="true" />
                <span>
                  O Talentum é uma ferramenta de organização e educação financeira. Ele não oferece recomendação
                  individual de investimento. ARCA e Primo Rico são referências creditadas aos seus respectivos
                  titulares e não indicam afiliação ou endosso ao projeto.
                </span>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Modo de sobrevivência ────────────────────────────── */}
        <section className="lp-section" id="sobrevivencia">
          <div className="lp-wrap lp-two">
            <Reveal className="lp-two-art" variant="left">
              <Parallax speed={0.1}>
                <PlateArch className="lp-art lp-art-tall" />
              </Parallax>
            </Reveal>
            <div>
              <Reveal>
                <p className="lp-eyebrow">Quando o mês aperta</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Modo de sobrevivência</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Não faz sentido falar em alocação de carteira para quem está pagando juro de cartão. Havendo dívida
                  cara ou saldo negativo, o produto muda de assunto: pausa as sugestões de aporte, prioriza o juro
                  mais alto e concentra a tela na reconstrução da liquidez.
                </p>
              </Reveal>
              <Reveal delay={200}>
                <p className="lp-quote-inline">
                  A interface precisa ser evidente sem ser punitiva. Quem está apertado já sabe disso. O que falta é o
                  próximo passo concreto.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Privacidade ──────────────────────────────────────── */}
        <section className="lp-slab" id="privacidade">
          <Parallax speed={0.05} className="lp-slab-orbit lp-slab-orbit-right">
            <PlateVault className="lp-art lp-art-ghost" />
          </Parallax>

          <div className="lp-wrap lp-slab-inner">
            <Reveal>
              <p className="lp-eyebrow">Privacidade por princípio</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="lp-h-display-lg">A nuvem não precisa saber quanto você tem</h2>
            </Reveal>
            <Reveal delay={140}>
              <p className="lp-lede">
                Um programa que lê extrato bancário tem acesso ao retrato mais íntimo da sua vida: onde você come,
                quem você paga, quanto você ganha, do que você desistiu. Por isso a separação abaixo não é promessa de
                marketing, é o limite que o código respeita.
              </p>
            </Reveal>

            <div className="lp-grid lp-grid-2 lp-ledgers">
              <Reveal as="article" className="lp-panel">
                <h3>Fica no seu dispositivo</h3>
                <ul className="lp-ledger">
                  {[
                    'Extratos e faturas importados',
                    'Transações, estabelecimentos e categorias',
                    'Saldos, patrimônio, metas e hábitos',
                    'Chaves PIX próprias, cifradas localmente',
                    'O banco SQLite inteiro',
                  ].map((item) => (
                    <li key={item} className="local">
                      <i className="bi bi-hdd-fill" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal as="article" delay={120} className="lp-panel">
                <h3>Vai para a borda</h3>
                <ul className="lp-ledger">
                  {[
                    'Identidade mínima e sessão da sua conta',
                    'Consentimentos e preferências de comunicação',
                    'Metadados de versão e download do aplicativo',
                    'Conteúdo público da comunidade de feedback',
                    'Um snapshot já cifrado, quando você habilitar',
                  ].map((item) => (
                    <li key={item} className="cloud">
                      <i className="bi bi-cloud" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={160}>
              <p className="lp-callout lp-callout-warn">
                <i className="bi bi-cone-striped" aria-hidden="true" />
                <span>
                  O backup cifrado com AES-256-GCM e a exportação em JSON e CSV são <strong>planejados</strong>. Não
                  serão anunciados como prontos, nem descritos como conhecimento zero, antes de existirem, terem
                  recuperação de chave documentada e passarem por auditoria.
                </span>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Faixa ornamental ─────────────────────────────────── */}
        <aside className="lp-band-art" aria-label="Princípio do produto">
          <Parallax speed={0.05}>
            <Rosette className="lp-rosette" />
          </Parallax>
          <div className="lp-wrap lp-band-art-inner">
            <Reveal variant="blur">
              <p>“Administrar é decidir com o que se tem, sabendo o que já está prometido.”</p>
            </Reveal>
            <Reveal delay={120}>
              <Laurel className="lp-laurel-art" />
            </Reveal>
          </div>
        </aside>

        {/* ── O nome ───────────────────────────────────────────── */}
        <section className="lp-slab" id="manifesto">
          <Parallax speed={0.06} className="lp-slab-orbit">
            <PlateAstrolabe className="lp-art lp-art-ghost" />
          </Parallax>

          <div className="lp-wrap lp-slab-inner">
            <Reveal>
              <p className="lp-eyebrow">O nome</p>
            </Reveal>
            <Reveal delay={80}>
              <blockquote className="lp-quote">
                <p>
                  <em>Talentum</em>, do latim: uma unidade de grande valor e, por extensão, aquilo que nos foi
                  confiado para administrar e multiplicar.
                </p>
              </blockquote>
            </Reveal>
            <Reveal delay={160}>
              <p className="lp-lede">
                A escolha do nome é uma tese. Dinheiro não é só um número na tela do banco: é um recurso confiado a
                você, com prazo, com custo de oportunidade e com consequência. Administrar exige duas coisas que a
                vida corrida rouba primeiro, atenção e método, e devolver essas duas é a razão de o projeto existir.
              </p>
            </Reveal>

            <div className="lp-grid lp-grid-3 lp-slab-cards">
              {[
                {
                  icon: 'bi-columns-gap',
                  title: 'Ordem antes de decoração',
                  text: 'Hierarquia clara, alinhamento previsível e nada de enfeite competindo com o valor na tela.',
                },
                {
                  icon: 'bi-shield-lock',
                  title: 'Privacidade como princípio',
                  text: 'O que é seu fica no seu computador. Não é recurso premium, é a arquitetura do produto.',
                },
                {
                  icon: 'bi-mortarboard',
                  title: 'Educação, não recomendação',
                  text: 'O aplicativo explica o cálculo e mostra o caminho. Ele não dá palpite sobre o seu dinheiro.',
                },
              ].map((item, index) => (
                <Reveal key={item.title} delay={index * 110} as="article" className="lp-panel">
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Carrossel de pranchas ────────────────────────────── */}
        <section className="lp-section" id="pranchas">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <Reveal>
                <p className="lp-eyebrow">O gabinete de gravuras</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Oito pranchas para explicar um produto</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Cada figura desta coleção foi desenhada para o projeto. Navegue pelas setas, pelos pontos ou pelas
                  teclas esquerda e direita.
                </p>
              </Reveal>
            </div>
            <Reveal delay={160}>
              <PlateCarousel plates={PLATES} />
            </Reveal>
          </div>
        </section>

        {/* ── A coleção ────────────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="colecao">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <Reveal>
                <p className="lp-eyebrow">A coleção</p>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Um vocabulário de imagens</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Seis gravuras a mais, desenhadas para o projeto. Nenhuma vem de banco de imagens: elas existem para
                  explicar uma ideia, não para preencher espaço.
                </p>
              </Reveal>
            </div>

            <div className="lp-gallery">
              {COLECAO.map((peca, index) => (
                <Reveal
                  key={peca.title}
                  as="figure"
                  variant="blur"
                  delay={(index % 3) * 110}
                  className="lp-gallery-item"
                >
                  <div className="lp-gallery-art">{peca.art}</div>
                  <figcaption>
                    <span className="lp-gallery-numeral">Prancha {peca.numeral}</span>
                    <h3>{peca.title}</h3>
                    <p>{peca.text}</p>
                  </figcaption>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Estado do projeto ────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="projeto">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal>
                  <p className="lp-eyebrow">Onde estamos</p>
                </Reveal>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Pré-alpha, e dizendo isso em voz alta</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    O repositório já tem a visão consolidada, a documentação técnica, a identidade visual, a base
                    Next.js full-stack, uma API local inicial, Prisma com SQLite, Docker e o shell do Electron. Os
                    módulos financeiros e os serviços de borda ainda serão implementados, nesta ordem:
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <ol className="lp-timeline">
                    {[
                      { title: 'Fundação técnica e segurança', state: 'em andamento' },
                      { title: 'Cadastro, sessão e downloads autorizados', state: 'planejado' },
                      { title: 'Electron seguro e primeiro acesso', state: 'planejado' },
                      { title: 'Contas, categorias e obrigações', state: 'planejado' },
                      { title: 'Importação de OFX', state: 'planejado' },
                      { title: 'Categorização e conciliação', state: 'planejado' },
                      { title: 'Dashboard e Saldo Livre de Risco', state: 'planejado' },
                    ].map((item, index) => (
                      <li key={item.title}>
                        <span className="lp-timeline-dot" aria-hidden="true">
                          {index === 0 ? <i className="bi bi-record-circle" /> : <i className="bi bi-circle" />}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className={`lp-state lp-state-${index === 0 ? 'now' : 'next'}`}>{item.state}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </Reveal>
              </div>

              <Reveal className="lp-two-art" variant="right">
                <Parallax speed={0.08}>
                  <PlateLedger className="lp-art" />
                </Parallax>
              </Reveal>
            </div>

            <div className="lp-grid lp-grid-2 lp-download">
              <Reveal as="article" className="lp-platform">
                <i className="bi bi-windows" aria-hidden="true" />
                <div>
                  <h3>Windows</h3>
                  <p>Instalador assinado, publicado em GitHub Releases e liberado depois do login.</p>
                </div>
                <span className="lp-chip">Planejado</span>
              </Reveal>
              <Reveal as="article" delay={110} className="lp-platform">
                <i className="bi bi-ubuntu" aria-hidden="true" />
                <div>
                  <h3>Linux</h3>
                  <p>Mesmo pipeline, mesmo checksum verificável e a mesma exigência de conta.</p>
                </div>
                <span className="lp-chip">Planejado</span>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Contribuir ───────────────────────────────────────── */}
        <section className="lp-section" id="contribuir">
          <div className="lp-wrap lp-center">
            <Reveal variant="scale">
              <PlateCompass className="lp-art lp-art-small" />
            </Reveal>
            <Reveal delay={100}>
              <h2 className="lp-h-display-lg">Software que lê extrato precisa poder ser lido</h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="lp-lede lp-center-text">
                Código aberto aqui não é etiqueta, é a única forma honesta de pedir que alguém confie um extrato
                bancário a um programa. Leia, critique, abra uma issue, escreva um parser para o seu banco. Sempre com
                amostras sintéticas, nunca com o seu extrato de verdade.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="lp-cta-row lp-center-row">
                <a className="lp-btn lp-btn-primary" href={REPO} target="_blank" rel="noreferrer noopener">
                  <i className="bi bi-github" aria-hidden="true" />
                  Ver o repositório
                </a>
                <a className="lp-btn" href={`${REPO}/issues`} target="_blank" rel="noreferrer noopener">
                  Abrir uma issue
                </a>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <p className="lp-tiny lp-muted lp-center-text">
                A licença definitiva ainda precisa ser formalizada em um arquivo <code className="lp-mono">LICENSE</code>{' '}
                antes da primeira distribuição pública.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <BackToTop />

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div>
              <a className="lp-brand" href="#topo">
                <BrandMark />
                <span className="lp-brand-name">Talentum</span>
              </a>
              <p className="lp-tiny lp-muted lp-footer-note">Clareza para o presente. Disciplina para o futuro.</p>
            </div>

            <div className="lp-footer-col">
              <h3>Produto</h3>
              <ul>
                <li>
                  <a href="#problema">O problema</a>
                </li>
                <li>
                  <a href="#saldo">Saldo Livre de Risco</a>
                </li>
                <li>
                  <a href="#sistema">Telas do sistema</a>
                </li>
                <li>
                  <a href="#arca">Quatro pilares</a>
                </li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h3>Projeto</h3>
              <ul>
                <li>
                  <a href={REPO} target="_blank" rel="noreferrer noopener">
                    Repositório
                  </a>
                </li>
                <li>
                  <a href={`${REPO}/issues`} target="_blank" rel="noreferrer noopener">
                    Issues
                  </a>
                </li>
                <li>
                  <a href="/lut/talentum-archive.cube" download>
                    LUT do projeto
                  </a>
                </li>
                <li>
                  <span>Comunidade de feedback: planejada</span>
                </li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h3>Jurídico</h3>
              <LegalNotices />
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>Projeto pessoal em desenvolvimento aberto, em fase pré-alpha.</span>
            <span>
              Ícones por{' '}
              <a href="https://icons.getbootstrap.com/" target="_blank" rel="noreferrer noopener">
                Bootstrap Icons
              </a>
              , licença MIT.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
