 pogucoalidar ppor favconss# Documentação de Visão de Produto e Arquitetura: Piloto Automático Financeiro

## 1. Resumo do Produto & Proposta de Valor
O aplicativo é uma solução de gestão financeira **Local-First** e **Open-Source** voltada para pessoas com rotinas intensas. Ele elimina a fricção da digitação manual através da leitura automatizada de extratos (PDF/OFX), combina a gestão do fluxo de caixa diário com o rebalanceamento de patrimônio e utiliza elementos de gamificação para incentivar a disciplina financeira sem tornar o uso cansativo.

---

## 2. Princípios Norteadores da Experiência do Usuário (UX)
* **Zero Fricção:** Automação passiva em primeiro lugar; formulários manuais existem apenas como exceção para dinheiro físico ou conciliação rápida.
* **Privacidade Absoluta:** O computador do usuário guarda 100% dos dados financeiros reais. A nuvem não possui conhecimento dos valores em R$ nem das transações do usuário.
* **Decisões Direcionadas:** O sistema calcula o "Saldo Real Drenado" e orienta a destinação de superávits e novos aportes sem exigir que o usuário seja um especialista de mercado.

---

## 3. Mapeamento e Detalhamento das Abas do Aplicativo

### 🏠 Aba 1: Início (Dashboard Executivo)
* **Saldo Real Drenado:** Exibe o saldo bancário disponível descontando automaticamente as contas e faturas mapeadas com vencimento até o fim do mês.
* **Média de Gastos Diária:** Indicador de consumo diário atual em relação ao limite ideal planejado para o período.
* **Widget de Notificações Ativas:** Avisos de vencimento de faturas, débitos automáticos do dia e recebimento de proventos/dividendos de ativos.
* **Resumo de Gamificação:** Nível de XP atual, barra de progresso para o próximo nível e atalho rápido para a missão ativa.
* **Status da Carteira:** Sinalização simplificada sobre a saúde e equilíbrio da carteira patrimonial.

### 💳 Aba 2: Extratos, Cartões & Benefícios
* **Área de Drag & Drop:** Módulo visual para upload de arquivos de extrato bancário (PDF e OFX).
* **Painel de Faturas & Débitos Automáticos:** Mapeamento de contas recorrentes e datas fixas de vencimento.
* **Calculadora de Retorno (ROI do Cartão):** Comparativo entre anuidade cobrada e benefícios gerados (cashback e milhas), indicando se o cartão gera lucro ou prejuízo.
* **Termômetro de Isenção:** Barra de progresso visual exibindo o valor restante necessário em compras no mês para alcançar a isenção de anuidade do cartão.

### 🔄 Aba 3: Conciliação Financeira
* **Validação Rápida (Smart Triage):** Interface em formato de cartões interativos para classificar ou confirmar transações que o algoritmo de categorização teve dúvida.
* **Ajuste de Juros e Descontos:** Interface para inclusão de taxas decorrentes de atrasos ou descontos por pagamentos antecipados.
* **Lançamento Express de Dinheiro:** Formulário simplificado de 3 campos (Valor, Categoria e Nota) para registro de despesas em espécie.
* **Conferência de Fatura vs. Extrato:** Opção de marcação "Conciliado" para auditoria visual de faturas de cartão e débito automático.

### 📊 Aba 4: Gestão de Patrimônio & Metas
* **Matriz dos 4 Pilares (ARCA):** Estrutura de alocação de patrimônio baseada na metodologia idealizada por Thiago Nigro (Primo Rico):
  * **Ações (A):** Crescimento em ações locais (B3).
  * **Real Estate (R):** Fundos Imobiliários (FIIs) e renda passiva.
  * **Caixa (C):** Renda fixa com liquidez diária e reservas.
  * **Ativos Internacionais (A):** Proteção cambial via ETFs/BDRs/Dólar.
* **Banda de Tolerância (±10% Relativos):** Faixa de segurança entre **22,5% e 27,5%** por pilar. Flutuações dentro desta margem não disparam alertas de aporte.
* **Calculadora do Próximo Aporte:** O usuário insere o valor disponível e o algoritmo aponta o pilar mais defasado para receber o aporte sem necessidade de venda de ativos.
* **Caixinhas de Objetivos:** Gestão de metas de compra com cálculo automático de parcelas mensais e prazos de viabilidade.
* **Destinação do Superávit:** Sugestão ao final do mês para direcionar sobras do orçamento para metas ou investimentos.

### 📰 Aba 5: Invest (Notícias & Análises)
* **Feed com Proxy:** Leitura segura de portais e feeds RSS financeiros através de servidor proxy, evitando bloqueios de CORS no cliente.
* **Filtro Contextual:** Alternador entre notícias gerais da economia e notícias relacionadas diretamente aos ativos cadastrados na carteira do usuário.
* **Resumos via IA na Borda:** Síntese em tópicos objetivos gerados por modelos de linguagem hospedados na infraestrutura Cloudflare Workers AI.
* **Crédito de Origem:** Botão de redirecionamento direto para a matéria original do veículo de imprensa criador.

### 📜 Aba 6: Histórico, Perfil & Gamificação
* **Timeline do Usuário:** Registro cronológico de todas as importações de extrato, conciliações, metas batidas e conquistas ativas.
* **Ponto de Restauração:** Possibilidade de desfazer ações de importação ou edições de lançamentos passados através da linha do tempo.
* **Painel de Gamificação:** Tabela de níveis de XP, mural de medalhas/badges desbloqueadas, missões diárias/semanais e ranking.
* **Privacidade & Backup:** Painel de controle do banco SQLite local e botão de disparo do backup criptografado para a nuvem.

---

## 4. Onboarding & Primeiro Acesso
A experiência do primeiro acesso foi projetada para durar no máximo 45 segundos:
1. **Landing Page:** O usuário clica para baixar o executável (Windows ou Linux) e realiza o login/cadastro via Google OAuth 2.0 (Google Cloud). A conta é gravada no Cloudflare D1 e o download é liberado.
2. **First-Run no Executável:** O app Electron solicita o login com a mesma conta do Google, valida a sessão e inicializa o arquivo de banco de dados SQLite local.
3. **Tutorial Rápido (3 Cards):** Apresentação das funções de Leitura de Extrato, Criação de Metas e Matriz de Investimentos, seguido pela opção de importar o primeiro arquivo.

---

## 5. Resumo da Stack Técnica Oficial

| Camada | Tecnologia Escolhida | Justificativa / Função |
| :--- | :--- | :--- |
| **Shell Desktop** | **Electron** | Compilação nativa para Windows e Linux com gerenciamento do processo de servidor local. |
| **Full-Stack Framework** | **Next.js (App Router)** | Renderização de interface React com Tailwind CSS + Camada de API REST local (`/api`). |
| **Banco de Dados & ORM** | **Prisma ORM + SQLite** | Manipulação tipada do arquivo de banco de dados local (`local.db`) no dispositivo do usuário. |
| **Autenticação & Nuvem** | **Google OAuth + Cloudflare D1** | Autenticação unificada via Google e banco serverless para controle de licença e backups. |
| **Inteligência Artificial** | **Cloudflare Workers AI** | Execução serverless de modelos LLM (Llama 3 / Mistral) para resumos de notícias sem peso no PC do usuário. |
| **Segurança & Backup** | **Criptografia AES-256-GCM** | Snapshot do SQLite criptografado ponta a ponta (E2EE) no cliente antes do envio ao Cloudflare D1. |