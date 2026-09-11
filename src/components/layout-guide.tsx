'use client';

/* Guia de layout: referência viva do sistema visual.
   Todo specimen usa as classes reais de globals.css: se o token mudar lá, muda aqui.
   Valores monetários são amostras de formatação, nunca dados de uma pessoa usuária. */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useApp } from '@/components/app-state';

const SECTIONS = [
  { id: 'fundacao', label: 'Fundação' },
  { id: 'layout', label: 'Layout' },
  { id: 'botoes', label: 'Botões e controles' },
  { id: 'cards', label: 'Cards e superfícies' },
  { id: 'status', label: 'Status e avisos' },
  { id: 'dados', label: 'Tabelas e campos' },
  { id: 'visualizacao', label: 'Visualização' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'estados', label: 'Estados obrigatórios' },
  { id: 'movimento', label: 'Movimento e acesso' },
  { id: 'regras', label: 'Regras e checklist' },
];

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Área de transferência indisponível: o trecho continua legível na tela.
    }
  };

  return (
    <div className="spec-code">
      <button type="button" className="spec-copy" onClick={copy}>
        <i className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'}`} aria-hidden="true" />
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Spec({
  title,
  hint,
  code,
  block = false,
  children,
}: {
  title: string;
  hint?: string;
  code?: string;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="spec">
      <div className="spec-head">
        <p className="spec-title">{title}</p>
        {hint && <p className="spec-hint">{hint}</p>}
      </div>
      <div className={block ? 'spec-demo spec-demo-block' : 'spec-demo'}>{children}</div>
      {code && <Code>{code}</Code>}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="guide-section" aria-labelledby={`${id}-title`}>
      <header className="guide-section-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="h-display-lg" id={`${id}-title`}>
          {title}
        </h2>
        {intro && <p className="muted">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

function Swatch({
  token,
  name,
  light,
  dark,
  use,
}: {
  token: string;
  name: string;
  light: string;
  dark: string;
  use: string;
}) {
  return (
    <div className="swatch">
      <span className="swatch-chip" style={{ background: `var(${token})` }} aria-hidden="true" />
      <div className="swatch-meta">
        <p className="swatch-name">{name}</p>
        <p className="swatch-token num">{token}</p>
        <p className="swatch-hex num">
          claro {light} · escuro {dark}
        </p>
        <p className="swatch-use">{use}</p>
      </div>
    </div>
  );
}

export function LayoutGuidePage() {
  const app = useApp();
  const [filtro, setFiltro] = useState('tudo');
  const [pressionado, setPressionado] = useState(true);

  return (
    <div className="stack-lg">
      <div className="callout callout-info">
        <i className="bi bi-compass" aria-hidden="true" />
        <div>
          <p className="callout-title">Referência interna de design</p>
          <p className="small">
            Esta página não faz parte do produto: ela existe para manter telas futuras coerentes com{' '}
            <strong>docs/BRANDING.md</strong>. Todos os componentes abaixo usam as classes reais da folha de
            estilo do aplicativo. Os valores monetários são amostras de formatação: nenhum dado financeiro,
            real ou fictício, é representado aqui.
          </p>
        </div>
      </div>

      <nav className="guide-toc" aria-label="Seções da guia">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      {/* ── Fundação ─────────────────────────────────────────────── */}

      <Section
        id="fundacao"
        eyebrow="01 · Fundação"
        title="Cor, tipografia e medidas"
        intro="A paleta é normativa. As cores semânticas são propostas e ainda precisam de validação de contraste antes de serem tratadas como definitivas."
      >
        <Spec
          title="Paleta principal"
          hint="Ordem de uso: 60% pergaminho, 30% ébano, 10% âmbar."
          block
        >
          <div className="swatch-grid">
            <Swatch token="--parchment" name="Alabastro" light="#F4F1EA" dark="não muda" use="Fundo da aplicação" />
            <Swatch token="--ebony" name="Ébano" light="#1A110A" dark="não muda" use="Texto e sidebar fixa" />
            <Swatch token="--amber" name="Âmbar clássico" light="#B8773D" dark="#B8773D" use="Ação primária e estado ativo" />
            <Swatch token="--graphite" name="Grafite" light="#4A4A4A" dark="não muda" use="Texto de apoio" />
            <Swatch token="--walnut" name="Nogueira" light="#5C4033" dark="#8A6A57" use="Profundidade e ênfase secundária" />
          </div>
        </Spec>

        <Spec
          title="Tokens de superfície"
          hint="São estes que o tema escuro troca. Nunca escreva um hex direto no componente."
          block
          code={`background: var(--surface);
color: var(--ink);
border: 1px solid var(--line);`}
        >
          <div className="swatch-grid">
            <Swatch token="--bg" name="Fundo" light="#F4F1EA" dark="#211E1A" use="Plano de fundo da página" />
            <Swatch token="--surface" name="Superfície" light="#FFFDF8" dark="#2A2622" use="Cards, topbar e diálogos" />
            <Swatch token="--sunken" name="Rebaixado" light="#EEE9DD" dark="#1D1A16" use="Trilhos, código e agrupadores" />
            <Swatch token="--ink" name="Tinta" light="#1A110A" dark="#F1ECE3" use="Texto primário" />
            <Swatch token="--ink2" name="Tinta secundária" light="#4A4A4A" dark="#B7B2A9" use="Metadados e legendas" />
            <Swatch token="--line" name="Linha" light="16% ébano" dark="14% claro" use="Bordas de card e divisores" />
          </div>
        </Spec>

        <Spec
          title="Cores semânticas"
          hint="Em aberto: contraste ainda não validado em WCAG 2.2 AA. Aviso e âmbar são vizinhos: exija sempre ícone e rótulo."
          block
        >
          <div className="swatch-grid">
            <Swatch token="--ok" name="Sucesso" light="#4A6741" dark="#8FB283" use="Conciliado, meta atingida, pilar equilibrado" />
            <Swatch token="--warn" name="Aviso" light="#8A6D1B" dark="#D9A93E" use="Vencimento próximo, dado desatualizado" />
            <Swatch token="--err" name="Erro" light="#8B1E1E" dark="#E08C8C" use="Falha, conta vencida, ação destrutiva" />
            <Swatch token="--info" name="Informação" light="#3E5C76" dark="#8FB4CE" use="Explicação de cálculo e contexto" />
          </div>
        </Spec>

        <Spec
          title="Escala tipográfica"
          hint="Playfair Display só em hierarquia de display. Montserrat em tudo que é operacional. No máximo três tamanhos por componente."
          block
        >
          <div className="type-scale">
            <div className="type-row">
              <p className="figure figure-hero"><span className="figure-symbol">R$</span><span className="figure-value">1.234,56</span></p>
              <p className="tiny muted num">.figure-hero · Montserrat · 38–56px · veredito da tela</p>
            </div>
            <div className="type-row">
              <p className="figure"><span className="figure-symbol">R$</span><span className="figure-value">1.234,56</span></p>
              <p className="tiny muted num">.figure · Montserrat · 30px · métrica de card</p>
            </div>
            <div className="type-row">
              <p className="h-display-lg">Título de seção</p>
              <p className="tiny muted num">.h-display-lg · Playfair · 28/36</p>
            </div>
            <div className="type-row">
              <p className="h-display">Título de card</p>
              <p className="tiny muted num">.h-display · Playfair · 22/30</p>
            </div>
            <div className="type-row">
              <p>Texto padrão da interface, em Montserrat.</p>
              <p className="tiny muted num">body · Montserrat · 16/24</p>
            </div>
            <div className="type-row">
              <p className="small muted">Apoio, metadado e explicação curta.</p>
              <p className="tiny muted num">.small · 13/19 · .tiny · 12/19</p>
            </div>
            <div className="type-row">
              <p className="eyebrow">Rótulo de seção</p>
              <p className="tiny muted num">.eyebrow · 12px · caixa alta · +0,08em</p>
            </div>
          </div>
        </Spec>

        <Spec title="Espaçamento" hint="Base de 4px. 16 e 24 dentro do componente, 32 e 48 entre grupos, 64 entre seções." block>
          <div className="scale-strip">
            {[4, 8, 12, 16, 24, 32, 48, 64, 96].map((value) => (
              <div key={value} className="scale-item">
                <span className="scale-bar" style={{ width: value }} aria-hidden="true" />
                <span className="tiny muted num">{value}</span>
              </div>
            ))}
          </div>
        </Spec>

        <Spec
          title="Raio, elevação e foco"
          hint="Nunca use 0px nem acima de 12px. Prefira borda a sombra; sombra grande só em diálogo e drawer."
          block
        >
          <div className="row">
            <div className="radius-demo" style={{ borderRadius: 'var(--radius-sm)' }}>
              <span className="tiny num">--radius-sm · 4px</span>
              <span className="tiny muted">tags, células, chips</span>
            </div>
            <div className="radius-demo" style={{ borderRadius: 'var(--radius-md)' }}>
              <span className="tiny num">--radius-md · 6px</span>
              <span className="tiny muted">botões, campos, cards padrão</span>
            </div>
            <div className="radius-demo" style={{ borderRadius: 'var(--radius-lg)' }}>
              <span className="tiny num">--radius-lg · 8px</span>
              <span className="tiny muted">painéis, diálogos</span>
            </div>
            <div className="radius-demo" style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
              <span className="tiny num">--shadow-md</span>
              <span className="tiny muted">apenas overlays</span>
            </div>
          </div>
        </Spec>

        <Spec
          title="Iconografia"
          hint="Família única: Bootstrap Icons. Ícone nunca é o rótulo único de uma ação não familiar."
          code={`<i className="bi bi-receipt" aria-hidden="true" />`}
        >
          {['bi-speedometer2', 'bi-receipt', 'bi-check2-square', 'bi-columns-gap', 'bi-newspaper', 'bi-clock-history', 'bi-cloud-arrow-up', 'bi-shield-lock'].map(
            (icon) => (
              <span key={icon} className="icon-cell">
                <i className={`bi ${icon}`} aria-hidden="true" />
                <span className="tiny muted num">{icon}</span>
              </span>
            ),
          )}
        </Spec>
      </Section>

      {/* ── Layout ───────────────────────────────────────────────── */}

      <Section
        id="layout"
        eyebrow="02 · Layout"
        title="Estrutura da página"
        intro="A sidebar Ébano é âncora estrutural fixa e não participa do tema. No escuro, a separação entre sidebar e conteúdo vem da borda, não do contraste de fundo."
      >
        <Spec title="Anatomia do shell" hint="Grade de duas colunas; só a coluna de conteúdo rola." block>
          <div className="shell-map" aria-hidden="true">
            <div className="shell-map-side">
              <span>marca</span>
              <span>conta ativa</span>
              <span className="shell-map-strong">navegação</span>
              <span>importação</span>
              <span>configurações</span>
            </div>
            <div className="shell-map-main">
              <div className="shell-map-top">topbar · título, contexto e ações globais</div>
              <div className="shell-map-content">
                <span className="shell-map-strong">.content-inner · máx. 1440px</span>
                <span>abas contextuais quando existirem</span>
                <span>view financeira principal</span>
              </div>
            </div>
          </div>
        </Spec>

        <Spec
          title="Composição de uma página autenticada"
          hint="Nesta ordem, sempre. No máximo uma ação primária por tela."
          block
          code={`<div className="stack-lg">
  <section className="card card-lg verdict"> ... </section>
  <section className="grid grid-260"> ... </section>
  <section className="card"> ... </section>
  <p className="note">Origem do dado e limitação conhecida.</p>
</div>`}
        >
          <ol className="guide-list num-list">
            <li>Navegação primária estável (sidebar).</li>
            <li>Cabeçalho com título, contexto conciso e no máximo uma ação primária.</li>
            <li>Filtros ou métricas de resumo, quando ajudarem.</li>
            <li>A view financeira principal.</li>
            <li>Detalhe contextual apenas quando apoia a tarefa ativa.</li>
          </ol>
        </Spec>

        <Spec
          title="Grades e pilhas"
          hint="Prefira as grades prontas a inventar colunas. Todas colapsam para uma coluna em 1040px."
          block
          code={`<div className="grid grid-320"> ... </div>
<div className="stack-lg"> ... </div>
<div className="row-between"> ... </div>`}
        >
          <div className="grid grid-230">
            {['grid-230', 'grid-240', 'grid-260', 'grid-300', 'grid-320', 'grid-340'].map((name) => (
              <div key={name} className="grid-demo-cell num">
                .{name}
              </div>
            ))}
          </div>
        </Spec>

        <Spec
          title="Abas contextuais"
          hint="Sub-navegação de uma área. Vive acima do conteúdo, nunca dentro de um card."
          code={`<div role="tablist" className="tabs">
  <a href="/extratos" role="tab" aria-selected="true">Lançamentos</a>
</div>`}
          block
        >
          <div role="tablist" className="tabs" style={{ marginBottom: 0 }}>
            <a href="#layout" role="tab" aria-selected="true">
              Lançamentos
            </a>
            <a href="#layout" role="tab" aria-selected="false">
              Cartões e benefícios
            </a>
            <a href="#layout" role="tab" aria-selected="false">
              Faturas e recorrências
            </a>
          </div>
        </Spec>
      </Section>

      {/* ── Botões ───────────────────────────────────────────────── */}

      <Section
        id="botoes"
        eyebrow="03 · Controles"
        title="Botões e seletores"
        intro="Âmbar preenchido identifica a única ação primária da view. Estilo destrutivo é exclusivo de ações destrutivas: âmbar nunca significa erro."
      >
        <Spec
          title="Hierarquia de botões"
          code={`<button className="btn btn-primary">Importar extrato</button>
<button className="btn btn-neutral">Cadastrar posição</button>
<button className="btn">Filtrar</button>
<button className="btn btn-danger">Desfazer lote</button>
<button className="btn-link">Entender o cálculo</button>`}
        >
          <button type="button" className="btn btn-primary">
            <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
            Importar extrato
          </button>
          <button type="button" className="btn btn-neutral">
            Cadastrar posição
          </button>
          <button type="button" className="btn">
            Filtrar
          </button>
          <button type="button" className="btn btn-danger">
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
            Desfazer lote
          </button>
          <button type="button" className="btn-link">
            Entender o cálculo
            <i className="bi bi-arrow-right-short" aria-hidden="true" />
          </button>
          <button type="button" className="btn-quiet">
            Pular
          </button>
        </Spec>

        <Spec
          title="Tamanhos e estados"
          hint="Foco visível é obrigatório: anel âmbar com 3px de afastamento. Desabilitado precisa explicar o motivo ao lado."
          code={`<button className="btn btn-sm">Ação compacta</button>
<button className="btn btn-primary" disabled>Importando…</button>`}
        >
          <button type="button" className="btn btn-sm">
            <i className="bi bi-cash-coin" aria-hidden="true" />
            Lançar dinheiro
          </button>
          <button type="button" className="btn btn-primary" disabled>
            Importando…
          </button>
          <button type="button" className="btn" disabled>
            Simular aporte
          </button>
          <span className="tiny muted">Desabilitado: cadastre o patrimônio antes de simular.</span>
        </Spec>

        <Spec
          title="Seletores de contexto"
          hint="Alternância entre visões da mesma tela. Use aria-pressed, não apenas cor."
          code={`<div className="segmented">
  <button aria-pressed="true">Tudo</button>
  <button aria-pressed="false">Minha carteira</button>
</div>`}
        >
          <div className="segmented">
            {['tudo', 'carteira', 'macro'].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filtro === value}
                onClick={() => setFiltro(value)}
              >
                {value === 'tudo' ? 'Mercado geral' : value === 'carteira' ? 'Minha carteira' : 'Macro'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chip-toggle"
            aria-pressed={pressionado}
            onClick={() => setPressionado((current) => !current)}
          >
            Somente pendentes
          </button>
          <button type="button" className="icon-button" aria-label="Notificações">
            <i className="bi bi-bell" aria-hidden="true" />
          </button>
        </Spec>

        <Spec
          title="Escolha em lista"
          hint="Item de largura total para seleção sequencial: conta, categoria, instituição."
          block
          code={`<button className="pick">
  <i className="bi bi-bank" aria-hidden="true" />
  Conta corrente
</button>`}
        >
          <div className="stack" style={{ gap: 8, width: 'min(360px, 100%)' }}>
            <button type="button" className="pick">
              <i className="bi bi-bank" aria-hidden="true" />
              Selecionar instituição
            </button>
            <button type="button" className="pick">
              <i className="bi bi-tag" aria-hidden="true" />
              Selecionar categoria
            </button>
          </div>
        </Spec>
      </Section>

      {/* ── Cards ────────────────────────────────────────────────── */}

      <Section
        id="cards"
        eyebrow="04 · Superfícies"
        title="Cards e painéis"
        intro="Card agrupa informação que pertence junta. Não aninhe camadas de card e prefira espaçamento interno a separador decorativo."
      >
        <Spec
          title="Densidades"
          hint=".card-sm 22px · .card 24px · .card-lg 28px. A escolha é do peso da informação, não do tamanho da tela."
          block
        >
          <div className="grid grid-260">
            <article className="card card-sm">
              <p className="eyebrow">Compacto</p>
              <p className="small muted">Métrica de apoio, contador, item de lista.</p>
            </article>
            <article className="card">
              <p className="eyebrow">Padrão</p>
              <p className="small muted">A maior parte das superfícies do produto.</p>
            </article>
            <article className="card card-lg">
              <p className="eyebrow">Destacado</p>
              <p className="small muted">Métrica central e primeiro passo de um fluxo.</p>
            </article>
          </div>
        </Spec>

        <Spec
          title="Card de métrica"
          hint="Rótulo, número, origem do dado e: quando existir: a ação que o alimenta."
          block
          code={`<section className="card card-lg verdict">
  <p className="eyebrow">Saldo Livre de Risco · 1 a 30 de setembro</p>
  <p className="figure figure-hero">
    <span className="figure-symbol">R$</span>
    <span className="figure-value">1.234,56</span>
  </p>
  <p className="verdict-formula">saldo em conta menos o que já está comprometido</p>
</section>`}
        >
          <div className="grid grid-300">
            <article className="card card-lg">
              <p className="eyebrow">Saldo livre de risco</p>
              <p className="figure figure-hero"><span className="figure-symbol">R$</span><span className="figure-value">1.234,56</span></p>
              <p className="small muted">
                Amostra de formatação. Na tela real, o período e o que foi descontado precisam ser abríveis.
              </p>
              <button type="button" className="btn-link">
                Entender o cálculo
              </button>
            </article>
            <article className="card">
              <p className="eyebrow">Média de gastos diária</p>
              <p className="figure"><span className="figure-symbol">R$</span><span className="figure-value">85,00</span></p>
              <p className="small muted">Calculada pelo backend no mês atual.</p>
              <span className="chip">
                <i className="bi bi-dash" aria-hidden="true" />
                Sem meta configurada
              </span>
            </article>
          </div>
        </Spec>

        <Spec
          title="Cabeçalho, rodapé e card sem respiro"
          hint="Use .card-flush quando o conteúdo for uma tabela que precisa encostar nas bordas."
          block
          code={`<section className="card card-flush">
  <div className="card-header"><h2 className="h-display">Título</h2></div>
  ...
  <div className="card-footer"> ... </div>
</section>`}
        >
          <section className="card card-flush" style={{ width: '100%' }}>
            <div className="card-header">
              <h3 className="h-display">Lançamentos do lote</h3>
              <span className="chip chip-info">
                <i className="bi bi-funnel" aria-hidden="true" />
                Filtro aplicado
              </span>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <p className="small muted">Conteúdo do card sem preenchimento automático.</p>
            </div>
            <div className="card-footer">
              <span className="tiny muted">Amostra de rodapé</span>
              <button type="button" className="btn btn-sm">
                Ver todos
              </button>
            </div>
          </section>
        </Spec>
      </Section>

      {/* ── Status ───────────────────────────────────────────────── */}

      <Section
        id="status"
        eyebrow="05 · Sinalização"
        title="Chips, tags e avisos"
        intro="Nenhum estado é comunicado só por cor: sempre rótulo textual e, quando possível, ícone. Cores de status vêm de token central, nunca definidas na tela."
      >
        <Spec
          title="Chips de estado"
          code={`<span className="chip chip-ok"><i className="bi bi-check2" />Conciliado</span>`}
        >
          <span className="chip">
            <i className="bi bi-database" aria-hidden="true" />
            Neutro
          </span>
          <span className="chip chip-ok">
            <i className="bi bi-check2" aria-hidden="true" />
            Conciliado
          </span>
          <span className="chip chip-warn">
            <i className="bi bi-cone-striped" aria-hidden="true" />
            Vence hoje
          </span>
          <span className="chip chip-err">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            Falha na importação
          </span>
          <span className="chip chip-info chip-lg">
            <i className="bi bi-wifi-off" aria-hidden="true" />
            Offline: dados financeiros disponíveis
          </span>
          <span className="tag">OFX</span>
        </Spec>

        <Spec
          title="Blocos de aviso"
          hint="Callout explica uma condição da tela. Erro diz o que aconteceu e qual é o próximo passo: nunca detalhe técnico."
          block
          code={`<div className="callout callout-warn">
  <i className="bi bi-cone-striped" aria-hidden="true" />
  <div>
    <p className="callout-title">Título curto</p>
    <p className="small">Explicação objetiva e próximo passo.</p>
  </div>
</div>`}
        >
          <div className="stack" style={{ width: '100%' }}>
            <div className="callout callout-info">
              <i className="bi bi-hdd" aria-hidden="true" />
              <p className="small">Seus dados financeiros permanecem no SQLite deste dispositivo.</p>
            </div>
            <div className="callout callout-warn">
              <i className="bi bi-cone-striped" aria-hidden="true" />
              <div>
                <p className="callout-title">Backup cifrado</p>
                <p className="small">Planejado. Nenhum backup foi criado ou enviado até aqui.</p>
              </div>
            </div>
            <div className="callout callout-err">
              <i className="bi bi-x-octagon" aria-hidden="true" />
              <div>
                <p className="callout-title">Ação não validada</p>
                <p className="small">A ação não pôde ser validada. Tente novamente.</p>
              </div>
            </div>
            <div className="callout callout-ok">
              <i className="bi bi-check2-circle" aria-hidden="true" />
              <p className="small">Lote importado. Nenhum item ficou pendente de conciliação.</p>
            </div>
          </div>
        </Spec>

        <Spec title="Faixa de modo de sobrevivência" hint="Estado global do produto. Evidente sem ser punitivo, sem linguagem lúdica." block>
          <div role="status" className="survival-banner" style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--err)' }}>
            <i className="bi bi-shield-exclamation" aria-hidden="true" />
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600 }}>Modo de sobrevivência ativo</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: '19px' }}>
                Sugestões de aporte ficam pausadas enquanto este modo estiver ativo.
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-neutral">
              Ver obrigações
            </button>
          </div>
        </Spec>
      </Section>

      {/* ── Tabelas e campos ─────────────────────────────────────── */}

      <Section
        id="dados"
        eyebrow="06 · Dados"
        title="Tabelas e formulários"
        intro="Número sempre alinhado à direita e com tabular-nums. Rótulo acima do controle. Erro de validação ao lado do campo afetado."
      >
        <Spec
          title="Tabela de resumo"
          hint=".tbl para pares rótulo/valor dentro de um card."
          block
          code={`<table className="tbl">
  <tr><th scope="row">Conta corrente</th><td className="num">R$ 1.234,56</td></tr>
</table>`}
        >
          <table className="tbl" style={{ width: '100%' }}>
            <caption>Amostra de formatação: não representa contas reais</caption>
            <tbody>
              <tr>
                <th scope="row">Conta corrente</th>
                <td className="num">R$ 1.234,56</td>
              </tr>
              <tr>
                <th scope="row">Conta de pagamento</th>
                <td className="num">R$ 320,00</td>
              </tr>
              <tr className="total">
                <th scope="row">Total</th>
                <td className="num">R$ 1.554,56</td>
              </tr>
            </tbody>
          </table>
        </Spec>

        <Spec
          title="Lista financeira"
          hint=".grid-table dentro de .card-flush. Cabeçalho fixo, agrupamento por dia e linha selecionada em âmbar suave."
          block
          code={`<div className="card card-flush">
  <div className="scroll-x">
    <table className="grid-table"> ... </table>
  </div>
</div>`}
        >
          <div className="card card-flush" style={{ width: '100%' }}>
            <div className="scroll-x">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th scope="col">Descrição</th>
                    <th scope="col">Categoria</th>
                    <th scope="col" className="right">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="daygroup">
                    <th colSpan={3} scope="colgroup">
                      12 de março
                    </th>
                  </tr>
                  <tr className="selected">
                    <td>
                      Estabelecimento de amostra
                      <span className="cell-sub">Importado do lote 001</span>
                    </td>
                    <td>
                      <span className="chip chip-warn">
                        <i className="bi bi-question-circle" aria-hidden="true" />
                        Confiança baixa
                      </span>
                    </td>
                    <td className="num">-R$ 85,00</td>
                  </tr>
                  <tr>
                    <td>
                      Outro estabelecimento
                      <span className="cell-sub">Regra local aplicada</span>
                    </td>
                    <td>
                      <span className="chip chip-ok">
                        <i className="bi bi-check2" aria-hidden="true" />
                        Classificado
                      </span>
                    </td>
                    <td className="num">-R$ 42,10</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Spec>

        <Spec
          title="Campos"
          hint=".field-amount para valores; sempre em centavos no backend, nunca Float."
          block
          code={`<label className="field">Categoria
  <select> ... </select>
</label>`}
        >
          <div className="grid grid-260" style={{ width: '100%' }}>
            <label className="field">
              Categoria
              <select defaultValue="">
                <option value="">Selecione</option>
                <option>Alimentação</option>
                <option>Transporte</option>
              </select>
            </label>
            <label className="field field-sunken">
              Data de referência
              <input type="date" />
            </label>
            <label className="field field-amount">
              Valor
              <input inputMode="decimal" placeholder="R$ 0,00" />
            </label>
          </div>
        </Spec>
      </Section>

      {/* ── Visualização ─────────────────────────────────────────── */}

      <Section
        id="visualizacao"
        eyebrow="07 · Visualização"
        title="Progresso e gráficos"
        intro="Todo gráfico precisa de leitura textual equivalente. A faixa de equilíbrio dos pilares é 22,5% a 27,5% e deve ser visível como zona, com rótulo."
      >
        <Spec
          title="Barras de progresso"
          block
          code={`<div className="bar"><div className="bar-fill" style={{ width: '68%' }} /></div>`}
        >
          <div className="stack" style={{ width: '100%', gap: 14 }}>
            <div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="small">Orçamento consumido</span>
                <span className="small num muted">68%</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: '68%' }} />
              </div>
            </div>
            <div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="small">Termômetro de isenção</span>
                <span className="small num muted">42%</span>
              </div>
              <div className="bar bar-lg">
                <div className="bar-fill bar-fill-walnut" style={{ width: '42%' }} />
              </div>
            </div>
          </div>
        </Spec>

        <Spec
          title="Pilar com banda de equilíbrio"
          hint="A zona verde marca 22,5%–27,5%. Fora dela, o rótulo diz defasado ou sobrecarregado: a cor sozinha não basta."
          block
          code={`<div className="pillar-track">
  <span className="pillar-band" />
  <div className="pillar-fill pillar-fill-priority" style={{ width: '50%' }} />
</div>`}
        >
          <div className="stack" style={{ width: '100%', gap: 14 }}>
            <div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="small">Ativos internacionais</span>
                <span className="chip chip-warn">
                  <i className="bi bi-arrow-down" aria-hidden="true" />
                  Defasado · 17,5%
                </span>
              </div>
              <div className="pillar-track">
                <span className="pillar-band" aria-hidden="true" />
                <div className="pillar-fill pillar-fill-priority" style={{ width: '50%' }} />
              </div>
            </div>
            <div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="small">Caixa</span>
                <span className="chip chip-ok">
                  <i className="bi bi-check2" aria-hidden="true" />
                  Equilibrado · 25,0%
                </span>
              </div>
              <div className="pillar-track">
                <span className="pillar-band" aria-hidden="true" />
                <div className="pillar-fill" style={{ width: '71.4%' }} />
              </div>
            </div>
            <div className="row-tight">
              <span className="legend">
                <span className="legend-swatch" style={{ background: 'var(--walnut)' }} aria-hidden="true" />
                Posição atual
              </span>
              <span className="legend">
                <span className="legend-swatch" style={{ background: 'rgb(74 103 65 / 40%)' }} aria-hidden="true" />
                Faixa de equilíbrio
              </span>
              <span className="legend">
                <span className="legend-swatch" style={{ background: 'var(--amber)' }} aria-hidden="true" />
                Prioridade do próximo aporte
              </span>
            </div>
          </div>
        </Spec>

        <Spec title="Gráfico de barras" hint="Amostra de proporção. Sempre acompanhe de tabela ou lista com os mesmos valores." block>
          <div style={{ width: '100%' }}>
            <div className="chart">
              {[42, 58, 35, 70, 52, 64, 48, 60].map((height, index) => (
                <div key={index} className="chart-col">
                  <div className="chart-bars">
                    <div style={{ height: `${height}%`, background: 'var(--walnut)' }} />
                    <div style={{ height: `${Math.max(12, height - 18)}%`, background: 'var(--amber)' }} />
                  </div>
                  <span className="chart-label">M{index + 1}</span>
                </div>
              ))}
            </div>
            <div className="row-tight" style={{ marginTop: 12 }}>
              <span className="legend">
                <span className="legend-swatch" style={{ background: 'var(--walnut)' }} aria-hidden="true" />
                Gastos
              </span>
              <span className="legend">
                <span className="legend-swatch" style={{ background: 'var(--amber)' }} aria-hidden="true" />
                Aportes
              </span>
            </div>
          </div>
        </Spec>

        <Spec title="Timeline" hint="Trilha de eventos. Nunca guarda segredo, token ou conteúdo bruto do extrato." block>
          <ul className="timeline" style={{ width: '100%' }}>
            <li>
              <span className="timeline-line" aria-hidden="true" />
              <span className="timeline-dot">
                <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
              </span>
              <div>
                <p className="small">
                  <strong>Importação concluída</strong>
                </p>
                <p className="tiny muted">Evento de amostra · lote registrado no banco local</p>
              </div>
            </li>
            <li>
              <span className="timeline-dot">
                <i className="bi bi-check2-square" aria-hidden="true" />
              </span>
              <div>
                <p className="small">
                  <strong>Conciliação revertida</strong>
                </p>
                <p className="tiny muted">Decisão anterior preservada com antes e depois</p>
              </div>
            </li>
          </ul>
        </Spec>
      </Section>

      {/* ── Overlays ─────────────────────────────────────────────── */}

      <Section
        id="overlays"
        eyebrow="08 · Sobreposições"
        title="Diálogos, drawer e importação"
        intro="Sobreposição fecha com Esc e com clique no scrim. Diálogo usa role=dialog, aria-modal e nome acessível."
      >
        <Spec
          title="Abrir os overlays reais"
          hint="Estes são os componentes do aplicativo, não uma reprodução."
          code={`const app = useApp();
app.openImport();      // diálogo de importação
app.open('notif');     // drawer de notificações`}
        >
          <button type="button" className="btn btn-primary" onClick={app.openImport}>
            <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
            Diálogo de importação
          </button>
          <button type="button" className="btn" onClick={() => app.open('notif')}>
            Drawer de notificações
          </button>
          <button type="button" className="btn" onClick={() => app.open('onboarding')}>
            Diálogo de primeiro acesso
          </button>
        </Spec>

        <Spec
          title="Larguras de diálogo"
          block
          code={`.dialog      → 420px · confirmação e recado curto
.dialog-md   → 680px · fluxo com formulário
.dialog-lg   → 880px · primeiro acesso e revisão`}
        >
          <div className="row">
            {[
              { name: '.dialog', size: '420px', use: 'confirmação' },
              { name: '.dialog-md', size: '680px', use: 'fluxo com formulário' },
              { name: '.dialog-lg', size: '880px', use: 'revisão longa' },
            ].map((item) => (
              <div key={item.name} className="radius-demo">
                <span className="tiny num">{item.name}</span>
                <span className="tiny muted num">{item.size}</span>
                <span className="tiny muted">{item.use}</span>
              </div>
            ))}
          </div>
        </Spec>

        <Spec title="Área de importação e trilha de etapas" block>
          <div style={{ width: '100%' }}>
            <div className="step-track" style={{ marginTop: 0 }}>
              <div className="done" />
              <div className="done" />
              <div />
            </div>
            <div className="dropzone">
              <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
              <p>
                <strong>Arraste um arquivo CSV ou OFX</strong>
              </p>
              <p className="small muted">Formatos aceitos e limite de tamanho precisam estar visíveis neste estado.</p>
              <button type="button" className="btn btn-primary">
                Escolher arquivo
              </button>
            </div>
          </div>
        </Spec>
      </Section>

      {/* ── Estados ──────────────────────────────────────────────── */}

      <Section
        id="estados"
        eyebrow="09 · Estados"
        title="Nenhuma tela fica pronta sem estes sete"
        intro="Vazio, carregando, erro, sem resultados, offline, desabilitado e sucesso. Vazio e sem resultados são coisas diferentes."
      >
        <Spec title="Vazio" hint="Explica o que aparecerá ali e oferece a ação que preenche." block>
          <section className="card card-lg empty" style={{ width: '100%' }}>
            <i className="bi bi-receipt" aria-hidden="true" />
            <h3 className="h-display">Nenhum lançamento</h3>
            <p className="muted">As transações aparecerão somente depois de persistidas pelo backend local.</p>
            <button type="button" className="btn btn-primary">
              Importar extrato
            </button>
          </section>
        </Spec>

        <Spec title="Carregando" hint="Sem salto de layout ao concluir: o esqueleto ocupa a altura final." block>
          <div className="card card-flush" style={{ width: '100%', padding: '18px 22px' }}>
            {[70, 45, 60].map((width, index) => (
              <div key={index} className="skeleton-row">
                <span className="skeleton-bar" style={{ width: `${width}%` }} />
                <span className="skeleton-bar" style={{ width: 64, marginLeft: 'auto' }} />
              </div>
            ))}
          </div>
        </Spec>

        <Spec title="Erro e sem resultados" block>
          <div className="grid grid-320" style={{ width: '100%' }}>
            <section className="card empty">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <h3 className="h-display">Não foi possível consultar</h3>
              <p className="muted">O backend local não respondeu. Tente novamente em instantes.</p>
              <button type="button" className="btn btn-neutral">
                Tentar novamente
              </button>
            </section>
            <section className="card empty">
              <i className="bi bi-funnel" aria-hidden="true" />
              <h3 className="h-display">Nenhum resultado</h3>
              <p className="muted">Nenhum lançamento corresponde aos filtros aplicados.</p>
              <button type="button" className="btn btn-neutral">
                Limpar filtros
              </button>
            </section>
          </div>
        </Spec>

        <Spec
          title="Offline"
          hint="O produto é local-first: quase tudo continua funcionando. Diga o que segue disponível, não apenas o que caiu."
          block
        >
          <div className="callout callout-info" style={{ width: '100%' }}>
            <i className="bi bi-wifi-off" aria-hidden="true" />
            <div>
              <p className="callout-title">Sem conexão</p>
              <p className="small">
                Extratos, conciliação e dashboard continuam disponíveis. Notícias, resumos e backup voltam quando a
                rede retornar.
              </p>
            </div>
          </div>
        </Spec>
      </Section>

      {/* ── Movimento ────────────────────────────────────────────── */}

      <Section
        id="movimento"
        eyebrow="10 · Movimento e acesso"
        title="Animação contida e acessibilidade real"
        intro="O movimento confirma causa e efeito. Ele não decora e não pode ser o único sinal de que algo aconteceu."
      >
        <Spec title="Durações" block>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th scope="col">Uso</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Duração
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Micro-interação (hover, foco, chip)</th>
                <td className="num">120–200ms</td>
              </tr>
              <tr>
                <th scope="row">Transição de painel, drawer e diálogo</th>
                <td className="num">200–300ms</td>
              </tr>
              <tr>
                <th scope="row">Bounce, elástico, parallax, animação contínua</th>
                <td>proibido</td>
              </tr>
            </tbody>
          </table>
        </Spec>

        <Spec title="Regras de acessibilidade" hint="Verificadas em toda revisão de tela." block>
          <ul className="guide-list">
            <li>Contraste WCAG 2.2 AA em texto e elementos interativos.</li>
            <li>Foco de teclado visível e distinto da borda do componente.</li>
            <li>Ordem de foco lógica e navegação completa por teclado.</li>
            <li>HTML semântico antes de ARIA; nome acessível em todo controle.</li>
            <li>Cor, posição ou movimento nunca comunicam sozinhos.</li>
            <li>Zoom de texto até 200% e refluxo sem perda de função.</li>
            <li>
              <code>prefers-reduced-motion</code> já desativa transições na folha de estilo global.
            </li>
          </ul>
        </Spec>
      </Section>

      {/* ── Regras ───────────────────────────────────────────────── */}

      <Section
        id="regras"
        eyebrow="11 · Governança"
        title="Proibições, decisões e checklist"
        intro="Exceções precisam de motivo registrado e validação em revisão de design. Token novo entra centralmente, nunca como valor solto na tela."
      >
        <Spec title="Proibido" block>
          <div className="grid grid-320" style={{ width: '100%' }}>
            <div className="callout callout-err">
              <i className="bi bi-slash-circle" aria-hidden="true" />
              <div>
                <p className="callout-title">Visual</p>
                <ul className="guide-list small">
                  <li>Gradiente brilhante, glassmorphism, neon, sombra pesada.</li>
                  <li>Canto 0px ou acima de 12px, fora de badge compacto.</li>
                  <li>Misturar famílias de ícone.</li>
                  <li>Mais de uma ação primária em âmbar por view.</li>
                  <li>Âmbar como cor de erro.</li>
                </ul>
              </div>
            </div>
            <div className="callout callout-err">
              <i className="bi bi-shield-lock" aria-hidden="true" />
              <div>
                <p className="callout-title">Conteúdo</p>
                <ul className="guide-list small">
                  <li>Stack trace, SQL, caminho local ou token em mensagem de erro.</li>
                  <li>Dado financeiro fictício apresentado como se fosse da pessoa.</li>
                  <li>Funcionalidade planejada exibida como pronta.</li>
                  <li>Sugerir venda de ativo para rebalancear.</li>
                  <li>Sugestão de aporte apresentada como recomendação individual.</li>
                </ul>
              </div>
            </div>
          </div>
        </Spec>

        <Spec title="Decisões ainda em aberto" hint="Resolver antes de tratar o item como normativo." block>
          <ul className="guide-list">
            <li>Contraste das quatro cores semânticas ainda não foi validado em WCAG 2.2 AA.</li>
            <li>Aviso e âmbar são vizinhos de matiz: hoje a distinção depende de ícone e rótulo obrigatórios.</li>
            <li>No tema escuro, sidebar Ébano e fundo quase se igualam: a separação vem da borda.</li>
            <li>Estado de carregamento de botão ainda não tem tratamento próprio na folha de estilo.</li>
            <li>A landing page não tem layout especificado em nenhum documento do repositório.</li>
          </ul>
        </Spec>

        <Spec title="Checklist de revisão" hint="Uma tela só está pronta quando todas as linhas passam." block>
          <ul className="guide-list check-list">
            <li>A tela tem uma tarefa primária clara.</li>
            <li>A composição parece clara, estruturalmente escura e seletivamente acentuada.</li>
            <li>Âmbar está restrito a ênfase e ação significativas.</li>
            <li>Playfair só na hierarquia de display; Montserrat legível no operacional.</li>
            <li>Alinhamento segue o grid e a escala de espaçamento.</li>
            <li>Raios entre 4px e 8px; sombra e decoração contidas.</li>
            <li>Os sete estados obrigatórios estão desenhados.</li>
            <li>Teclado, contraste, zoom e movimento reduzido verificados.</li>
            <li>Nenhum estado é comunicado apenas por cor.</li>
            <li>Nenhum dado sensível, caminho interno ou detalhe de implementação aparece na tela.</li>
            <li>Nada planejado é apresentado como pronto.</li>
          </ul>
        </Spec>
      </Section>

      <p className="note">
        Os tokens e classes desta página vivem na folha de estilo global do aplicativo e derivam de{' '}
        <strong>docs/BRANDING.md</strong>. Ao mudar um token, atualize os dois lugares no mesmo change set.{' '}
        <Link href="/configuracoes">Voltar às configurações</Link>
      </p>
    </div>
  );
}
