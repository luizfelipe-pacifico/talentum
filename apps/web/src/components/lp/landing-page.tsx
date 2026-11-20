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
  PlateOwl,
  PlateVault,
  Rosette,
} from './art';
import { PlateCarousel, ShotCarousel, type Plate, type Shot } from './carousel';
import { LegalNotices } from './legal';
import { BackToTop, Parallax, PointerScene, ReadingProgress, Reveal, ScrollPosition, SectionNav } from './motion';
import { Icon } from './icon';

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
    text: 'Você escolhe o extrato do banco em OFX ou CSV. O arquivo é lido dentro do seu computador, você vê a prévia antes de gravar e pode desfazer a importação inteira.',
  },
  {
    icon: 'bi-diagram-3',
    title: 'Organizar',
    text: 'Cada lançamento entra com conta, data e valor. A classificação automática por regras de estabelecimento é planejada; hoje você define a categoria na conciliação.',
  },
  {
    icon: 'bi-check2-circle',
    title: 'Conciliar',
    text: 'O que ainda não tem categoria vai para uma fila. Você confirma, categoriza ou liga a uma conta recorrente, e o valor original nunca é sobrescrito.',
  },
  {
    icon: 'bi-calculator',
    title: 'Calcular',
    text: 'Contas a vencer, recorrências e débitos previstos até o fim do período saem do saldo. O que resta é o dinheiro que você pode gastar sem criar um problema.',
  },
  {
    icon: 'bi-signpost-split',
    title: 'Planejar',
    text: 'Com o número certo na mão, meta deixa de ser desejo e aporte deixa de ser palpite. Orçamento, metas e patrimônio são as próximas etapas.',
  },
];

/* Capturas do aplicativo rodando com banco novo, sem nenhum dado: o que
   aparece é o estado vazio de verdade, não uma montagem. */
const TELAS: Shot[] = [
  {
    id: 'dashboard',
    icon: 'bi-speedometer2',
    title: 'Dashboard',
    src: '/telas/dashboard.webp',
    alt: 'Dashboard do Talentum sem dados, com a mensagem “Sua base financeira ainda está vazia” e os botões Importar extrato e Cadastrar posição atual',
    caption:
      'Sem dados, o dashboard não mostra zeros nem números de exemplo. Ele diz que a base está vazia e oferece os dois jeitos de começar.',
  },
  {
    id: 'importar',
    icon: 'bi-file-earmark-arrow-up',
    title: 'Importar extrato',
    src: '/telas/importar.webp',
    alt: 'Tela de importação do Talentum pedindo o arquivo do banco, com a área para arrastar o arquivo e o botão Escolher arquivo',
    caption:
      'Aceita CSV e OFX. O arquivo é lido no seu computador, e nada é gravado antes de você conferir a prévia da leitura.',
  },
  {
    id: 'extratos',
    icon: 'bi-receipt',
    title: 'Extratos',
    src: '/telas/extratos.webp',
    alt: 'Tela de extratos do Talentum sem lançamentos, com o botão Importar extrato',
    caption:
      'Depois da importação, os lançamentos aparecem aqui com filtros por período, conta, categoria e importação de origem.',
  },
  {
    id: 'conciliacao',
    icon: 'bi-check2-square',
    title: 'Conciliação',
    src: '/telas/conciliacao.webp',
    alt: 'Tela de conciliação do Talentum com a mensagem “Tudo conciliado”',
    caption: 'A fila do que ainda precisa da sua decisão. Fila vazia quer dizer que não há nada pendente.',
  },
];

/* Estado de cada área no repositório, conferido com docs/ROADMAP.md e com o
   mapa de rotas de docs/PRODUCT.md. Atualize junto com eles. */
type Estado = 'pronto' | 'parcial' | 'planejado';

const ESTADO: Record<Estado, { label: string; icon: string }> = {
  pronto: { label: 'Funciona no código', icon: 'bi-check2-circle' },
  parcial: { label: 'Em parte', icon: 'bi-circle-half' },
  planejado: { label: 'Planejado', icon: 'bi-circle' },
};

const AREAS: { icon: string; title: string; text: string; estado: Estado }[] = [
  {
    icon: 'bi-speedometer2',
    title: 'Dashboard',
    text: 'Saldo consolidado, Saldo Livre de Risco com projeção diária, entradas e saídas do mês, média diária e gastos por categoria. Alertas de vencimento vêm depois.',
    estado: 'parcial',
  },
  {
    icon: 'bi-receipt',
    title: 'Extratos',
    text: 'Importação de OFX e CSV com prévia, lançamentos repetidos descartados, desfazer importação e histórico de cada edição. Cartões, faturas e PDF são planejados.',
    estado: 'parcial',
  },
  {
    icon: 'bi-check2-square',
    title: 'Conciliação',
    text: 'Fila do que ficou sem categoria: confirmar, categorizar, ligar a uma conta recorrente, registrar juro ou desconto, parear transferência entre contas suas e reverter.',
    estado: 'pronto',
  },
  {
    icon: 'bi-clock-history',
    title: 'Histórico',
    text: 'Linha do tempo das importações, edições e decisões, com filtro e reversão. Backup cifrado e exportação ainda são planejados.',
    estado: 'parcial',
  },
  {
    icon: 'bi-pie-chart',
    title: 'Patrimônio e metas',
    text: 'Caixinhas de objetivo com cálculo de viabilidade e orientação de aporte pelos quatro pilares.',
    estado: 'planejado',
  },
  {
    icon: 'bi-newspaper',
    title: 'Invest',
    text: 'Notícias de economia filtradas pelos ativos que você tem, com resumo e crédito sempre visível para a fonte.',
    estado: 'planejado',
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

/* Marca vetorial gerada por scripts/gerar-marca.mjs: nítida em qualquer
   densidade e com cerca de 1 KB. */
function BrandMark({ fundo = 'claro' }: { fundo?: 'claro' | 'escuro' }) {
  const arquivo = fundo === 'escuro' ? 'talentum-escura' : 'talentum-clara';
  return (
    <img
      src={`/marca/${arquivo}.svg`}
      alt=""
      width={39}
      height={34}
      decoding="async"
    />
  );
}

export function LandingPage({ notice = null }: { notice?: React.ReactNode } = {}) {
  return (
    <div className="lp-root">
      <ArtDefs />
      <ReadingProgress />
      <ScrollPosition />

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
          <a
            className="lp-btn lp-btn-sm lp-header-repo"
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Repositório no GitHub"
          >
            <Icon name="bi-github" />
            <span className="lp-header-repo-label">Repositório</span>
          </a>
        </div>
      </header>

      <main id="conteudo">
        {/* ── Herói ────────────────────────────────────────────── */}
        <section className="lp-hero" id="topo">
          <PointerScene className="lp-hero-scene">
            <div className="lp-wrap lp-hero-grid">
              {/* O título ocupa a largura inteira: cada frase cabe em uma linha
                  no desktop e vira o elemento dominante da primeira tela. */}
              <h1 className="lp-h-display-xl lp-hero-title">
                Clareza para o presente.
                <span className="lp-amber-line">Disciplina para o futuro.</span>
              </h1>
              <div className="lp-hero-copy">
                <p className="lp-lede">
                  O Talentum lê seus extratos, organiza o que você gasta e mostra quanto realmente sobra depois de
                  tudo o que já está prometido. Sem planilha, sem digitação diária e sem entregar sua vida
                  financeira para a nuvem.
                </p>
                {notice}
                <div className="lp-cta-row">
                  <a className="lp-btn lp-btn-primary" href="/api/auth/start">
                    Entrar com Google
                    <Icon name="bi-arrow-right" />
                  </a>
                  <a className="lp-btn" href={REPO} target="_blank" rel="noreferrer noopener">
                    Ler o código
                    <Icon name="bi-box-arrow-up-right" />
                  </a>
                </div>
                <p className="lp-chip lp-chip-warn">
                  <Icon name="bi-cone-striped" />
                  Pré-alpha: ainda não há instalador para baixar
                </p>
                <ul className="lp-hero-meta">
                  <li>
                    <Icon name="bi-pc-display" /> Windows e Linux, planejados
                  </li>
                  <li>
                    <Icon name="bi-hdd" /> Dados financeiros no seu computador
                  </li>
                  <li>
                    <Icon name="bi-git" /> Código aberto, licença MIT
                  </li>
                </ul>
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
        </section>

        {/* ── A dor ────────────────────────────────────────────── */}
        <section className="lp-section" id="problema">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">O saldo do banco raramente conta a história inteira</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    Faturas, assinaturas, débitos automáticos e metas futuras competem pelo mesmo dinheiro. Enquanto
                    isso, registrar tudo à mão cria uma rotina difícil de manter. O resultado costuma ser o mesmo: a
                    pessoa trabalha, ganha, paga as contas e mesmo assim termina o mês sem saber para onde o dinheiro
                    foi.
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
                <Reveal key={dor.title} as="article" delay={(index % 2) * 110} className="lp-card">
                  <Icon name={dor.icon} />
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
                  <Icon name={step.icon} />
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
                          <th scope="row">Aluguel a vencer no período</th>
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
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Saldo Livre de Risco</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    É o dinheiro que sobra depois de descontar as contas a vencer, as recorrências e os débitos
                    previstos até o fim do período. Uma única linha que substitui a falsa sensação de folga por uma
                    leitura do que realmente pode ser gasto hoje.
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <ul className="lp-checks">
                    <li>
                      <Icon name="bi-check2" />
                      Renda que ainda não caiu não entra na conta: o número só usa o que está confirmado.
                    </li>
                    <li>
                      <Icon name="bi-check2" />
                      Cada correção sua fica registrada com antes, depois e motivo, e pode ser revertida quando você
                      quiser.
                    </li>
                    <li className="lp-checks-planned">
                      <Icon name="bi-circle" />
                      Planejado: abrir o cálculo linha a linha na própria tela, como na tabela ao lado.
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
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">As telas de hoje, sem nenhum dado</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Capturas do aplicativo aberto pela primeira vez, antes de qualquer importação. Cada tela vazia diz o
                  que falta e qual é o próximo passo, em vez de mostrar valor de exemplo.
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
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">O que já funciona e o que vem depois</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Seis áreas cobrem o ciclo do mês. Ao lado de cada uma está o estado dela no código hoje. “Funciona
                  no código” quer dizer que roda a partir do repositório; o instalador ainda não existe.
                </p>
              </Reveal>
            </div>

            <ul className="lp-areas">
              {AREAS.map((area, index) => (
                <Reveal key={area.title} as="li" delay={(index % 2) * 80} className="lp-area">
                  <Icon name={area.icon} />
                  <div>
                    <h3 className="lp-h-display">{area.title}</h3>
                    <p>{area.text}</p>
                  </div>
                  <span className={`lp-area-state lp-area-state-${area.estado}`}>
                    <Icon name={ESTADO[area.estado].icon} />
                    {ESTADO[area.estado].label}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Patrimônio ───────────────────────────────────────── */}
        <section className="lp-section lp-section-sunken" id="arca">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Quatro colunas sustentam melhor que uma</h2>
                </Reveal>
                <Reveal delay={110}>
                  <p className="lp-chip">
                    <Icon name="bi-circle" />
                    Planejado: etapa de patrimônio
                  </p>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    Depois que o mês está sob controle, entra a parte de longo prazo. O módulo patrimonial vai usar como
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
                <Icon name="bi-rulers" />
                <span>
                  Um pilar é considerado equilibrado entre <strong>22,5% e 27,5%</strong>. A banda existe para que
                  oscilação de mercado não vire alarme, e o motor prioriza o aporte novo no pilar mais defasado,{' '}
                  <strong>sem sugerir venda de nada</strong>.
                </span>
              </p>
            </Reveal>

            <Reveal delay={160}>
              <p className="lp-callout lp-callout-info">
                <Icon name="bi-info-circle" />
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
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Modo de sobrevivência</h2>
              </Reveal>
              <Reveal delay={110}>
                <p className="lp-chip">
                  <Icon name="bi-circle" />
                  Planejado: etapa de dívidas
                </p>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Não faz sentido falar em alocação de carteira para quem está pagando juro de cartão. Havendo dívida
                  cara ou saldo negativo, o produto vai mudar de assunto: pausar as sugestões de aporte, priorizar
                  o juro mais alto e concentrar a tela na reconstrução da liquidez.
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
                    'Lançamentos importados dos seus extratos (o arquivo em si não é guardado)',
                    'Transações, estabelecimentos e categorias',
                    'Saldos, patrimônio, metas e hábitos',
                    'Suas chaves Pix, cifradas no próprio computador',
                    'O banco de dados local inteiro',
                  ].map((item) => (
                    <li key={item} className="local">
                      <Icon name="bi-hdd-fill" />
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
                    'Conteúdo público da comunidade de feedback (planejada)',
                    'Uma cópia de segurança já cifrada, se você ativar (planejada)',
                  ].map((item) => (
                    <li key={item} className="cloud">
                      <Icon name="bi-cloud" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={160}>
              <p className="lp-callout lp-callout-warn">
                <Icon name="bi-cone-striped" />
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
                  <Icon name={item.icon} />
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
              <Reveal delay={80}>
                <h2 className="lp-h-display-lg">Oito ideias por trás do produto</h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="lp-lede">
                  Cada gravura carrega um princípio que decide como o Talentum calcula, guarda e mostra o seu
                  dinheiro.
                </p>
              </Reveal>
            </div>
            <Reveal delay={160}>
              <PlateCarousel plates={PLATES} />
            </Reveal>
          </div>
        </section>

        {/* ── Estado do projeto ────────────────────────────────── */}
        <section className="lp-section" id="projeto">
          <div className="lp-wrap">
            <div className="lp-two">
              <div>
                <Reveal delay={80}>
                  <h2 className="lp-h-display-lg">Pré-alpha, e dizendo isso em voz alta</h2>
                </Reveal>
                <Reveal delay={140}>
                  <p className="lp-lede">
                    O caminho até a primeira versão utilizável tem sete etapas. Este é o estado de cada uma no
                    repositório hoje; o que vem depois do MVP está no{' '}
                    <a href={`${REPO}/blob/main/docs/ROADMAP.md`} target="_blank" rel="noreferrer noopener">
                      roteiro público
                    </a>
                    .
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <ol className="lp-timeline">
                    {[
                      { title: 'Fundação técnica e segurança', state: 'em andamento' },
                      { title: 'Cadastro, sessão e downloads autorizados', state: 'em andamento' },
                      { title: 'Electron seguro e primeiro acesso', state: 'em andamento' },
                      { title: 'Contas, categorias e obrigações', state: 'pronto' },
                      { title: 'Importação de OFX e CSV', state: 'pronto' },
                      { title: 'Categorização e conciliação', state: 'em andamento' },
                      { title: 'Dashboard e Saldo Livre de Risco', state: 'em andamento' },
                    ].map((item) => (
                      <li key={item.title} className={`lp-timeline-${item.state === 'pronto' ? 'done' : 'now'}`}>
                        <span className="lp-timeline-dot" aria-hidden="true">
                          <Icon name={item.state === 'pronto' ? 'bi-check2' : 'bi-circle-half'} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className="lp-state">{item.state}</span>
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
                <Icon name="bi-windows" />
                <div>
                  <h3>Windows</h3>
                  <p>Instalador assinado, publicado em GitHub Releases e liberado depois do login.</p>
                </div>
                <span className="lp-chip">Planejado</span>
              </Reveal>
              <Reveal as="article" delay={110} className="lp-platform">
                <Icon name="bi-ubuntu" />
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
        <section className="lp-section lp-section-sunken" id="contribuir">
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
                  <Icon name="bi-github" />
                  Ver o repositório
                </a>
                <a className="lp-btn" href={`${REPO}/issues`} target="_blank" rel="noreferrer noopener">
                  Abrir uma issue
                </a>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <p className="lp-tiny lp-muted lp-center-text">
                Código sob licença MIT. Os ícones vêm do Bootstrap Icons, também sob MIT.
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
                  <a href="#salas">O que já funciona</a>
                </li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h3>Projeto</h3>
              <ul>
                <li>
                  <a href={`${REPO}/blob/main/docs/ROADMAP.md`} target="_blank" rel="noreferrer noopener">
                    Roteiro
                  </a>
                </li>
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
