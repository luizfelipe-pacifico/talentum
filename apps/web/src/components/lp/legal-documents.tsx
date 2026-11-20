/* Termos de Uso e Política de Privacidade, em páginas próprias (/termos e
   /privacidade).

   MINUTA. O texto descreve o que o código faz hoje (cloudflare/src, D1 e o BFF
   desta LP) e precisa de revisão por advogado antes de qualquer lançamento
   público. Nenhuma cláusula pode descrever como pronto algo planejado, nem
   inventar pessoa, empresa ou encarregado que não existe. Mudou o tratamento de
   dados: mude este texto e a versão em `server/legal.ts` (e no Worker). */

const REPO = 'https://github.com/luizfelipe-pacifico/talentum';

export function TermsDocument() {
  return (
    <>
      <h2>1. Objeto e aceitação</h2>
      <p>
        Estes Termos regulam o uso deste site, da conta Talentum e do aplicativo Talentum (“Software”), um programa de
        organização financeira pessoal, de código aberto, executado no dispositivo de quem o usa. A conta é criada na
        primeira entrada com Google. Ao selecionar <strong>Continuar com Google</strong> na página Entrar, você aceita
        estes Termos na versão indicada no fim deste documento; a data e a versão aceitas ficam registradas na sua conta.
        Quem não concordar não deve criar conta nem instalar o Software.
      </p>

      <h2>2. Estágio do projeto e ausência de garantia</h2>
      <p>
        O projeto está em fase <strong>pré-alpha</strong>. Funcionalidades podem mudar ou ser removidas sem aviso. O site,
        a conta e o Software são fornecidos <em>no estado em que se encontram</em>, sem garantia de disponibilidade
        contínua, de ausência de erros ou de adequação a uma finalidade específica, nos limites que a lei permite.
      </p>

      <h2>3. Licença e propriedade intelectual</h2>
      <p>
        O código-fonte é distribuído sob a licença MIT, publicada no arquivo <code>LICENSE</code> do{' '}
        <a href={REPO} target="_blank" rel="noreferrer noopener">
          repositório oficial
        </a>
        . Componentes de terceiros mantêm suas próprias licenças; os ícones são do Bootstrap Icons, licença MIT. A
        metodologia de alocação referida como ARCA é creditada a Thiago Nigro (Primo Rico); a citação é referencial e não
        implica afiliação, parceria ou endosso.
      </p>

      <h2>4. Conta</h2>
      <p>
        A conta existe para liberar os downloads do Software e a participação na comunidade de sugestões. A entrada usa a
        sua conta Google; o Talentum não recebe nem guarda a sua senha. Você responde pelo uso da sua conta e pode
        encerrar sessões abertas em outros navegadores ou excluir a conta a qualquer momento em{' '}
        <a href="/conta">Minha conta</a>.
      </p>

      <h2>5. Comunidade de sugestões</h2>
      <p>
        Sugestões, comentários e votos publicados na comunidade ficam visíveis para qualquer pessoa, junto com o seu nome
        público. Você pode alterar o nome público em Minha conta. Não publique dados pessoais, financeiros ou de terceiros.
        Conteúdo que viole estes Termos pode ser ocultado pela moderação, e cada decisão fica registrada. Quem discordar
        de uma decisão pode abrir uma issue no repositório oficial pedindo revisão; um procedimento formal de recurso
        ainda não existe.
      </p>
      <p>É vedado, entre outras condutas:</p>
      <ul>
        <li>publicar conteúdo ilícito, difamatório, discriminatório, sexualmente explícito ou que viole direito de terceiro;</li>
        <li>publicar dado pessoal de outra pessoa, ou dados financeiros, inclusive os seus;</li>
        <li>enviar propaganda, conteúdo repetido em massa ou automatizar publicações e votos;</li>
        <li>tentar acessar contas, dados ou áreas restritas sem autorização, ou contornar os limites de uso do serviço;</li>
        <li>explorar vulnerabilidades sem reporte responsável, ou divulgá-las de modo a causar dano.</li>
      </ul>

      <h2>6. Natureza informativa e ausência de consultoria</h2>
      <p>
        O Talentum é ferramenta de organização e educação financeira. Ele <strong>não presta</strong> consultoria, análise,
        gestão ou recomendação de valores mobiliários, não é instituição financeira e não é registrado na Comissão de
        Valores Mobiliários. Cálculos e simulações são operações sobre dados informados pelo próprio usuário. Resumos de
        notícias gerados automaticamente podem conter erros; a referência é sempre a notícia original. Toda decisão de
        investimento é exclusiva do usuário.
      </p>

      <h2>7. Dados financeiros</h2>
      <p>
        Extratos, lançamentos, saldos, chaves Pix, patrimônio e metas são processados e guardados somente no dispositivo do
        usuário. O projeto não tem acesso a esses dados e não pode recuperá-los em caso de perda, formatação ou falha do
        equipamento. Manter cópias de segurança é responsabilidade do usuário.
      </p>

      <h2>8. Disponibilidade e alterações</h2>
      <p>
        Não há compromisso de nível de serviço nem de continuidade do projeto. Estes Termos podem mudar; cada versão tem
        data própria, e uma versão nova é apresentada na próxima entrada.
      </p>

      <h2>9. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, o titular do projeto não responde por danos indiretos, perda de dados ou
        prejuízos decorrentes de decisões tomadas com apoio do Software. Nada nestes Termos afasta responsabilidades que a
        lei considera inafastáveis, inclusive as previstas no Código de Defesa do Consumidor.
      </p>

      <h2>10. Lei aplicável</h2>
      <p>
        Aplica-se a legislação brasileira, em especial a Lei 12.965/2014 (Marco Civil da Internet), a Lei 13.709/2018
        (LGPD) e, quando cabível, a Lei 8.078/1990 (Código de Defesa do Consumidor). Fica eleito o foro do domicílio do
        usuário.
      </p>
    </>
  );
}

type Row = { data: string; finalidade: string; prazo: string };

/* O que o banco da nuvem (Cloudflare D1) guarda hoje. Cada linha tem tabela no
   código; nada aqui é planejado. */
const STORED: Row[] = [
  {
    data: 'Endereço de e-mail da conta Google, em minúsculas, e a data em que o Google o confirmou',
    finalidade: 'Identificar a sua conta na próxima entrada',
    prazo: 'Até a exclusão da conta',
  },
  {
    data: 'Identificador da sua conta no Google (não é o e-mail nem a senha)',
    finalidade: 'Ligar a entrada com Google à sua conta',
    prazo: 'Até a exclusão da conta',
  },
  {
    data: 'Nome público e endereço da foto de perfil informados pelo Google',
    finalidade: 'Assinar o que você publica na comunidade; a foto não é exibida no site',
    prazo: 'Até a exclusão da conta; o nome pode ser alterado em Minha conta',
  },
  {
    data: 'Versões destes Termos e da Política de Privacidade aceitas, com data e hora',
    finalidade: 'Provar o aceite',
    prazo: 'Até a exclusão da conta',
  },
  {
    data: 'Sessões: código resumido (hash) dos tokens de acesso e de renovação, criação, último uso, validade e encerramento',
    finalidade: 'Manter você conectado e permitir encerrar sessões',
    prazo: 'Apagadas 30 dias depois de vencidas ou encerradas',
  },
  {
    data: 'Verificação em duas etapas, quando você a ativa: segredo do app autenticador cifrado e códigos de recuperação em forma resumida (hash)',
    finalidade: 'Pedir um segundo código na entrada',
    prazo: 'Até você desativar a verificação ou excluir a conta',
  },
  {
    data: 'Liberações de download: código resumido (hash), instalador escolhido, validade e uso',
    finalidade: 'Liberar o instalador uma única vez, por poucos minutos, e registrar a entrega',
    prazo: 'Apagadas 30 dias depois de vencidas',
  },
  {
    data: 'Sugestões, comentários, votos e denúncias que você envia à comunidade, e as decisões de moderação sobre eles',
    finalidade: 'Funcionamento e moderação da comunidade',
    prazo: 'Enquanto publicados; ao excluir a conta, o texto é apagado e o lugar aparece como conteúdo removido',
  },
  {
    data: 'Eventos de segurança (por exemplo, reuso de token ou falha de entrada), sem IP, e-mail ou token',
    finalidade: 'Detectar abuso e proteger contas',
    prazo: '180 dias',
  },
  {
    data: 'Registro de auditoria de ações administrativas e de downloads, sem IP, e-mail ou token',
    finalidade: 'Prestar contas das decisões e entregas',
    prazo: '365 dias',
  },
  {
    data: 'Contadores de limite de uso, identificados por um resumo (hash) do endereço IP misturado a um segredo; o IP em si nunca é gravado',
    finalidade: 'Impedir excesso de requisições',
    prazo: '1 dia',
  },
  {
    data: 'Códigos de ação de uso único, transações de entrada em andamento e registros de envio repetido',
    finalidade: 'Impedir que uma mesma ação seja executada duas vezes',
    prazo: '1 dia',
  },
];

export function PrivacyDocument() {
  return (
    <>
      <h2>1. Quem trata os dados</h2>
      <p>
        O Talentum é um projeto pessoal de código aberto, mantido de forma independente pelo seu autor, que atua como
        controlador (art. 5º, VI, da LGPD) dos dados tratados pelo site e pela conta. Ainda não há endereço dedicado nem
        encarregado (art. 41) indicado: enquanto isso, pedidos podem ser feitos pelas issues do{' '}
        <a href={REPO} target="_blank" rel="noreferrer noopener">
          repositório oficial
        </a>
        , sem publicar dados pessoais na issue. A indicação formal do encarregado está pendente.
      </p>

      <h2>2. O que nunca sai do seu dispositivo</h2>
      <p>
        Extratos, faturas, lançamentos, categorias, saldos, contas, chaves Pix, patrimônio, metas e o banco de dados do
        aplicativo ficam <strong>somente no seu computador</strong>. Eles não são enviados ao site, ao banco da nuvem nem a
        serviços de inteligência artificial. A lista de notícias do aplicativo é pública e igual para todos; qualquer
        ajuste dela ao seu perfil acontece no próprio dispositivo.
      </p>

      <h2>3. O que o banco da nuvem guarda</h2>
      <p>
        A nuvem do Talentum (um Worker e um banco D1 na Cloudflare) guarda apenas o necessário para a conta, os downloads e
        a comunidade:
      </p>
      <div className="lp-table-scroll">
        <table className="lp-legal-table">
          <thead>
            <tr>
              <th scope="col">Dado</th>
              <th scope="col">Para quê</th>
              <th scope="col">Por quanto tempo</th>
            </tr>
          </thead>
          <tbody>
            {STORED.map((row) => (
              <tr key={row.data}>
                <td>{row.data}</td>
                <td>{row.finalidade}</td>
                <td>{row.prazo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Notícias exibidas no aplicativo são dados públicos de fontes que permitem a reprodução com crédito: título, link,
        fonte, data e um trecho curto, guardados por 30 dias. Os resumos automáticos usam só o texto público da notícia.
      </p>

      <h2>4. Bases legais</h2>
      <ul>
        <li>Conta, sessões, downloads e comunidade: execução do contrato aceito nos Termos de Uso (art. 7º, V).</li>
        <li>Eventos de segurança, limites de uso e auditoria: legítimo interesse em proteger as contas e o serviço (art. 7º, IX).</li>
        <li>Registro do aceite: cumprimento de obrigação legal e exercício regular de direitos (art. 7º, II e VI).</li>
      </ul>

      <h2>5. Empresas que processam dados para o projeto</h2>
      <ul>
        <li>
          <strong>Google</strong>: realiza a entrada. O Talentum pede somente e-mail, nome e foto de perfil.
        </li>
        <li>
          <strong>Cloudflare</strong>: executa o Worker e o banco D1, aplica o desafio Turnstile que confirma que um envio
          veio de uma pessoa e, quando ativado, gera resumos de notícias públicas com Workers AI.
        </li>
        <li>
          <strong>Vercel</strong>: hospeda este site. Como todo provedor de hospedagem, recebe dados técnicos de conexão,
          como endereço IP e navegador.
        </li>
      </ul>
      <p>
        Esses provedores podem processar dados fora do Brasil; a transferência observa os arts. 33 a 36 da LGPD. Não há
        venda nem cessão de dados pessoais.
      </p>

      <h2>6. Cookies</h2>
      <p>
        O site usa somente cookies próprios e necessários, com os atributos <code>Secure</code> e <code>HttpOnly</code>:
        a sessão (15 minutos), a renovação da sessão (30 dias), o vínculo do login em andamento (10 minutos) e, quando a
        verificação em duas etapas está ativa, a etapa do código (poucos minutos). Não há cookies de análise, publicidade
        ou rastreamento. O desafio Turnstile da Cloudflare roda em um quadro próprio na página Entrar e nos formulários da
        comunidade.
      </p>

      <h2>7. Seus direitos e a exclusão da conta</h2>
      <p>
        Pelo art. 18 da LGPD, você pode pedir confirmação do tratamento, acesso, correção, anonimização, bloqueio,
        eliminação, portabilidade, informação sobre compartilhamento e revogação do consentimento, além de peticionar à
        ANPD.
      </p>
      <p>
        Para excluir a conta, vá a <a href="/conta">Minha conta</a> e use <strong>Excluir conta</strong>. A exclusão
        encerra todas as sessões e apaga e-mail, identificador do Google, perfil, aceites, liberações de download e votos.
        O texto do que você publicou na comunidade é apagado e o lugar aparece como conteúdo removido, para que as
        conversas de outras pessoas continuem legíveis. Eventos de segurança e de auditoria, que não contêm e-mail, IP ou
        token, seguem os prazos da tabela acima. Os dados financeiros no seu computador não são afetados.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Conexões cifradas, entrada com código de autorização e PKCE, tokens de curta duração com renovação rotativa e
        guardados apenas em forma resumida, verificação em duas etapas opcional, autorização conferida no servidor a cada
        pedido e limites de uso. Nenhum sistema é imune a falhas; havendo incidente com risco relevante, a ANPD e as
        pessoas afetadas serão comunicadas (art. 48).
      </p>

      <h2>9. Crianças e adolescentes</h2>
      <p>O site e o Software não se destinam a menores de 18 anos.</p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Cada versão tem data própria. Uma mudança relevante gera versão nova, apresentada na próxima entrada.
      </p>
    </>
  );
}
