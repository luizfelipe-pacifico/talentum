'use client';

/* Documentos jurídicos da landing page, em janela modal.

   MINUTA. Este texto foi redigido para um projeto pessoal, pré-alpha, que hoje
   não coleta dado pessoal algum pelo site. Ele precisa de revisão por
   advogado antes de qualquer lançamento público, e precisa ser reescrito
   quando o cadastro, o download autenticado e a comunidade existirem de fato.
   Nenhuma cláusula aqui pode descrever como pronto algo que ainda é planejado. */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

const VERSAO = 'Versão 0.1 · 5 de setembro de 2026';
const REPO = 'https://github.com/luizfelipe-pacifico/talentum';

type Documento = { id: string; rotulo: string; titulo: string; corpo: ReactNode };

const DOCUMENTOS: Documento[] = [
  {
    id: 'termos',
    rotulo: 'Termos de Uso',
    titulo: 'Termos de Uso do Talentum',
    corpo: (
      <>
        <h4>1. Objeto e aceitação</h4>
        <p>
          Estes Termos regulam o acesso a este site e, quando disponibilizado, o uso do aplicativo Talentum
          (“Software”), um programa de organização financeira pessoal, de código aberto, executado localmente no
          dispositivo do usuário. Ao navegar neste site ou instalar o Software, o usuário declara ter lido,
          compreendido e aceitado integralmente estes Termos. Quem não concordar deve deixar de utilizar o site e o
          Software.
        </p>

        <h4>2. Estágio de desenvolvimento e ausência de garantia</h4>
        <p>
          O projeto encontra-se em estágio <strong>pré-alpha</strong>. Funcionalidades descritas neste site podem
          estar planejadas, parcialmente implementadas ou sujeitas a alteração e remoção sem aviso. Não existe, nesta
          data, instalador público disponível. O Software é fornecido <em>“no estado em que se encontra”</em> e
          <em> “conforme disponibilidade”</em>, sem garantias de qualquer natureza, expressas ou implícitas,
          incluindo, sem limitação, garantias de comercialização, adequação a uma finalidade específica,
          disponibilidade contínua, ausência de erros ou de interrupções.
        </p>

        <h4>3. Licença de uso e propriedade intelectual</h4>
        <p>
          A licença definitiva do código-fonte ainda será formalizada em arquivo <code>LICENSE</code> no repositório
          oficial. Até a sua publicação, todos os direitos permanecem reservados ao titular do projeto, ressalvados
          os usos permitidos por lei e os direitos de terceiros sobre componentes incorporados. Marcas, nome,
          identidade visual, textos e ilustrações originais deste site são protegidos pela Lei 9.610/1998 e pela Lei
          9.279/1996.
        </p>
        <p>
          Componentes de terceiros mantêm suas licenças próprias. Os ícones de interface são do projeto Bootstrap
          Icons, distribuído sob licença MIT. A metodologia de alocação patrimonial referida como ARCA é creditada a
          Thiago Nigro (Primo Rico); a citação é meramente referencial e não implica afiliação, parceria,
          patrocínio ou endosso.
        </p>

        <h4>4. Conta de usuário</h4>
        <p>
          O cadastro por provedor de identidade e a área autenticada de downloads são <strong>planejados</strong> e
          ainda não estão em operação. Quando existirem, o usuário será responsável pela veracidade das informações
          fornecidas, pela guarda de suas credenciais e por toda atividade realizada em sua conta, devendo comunicar
          imediatamente qualquer uso não autorizado.
        </p>

        <h4>5. Uso permitido e condutas vedadas</h4>
        <p>É vedado ao usuário, a título exemplificativo e não exaustivo:</p>
        <ul>
          <li>utilizar o site ou o Software para finalidade ilícita, fraudulenta ou lesiva a terceiros;</li>
          <li>tentar obter acesso não autorizado a sistemas, contas, dados ou áreas restritas;</li>
          <li>realizar engenharia reversa com o fim de burlar controles de segurança, salvo no limite expressamente permitido por lei ou pela licença aplicável;</li>
          <li>explorar vulnerabilidades sem reporte responsável, ou divulgá-las de modo a viabilizar dano;</li>
          <li>sobrecarregar a infraestrutura por automação abusiva, varredura massiva ou negação de serviço;</li>
          <li>remover, ocultar ou alterar avisos de autoria, licença ou propriedade intelectual;</li>
          <li>publicar, em áreas comunitárias futuras, conteúdo ilícito, difamatório, discriminatório, sexualmente explícito, que viole direito de terceiro ou que contenha dado pessoal alheio.</li>
        </ul>

        <h4>6. Natureza informativa e ausência de consultoria</h4>
        <p>
          O Talentum é ferramenta de organização e educação financeira. Ele <strong>não presta</strong> consultoria,
          análise, gestão, recomendação ou distribuição de valores mobiliários, não é instituição financeira nem
          participante do sistema de distribuição, e não é registrado como consultor ou analista perante a Comissão
          de Valores Mobiliários. Simulações, projeções e sugestões de destinação de aportes são exercícios
          matemáticos sobre dados informados pelo próprio usuário, não constituem recomendação personalizada e não
          consideram seu perfil, objetivos ou situação patrimonial. Toda decisão de investimento é exclusiva do
          usuário, que assume integralmente os riscos, inclusive de perda do capital.
        </p>

        <h4>7. Dados financeiros e responsabilidade do usuário</h4>
        <p>
          A arquitetura do Software é local-first: extratos, transações, saldos e demais dados financeiros são
          processados e armazenados no dispositivo do usuário. Cabe ao usuário manter cópias de segurança, proteger
          fisicamente o equipamento, controlar o acesso de terceiros ao dispositivo e conferir a exatidão das
          informações importadas. O titular do projeto não tem acesso a esses dados e não pode recuperá-los em caso de
          perda, corrupção, formatação ou falha de hardware.
        </p>

        <h4>8. Disponibilidade, alterações e suporte</h4>
        <p>
          Não há compromisso de nível de serviço, de continuidade do projeto ou de prazo de resposta a solicitações.
          O site e o Software podem ser modificados, suspensos ou descontinuados a qualquer tempo. Canais de suporte,
          quando existirem, serão informados no repositório oficial.
        </p>

        <h4>9. Limitação de responsabilidade</h4>
        <p>
          Na máxima extensão permitida pela legislação aplicável, o titular do projeto não responde por danos
          indiretos, lucros cessantes, perda de chance, perda de dados, prejuízos financeiros decorrentes de decisões
          tomadas com apoio do Software, indisponibilidade de serviços de terceiros, nem por atos de usuários. Nada
          nestes Termos exclui responsabilidades que a lei considere inafastáveis, notadamente as decorrentes de dolo
          e as previstas no Código de Defesa do Consumidor.
        </p>

        <h4>10. Alterações destes Termos</h4>
        <p>
          Estes Termos podem ser atualizados a qualquer momento, com indicação da versão e da data. O uso continuado
          após a publicação implica concordância com a versão vigente.
        </p>

        <h4>11. Legislação aplicável e foro</h4>
        <p>
          Aplica-se a legislação brasileira, em especial a Lei 12.965/2014 (Marco Civil da Internet), a Lei
          13.709/2018 (LGPD) e, quando cabível, a Lei 8.078/1990 (Código de Defesa do Consumidor). Fica eleito o foro
          do domicílio do usuário para dirimir controvérsias, sem prejuízo de outro que a lei repute competente.
        </p>
      </>
    ),
  },
  {
    id: 'privacidade',
    rotulo: 'Privacidade e LGPD',
    titulo: 'Política de Privacidade e Proteção de Dados',
    corpo: (
      <>
        <h4>1. Quem trata os dados</h4>
        <p>
          O Talentum é um projeto pessoal de código aberto, mantido de forma independente por seu autor, que atua como{' '}
          <strong>controlador</strong> nos termos do art. 5º, VI, da Lei 13.709/2018 (LGPD) quanto aos dados tratados
          pelo site e pelos serviços de conta. Enquanto não houver endereço dedicado publicado, os pedidos de titular
          podem ser encaminhados pelo canal público de issues do{' '}
          <a href={REPO} target="_blank" rel="noreferrer noopener">
            repositório oficial
          </a>
          . A indicação formal de encarregado pelo tratamento de dados (art. 41) será publicada antes do lançamento da
          área autenticada.
        </p>

        <h4>2. O que é tratado hoje</h4>
        <p>
          Nesta data, este site é uma página informativa: ele <strong>não possui</strong> formulário, cadastro, login,
          carrinho, chat, pixel de rastreamento, ferramenta de analytics ou cookie de terceiros. Não há coleta de nome,
          e-mail, telefone, documento, geolocalização ou perfil comportamental. O provedor de hospedagem pode registrar
          dados técnicos de conexão para segurança e funcionamento, como endereço IP, data e hora da requisição e
          agente de usuário, com base no legítimo interesse (art. 7º, IX) e no dever de guarda de registros do Marco
          Civil da Internet.
        </p>

        <h4>3. O que será tratado quando os recursos existirem</h4>
        <p>
          As funcionalidades abaixo estão <strong>planejadas</strong> e ainda não operam. Quando entrarem em produção,
          esta política será revista e versionada:
        </p>
        <ul>
          <li>
            <strong>Identificação e conta:</strong> identificador do provedor de login, endereço de e-mail e nome
            público, para criar e manter a conta. Base legal: execução de contrato (art. 7º, V).
          </li>
          <li>
            <strong>Sessão e segurança:</strong> identificadores de sessão, hashes de tokens, registros de acesso,
            eventos de autenticação e sinais antifraude. Base legal: legítimo interesse e obrigação legal.
          </li>
          <li>
            <strong>Consentimentos:</strong> versão de termos aceita, data e hora. Base legal: cumprimento de
            obrigação legal e prova de consentimento.
          </li>
          <li>
            <strong>Distribuição de instaladores:</strong> registro de concessão de download, versão e plataforma. Base
            legal: execução de contrato e legítimo interesse na integridade da distribuição.
          </li>
          <li>
            <strong>Comunidade de feedback:</strong> conteúdo público publicado voluntariamente, votos e denúncias. Base
            legal: execução de contrato e legítimo interesse na moderação.
          </li>
        </ul>

        <h4>4. O que nunca é enviado</h4>
        <p>
          Por decisão de arquitetura, dados financeiros permanecem no dispositivo do usuário e{' '}
          <strong>não são coletados, transmitidos ou armazenados</strong> pelo projeto: extratos e faturas, transações,
          estabelecimentos, categorias, saldos, patrimônio, metas, hábitos de consumo, chaves PIX e o banco de dados
          local. Um backup criptografado de ponta a ponta é planejado; quando existir, o conteúdo será cifrado no
          dispositivo antes de qualquer envio e a chave não será conhecida pelo projeto. Nenhum dado financeiro é
          enviado a serviços de inteligência artificial.
        </p>

        <h4>5. Compartilhamento e operadores</h4>
        <p>
          Não há venda, aluguel ou cessão de dados pessoais. Quando a área autenticada existir, serão utilizados
          operadores de infraestrutura para hospedagem, borda, banco de dados e distribuição de arquivos, que tratarão
          dados exclusivamente conforme instrução do controlador e sob contrato. Poderá haver compartilhamento para
          cumprimento de obrigação legal, ordem judicial ou defesa de direitos.
        </p>

        <h4>6. Transferência internacional</h4>
        <p>
          Provedores de infraestrutura podem processar dados fora do Brasil. Nessa hipótese, a transferência observará
          os arts. 33 a 36 da LGPD, mediante cláusulas contratuais adequadas e garantias compatíveis com o nível de
          proteção da lei brasileira.
        </p>

        <h4>7. Retenção e eliminação</h4>
        <p>
          Os dados serão mantidos pelo tempo necessário às finalidades informadas, ao cumprimento de obrigações legais
          e ao exercício regular de direitos. Registros de acesso a aplicações de internet observam o prazo do art. 15
          do Marco Civil. Encerrada a finalidade, os dados serão eliminados ou anonimizados (art. 15 e 16 da LGPD).
        </p>

        <h4>8. Segurança da informação</h4>
        <p>
          São adotadas medidas técnicas e administrativas compatíveis com o estado atual do projeto: transporte
          cifrado, autenticação por código de autorização com PKCE, tokens de curta duração com rotação, autorização
          verificada no servidor, limitação de requisições, registro de eventos sem conteúdo sensível, revisão de
          dependências e varredura de segredos. Nenhum sistema é imune a incidentes; o usuário também é responsável
          por manter seu dispositivo seguro e atualizado.
        </p>

        <h4>9. Incidentes de segurança</h4>
        <p>
          Havendo incidente que possa acarretar risco ou dano relevante, o controlador comunicará a Autoridade Nacional
          de Proteção de Dados e os titulares afetados em prazo razoável, informando a natureza dos dados, os riscos
          envolvidos e as medidas adotadas (art. 48 da LGPD).
        </p>

        <h4>10. Direitos do titular</h4>
        <p>Nos termos do art. 18 da LGPD, o titular pode requerer, gratuitamente:</p>
        <ul>
          <li>confirmação da existência de tratamento;</li>
          <li>acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
          <li>portabilidade a outro fornecedor, observados os segredos comercial e industrial;</li>
          <li>eliminação dos dados tratados com base no consentimento;</li>
          <li>informação sobre entidades públicas e privadas com as quais houve uso compartilhado;</li>
          <li>informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;</li>
          <li>revogação do consentimento, a qualquer tempo, por procedimento gratuito e facilitado;</li>
          <li>oposição a tratamento realizado com fundamento em uma das hipóteses de dispensa de consentimento.</li>
        </ul>
        <p>
          Os pedidos serão respondidos nos prazos legais, podendo ser exigida comprovação de identidade para evitar
          divulgação indevida a terceiros. O titular pode ainda peticionar perante a ANPD.
        </p>

        <h4>11. Decisões automatizadas</h4>
        <p>
          O projeto não realiza tratamento automatizado destinado a definir perfil pessoal, profissional, de consumo ou
          de crédito com efeitos jurídicos sobre o titular. Cálculos de saldo, categorização e sugestões de aporte
          ocorrem localmente, sobre dados do próprio usuário, e podem ser revistos, corrigidos e revertidos por ele.
        </p>

        <h4>12. Crianças e adolescentes</h4>
        <p>
          O site e o Software não se destinam a menores de 18 anos. Não há coleta intencional de dados de crianças e
          adolescentes; identificada tal hipótese, os dados serão eliminados, observado o art. 14 da LGPD.
        </p>

        <h4>13. Atualizações desta política</h4>
        <p>
          Esta política pode ser revista a qualquer tempo, com nova versão e data. Alterações relevantes serão
          destacadas no site e no repositório.
        </p>
      </>
    ),
  },
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

        <h4>3. Cookies estritamente necessários (planejados)</h4>
        <p>
          Quando a área autenticada existir, será utilizado cookie de sessão próprio (first-party), com atributos{' '}
          <code>Secure</code>, <code>HttpOnly</code> e <code>SameSite</code>, exclusivamente para manter o usuário
          autenticado e proteger contra requisições forjadas. Cookies estritamente necessários dispensam consentimento
          prévio, mas serão informados nesta política.
        </p>

        <h4>4. Gerenciamento</h4>
        <p>
          O usuário pode bloquear ou remover cookies a qualquer momento nas configurações do navegador. O bloqueio de
          cookies necessários pode impedir o funcionamento da autenticação, quando ela existir.
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
                <i className="bi bi-x-lg" aria-hidden="true" />
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
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
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
