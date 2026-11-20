'use client';

/* Avisos jurídicos curtos da landing page, em janela modal: cookies, aviso
   financeiro e segurança.

   Termos de Uso e Política de Privacidade têm páginas próprias (/termos e
   /privacidade, em legal-documents.tsx), porque são aceitos no cadastro e
   precisam de endereço estável. MINUTA: estes textos ainda passam por revisão
   jurídica, e nenhuma cláusula pode descrever como pronto algo planejado. */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icon';

const VERSAO = 'Versão 0.1 · 5 de setembro de 2026';

type Documento = { id: string; rotulo: string; titulo: string; corpo: ReactNode };

const DOCUMENTOS: Documento[] = [
  {
    id: 'cookies',
    rotulo: 'Cookies',
    titulo: 'Política de Cookies e tecnologias similares',
    corpo: (
      <>
        <h4>1. Situação atual</h4>
        <p>
          Este site <strong>não utiliza</strong> cookies de análise, de publicidade, de redes sociais ou de
          rastreamento entre sites. Não há pixel de conversão, mapa de calor, gravação de sessão nem identificador
          persistente de visitante.
        </p>

        <h4>2. Armazenamento local</h4>
        <p>
          O aplicativo desktop pode gravar preferências de interface, como o tema escolhido, no armazenamento local do
          próprio dispositivo. Esses valores não são enviados a servidor algum e podem ser apagados pelo usuário nas
          configurações do navegador ou do sistema.
        </p>

        <h4>3. Cookies estritamente necessários</h4>
        <p>
          Quem entra na conta recebe cookies próprios (first-party), com atributos <code>Secure</code>,{' '}
          <code>HttpOnly</code> e <code>SameSite</code>, usados só para manter a sessão e proteger contra requisições
          forjadas. A lista completa, com a duração de cada um, está na{' '}
          <a href="/privacidade">Política de Privacidade</a>.
        </p>

        <h4>4. Gerenciamento</h4>
        <p>
          O usuário pode bloquear ou remover cookies a qualquer momento nas configurações do navegador. Sem os cookies
          necessários não é possível entrar na conta.
        </p>
      </>
    ),
  },
  {
    id: 'financeiro',
    rotulo: 'Aviso financeiro',
    titulo: 'Aviso de ausência de recomendação de investimento',
    corpo: (
      <>
        <h4>1. Finalidade educacional</h4>
        <p>
          Todo o conteúdo deste site e do Software tem finalidade informativa e educacional. Nada aqui constitui
          oferta, solicitação, análise, consultoria, gestão de carteira, recomendação de compra ou venda de ativos, ou
          promessa de resultado.
        </p>

        <h4>2. Metodologia citada</h4>
        <p>
          A metodologia de alocação em quatro pilares referida como ARCA foi idealizada por Thiago Nigro (Primo Rico).
          A citação é referencial e educativa, com atribuição ao autor, e não implica afiliação, parceria, patrocínio,
          endosso ou revisão por parte dele ou de suas empresas. O Talentum não representa a metodologia de forma
          oficial.
        </p>

        <h4>3. Natureza dos cálculos</h4>
        <p>
          Indicadores como o Saldo Livre de Risco, a média de gastos, a banda de equilíbrio entre 22,5% e 27,5% e a
          simulação de aporte são operações aritméticas sobre dados informados ou importados pelo próprio usuário. Não
          consideram perfil de risco, objetivos, horizonte, situação patrimonial, tributação, custos de corretagem nem
          condições de mercado. Erros de importação, classificação ou preenchimento produzem resultados incorretos.
        </p>

        <h4>4. Risco</h4>
        <p>
          Investimentos envolvem risco, inclusive de perda integral do capital. Rentabilidade passada não representa
          garantia de rentabilidade futura. Antes de decidir, o usuário deve buscar profissional habilitado e
          registrado nos órgãos competentes.
        </p>

        <h4>5. Sem intermediação</h4>
        <p>
          O Talentum não executa ordens, não custodia recursos, não movimenta contas, não se conecta a corretoras para
          negociar e não recebe remuneração de emissores, distribuidores ou plataformas por indicação de produtos.
        </p>
      </>
    ),
  },
  {
    id: 'seguranca',
    rotulo: 'Segurança e reporte',
    titulo: 'Segurança, divulgação responsável e código aberto',
    corpo: (
      <>
        <h4>1. Reporte responsável de vulnerabilidades</h4>
        <p>
          Encontrando uma falha de segurança, peça-se comunicar de forma privada, sem divulgação pública prévia, sem
          exploração além do mínimo necessário para demonstrar o problema e sem acesso, cópia ou alteração de dados de
          terceiros. O canal de contato, enquanto não houver endereço dedicado, é o repositório oficial. Pesquisas
          conduzidas nesses limites são bem-vindas e não serão objeto de medida hostil.
        </p>

        <h4>2. Limites do teste</h4>
        <p>
          São vedados testes que degradem o serviço, ataques de negação de serviço, engenharia social contra pessoas,
          spam, uso de dados reais de terceiros e persistência de acesso. Nenhuma permissão concedida aqui afasta a
          aplicação da legislação penal e civil brasileira.
        </p>

        <h4>3. Código aberto e auditoria</h4>
        <p>
          O código é público para que qualquer pessoa possa auditar como os dados são tratados. Contribuições devem
          usar exclusivamente amostras sintéticas: é proibido enviar ao repositório extratos reais, nomes, documentos,
          chaves PIX, tokens, credenciais ou bancos de dados de pessoas reais.
        </p>

        <h4>4. Integridade dos instaladores</h4>
        <p>
          Quando houver distribuição, os instaladores serão publicados com checksum e assinatura verificáveis. Arquivos
          obtidos fora dos canais oficiais não são confiáveis e não têm qualquer garantia do projeto.
        </p>
      </>
    ),
  },
];

export function LegalNotices() {
  const [documentoAberto, setDocumentoAberto] = useState<string | null>(null);
  const gatilhoAnterior = useRef<HTMLButtonElement | null>(null);
  const dialogo = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  const fechar = useCallback(() => {
    setDocumentoAberto(null);
    gatilhoAnterior.current?.focus();
  }, []);

  const abrir = (id: string, evento: React.MouseEvent<HTMLButtonElement>) => {
    gatilhoAnterior.current = evento.currentTarget;
    setDocumentoAberto(id);
  };

  useEffect(() => {
    if (!documentoAberto) return;

    const onKeyDown = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        fechar();
        return;
      }
      // Mantém o foco dentro da janela enquanto ela estiver aberta.
      if (evento.key !== 'Tab') return;
      const foco = dialogo.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!foco || foco.length === 0) return;
      const primeiro = foco[0];
      const ultimo = foco[foco.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    dialogo.current?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [documentoAberto, fechar]);

  const atual = DOCUMENTOS.find((documento) => documento.id === documentoAberto);

  return (
    <>
      <ul className="lp-legal-links">
        <li>
          <a className="lp-legal-link" href="/termos">
            Termos de Uso
          </a>
        </li>
        <li>
          <a className="lp-legal-link" href="/privacidade">
            Privacidade e LGPD
          </a>
        </li>
        {DOCUMENTOS.map((documento) => (
          <li key={documento.id}>
            <button type="button" className="lp-legal-link" onClick={(evento) => abrir(documento.id, evento)}>
              {documento.rotulo}
            </button>
          </li>
        ))}
      </ul>

      {atual && (
        <div className="lp-modal" role="presentation">
          <button type="button" className="lp-modal-scrim" aria-label="Fechar documento" onClick={fechar} />
          <div
            className="lp-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            ref={dialogo}
            tabIndex={-1}
          >
            <header className="lp-modal-head">
              <div>
                <p className="lp-eyebrow">Documento jurídico</p>
                <h2 className="lp-h-display" id={tituloId}>
                  {atual.titulo}
                </h2>
              </div>
              <button type="button" className="lp-round" onClick={fechar} aria-label="Fechar">
                <Icon name="bi-x-lg" />
              </button>
            </header>

            <nav className="lp-modal-tabs" aria-label="Outros documentos">
              {DOCUMENTOS.map((documento) => (
                <button
                  key={documento.id}
                  type="button"
                  className={documento.id === atual.id ? 'lp-modal-tab lp-modal-tab-on' : 'lp-modal-tab'}
                  aria-current={documento.id === atual.id}
                  onClick={() => setDocumentoAberto(documento.id)}
                >
                  {documento.rotulo}
                </button>
              ))}
            </nav>

            <div className="lp-modal-body lp-legal-doc">
              <p className="lp-legal-aviso">
                <Icon name="bi-exclamation-triangle" />
                <span>
                  Minuta em revisão. O projeto está em fase pré-alpha e este texto ainda será submetido a análise
                  jurídica antes de qualquer lançamento público.
                </span>
              </p>
              {atual.corpo}
              <p className="lp-legal-meta">{VERSAO}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
