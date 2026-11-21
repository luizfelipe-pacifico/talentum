// Telas do Talentum reconstruídas do código, em coordenadas de 1920x1080 (1 px de tela = 1 px aqui).
// Medidas, cores e fontes tiradas do DOM do aplicativo rodando no servidor isolado de teste (tema claro,
// barra lateral escura), com os mesmos dados fictícios do filme: nenhum valor pertence a alguém.
// Cada tela é function(c, st), pura.

// ---------- tokens do produto (src/app/globals.css, tema claro) ----------
const P = {
  shell: '#f4f1ea', side: '#1a110a', surface: '#fffdf8', ink: '#1a110a', ink2: '#4a4a4a',
  line: 'rgba(26,17,10,0.16)', lineStrong: 'rgba(26,17,10,0.3)', amber: '#b8773d', onAmber: '#fffdf8',
  // contraste AA: preenchimento com texto claro em --amber-strong, texto em âmbar em --amber-text
  amberStrong: '#9f6533', amberText: '#8f5a24',
  sideText: '#f1ece3', sideMuted: '#b7b2a9', navText: '#cfc9c0', walnut: '#5c4033', info: '#3e5c76', infoS: '#e7edf3', data1: '#2a78d6',
};
// Como na LP: Playfair só nos títulos grandes; rótulos, chips, listas e legendas em Montserrat.
const _fontKit = font;
// As telas do produto ficam de fora: os títulos delas são Playfair em qualquer tamanho.
let _fonteDoProduto = false;
font = (size, weight = 400, ui = false) => _fontKit(size, weight, ui || (size < 40 && !_fonteDoProduto));
const IMG = {}; // imagens carregadas em cenas.js (marca e ilustração de estado)

// Bootstrap Icons (preenchidos, viewBox 16) além dos Lucide do kit.
const _bi = {};
const _iconKit = icon;
icon = function (c, name, x, y, size, color, opts = {}) {
  const src = window.ICONES?.bi?.[name];
  if (!src) return _iconKit(c, name, x, y, size, color, opts);
  _bi[name] ??= src.map(p => ({ p: new Path2D(p.d), eo: p.eo }));
  c.save(); c.translate(x, y); c.scale(size / 16, size / 16); c.fillStyle = color;
  for (const { p, eo } of _bi[name]) c.fill(p, eo ? 'evenodd' : 'nonzero');
  c.restore();
};

// texto pelo topo e altura da caixa medida no DOM (centro vertical da linha)
function txu(c, s, x, top, h, size, { w = 400, color = P.ink, align = 'left', track = 0, disp = false } = {}) {
  _fonteDoProduto = disp;
  try { tx(c, s, x, top + h / 2, size, { w, color, align, track, ui: !disp }); } finally { _fonteDoProduto = false; }
}
function linhaH(c, x, y, w, color = P.line) { c.fillStyle = color; c.fillRect(x, y, w, 1); }
function tracejado(c, x, y, w, h, r, color) { c.save(); c.setLineDash([4, 3]); strokeR(c, x, y, w, h, r, color); c.restore(); }
function cartao(c, x, y, w, h) { fillR(c, x, y, w, h, 8, P.surface); strokeR(c, x, y, w, h, 8, P.line); }
function botao(c, s, x, y, w, h, { primario = false, ic = null } = {}) {
  if (primario) fillR(c, x, y, w, h, 6, P.amberStrong); else strokeR(c, x, y, w, h, 6, P.lineStrong);
  if (ic) { icon(c, ic, x + 14, y + h / 2 - 7.5, 15, P.ink); tx(c, s, x + 37, y + h / 2, 13, { w: 600, color: P.ink, ui: true }); }
  else tx(c, s, x + w / 2, y + h / 2, primario ? 14 : 13, { w: 600, color: primario ? P.onAmber : P.ink, align: 'center', ui: true });
}

// ---------- casco: barra lateral, cabeçalho e controles (src/components/app-shell.tsx) ----------
const NAV = [['speedometer2', 'Dashboard'], ['receipt', 'Extratos'], ['check2-square', 'Conciliação'], ['calendar2-range', 'Planejamento'],
  ['columns-gap', 'Patrimônio'], ['newspaper', 'Invest'], ['clock-history', 'Histórico']];
function cascoApp(c, ativo, titulo, contexto) {
  c.fillStyle = P.shell; c.fillRect(0, 0, 1920, 1080);
  c.fillStyle = P.side; c.fillRect(0, 0, 248, 1080);
  if (IMG.marca) c.drawImage(IMG.marca, 20, 26, 38, 33);
  txu(c, 'Talentum', 68, 30, 24, 19, { w: 600, color: P.sideText, track: 0.02, disp: true });
  fillR(c, 12, 72, 223, 52, 6, 'rgba(241,236,227,0.07)'); strokeR(c, 12, 72, 223, 52, 6, 'rgba(241,236,227,0.14)');
  icon(c, 'bank', 23, 90, 15, P.amber);
  txu(c, 'CONTA ATIVA', 48, 82, 14, 12, { w: 600, color: P.sideMuted, track: 0.1 });
  txu(c, 'Todas as contas', 48, 96, 18, 13, { w: 600, color: P.sideText });
  icon(c, 'chevron-expand', 212, 92, 12, P.sideMuted);
  NAV.forEach(([ic, nome], i) => {
    const y = 136 + i * 44, on = i === ativo;
    if (on) { fillR(c, 12, y, 223, 42, 6, 'rgba(241,236,227,0.12)'); fillR(c, 12, y + 9, 3, 24, 1.5, P.amber); }
    icon(c, ic, 26, y + 13, 16, on ? P.amber : P.navText);
    txu(c, nome, 55, y + 11, 20, 14, { w: on ? 600 : 500, color: on ? '#fffdf8' : P.navText });
  });
  tracejado(c, 12, 923, 223, 44, 6, 'rgba(241,236,227,0.32)');
  icon(c, 'cloud-arrow-up', 27, 937, 16, P.sideText); txu(c, 'Importação rápida', 56, 935, 20, 13, { color: P.sideText });
  icon(c, 'gear', 26, 988, 15, P.sideMuted); txu(c, 'Configurações', 55, 986, 20, 13, { color: P.sideMuted });
  linhaH(c, 12, 1025, 223, 'rgba(241,236,227,0.12)');
  icon(c, 'chevron-double-left', 26, 1040, 14, P.sideMuted); txu(c, 'Recolher menu', 53, 1038, 20, 12, { color: P.sideMuted });
  // cabeçalho
  c.fillStyle = P.surface; c.fillRect(248, 0, 1672, 88); linhaH(c, 248, 87, 1672);
  txu(c, titulo, 272, 12, 43, 36, { w: 600, color: P.ink, track: -0.01, disp: true });
  txu(c, contexto, 272, 57, 18, 13, { color: P.ink2 });
  botao(c, 'Lançar dinheiro', 1215, 23, 157, 42, { ic: 'cash-coin' });
  strokeR(c, 1382, 25, 38, 38, 6, P.lineStrong); icon(c, 'lock', 1393, 36, 16, P.ink);
  strokeR(c, 1430, 25, 38, 38, 6, P.lineStrong); icon(c, 'bell', 1441, 36, 16, P.ink);
  c.beginPath(); c.arc(1464, 29, 9, 0, 7); c.fillStyle = P.amberStrong; c.fill(); tx(c, '2', 1464, 29.5, 10, { w: 700, color: P.onAmber, align: 'center', ui: true });
  fillR(c, 1478, 25, 124, 38, 6, P.surface); strokeR(c, 1478, 25, 124, 38, 6, P.lineStrong);
  icon(c, 'sun', 1489, 37, 14, P.ink); txu(c, 'Claro', 1511, 32, 24, 13, { w: 500 }); icon(c, 'chevron-down', 1581, 39, 10, P.ink2);
  strokeR(c, 1612, 24, 181, 40, 6, P.lineStrong); fillR(c, 1618, 30, 28, 28, 6, P.walnut);
  tx(c, '--', 1632, 44.5, 12, { w: 700, color: P.onAmber, align: 'center', ui: true });
  txu(c, 'Configurar perfil', 1654, 32, 24, 13, { w: 600 }); icon(c, 'chevron-down', 1771, 39, 11, P.ink);
  c.fillStyle = P.ink; c.fillRect(1803, 29, 1, 30);
  c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.beginPath();
  c.moveTo(1818, 43.5); c.lineTo(1828, 43.5); c.rect(1851.5, 38.5, 9, 9); c.moveTo(1884, 38); c.lineTo(1894, 48); c.moveTo(1894, 38); c.lineTo(1884, 48); c.stroke();
}
function abas(c, itens, ativa) {
  let x = 364;
  itens.forEach(([nome, w], i) => {
    const on = i === ativa; tx(c, nome, x + w / 2, 143, 14, { w: on ? 600 : 500, color: on ? P.ink : P.ink2, align: 'center', ui: true });
    if (on) { c.fillStyle = P.amber; c.fillRect(x, 164, w, 2); } x += w + 4;
  });
  linhaH(c, 364, 166, 1440);
}

// ---------- extratos: importar (src/components/import-wizard.tsx) ----------
function telaImportar(c) {
  cascoApp(c, 1, 'Extratos e cartões', 'Importação, lançamentos, faturas e benefícios');
  abas(c, [['Lançamentos', 128], ['Cartões e benefícios', 175], ['Faturas e recorrências', 187]], 0);
  cartao(c, 364, 191, 1440, 550);
  txu(c, 'IMPORTAR EXTRATO', 393, 220, 16, 12, { w: 700, color: P.ink2, track: 0.08 });
  txu(c, 'Escolha o arquivo do seu banco', 393, 256, 36, 28, { w: 600, track: -0.01, disp: true });
  txu(c, 'Aceita CSV, OFX e PDF. O arquivo é lido no seu computador e não é enviado à nuvem. Nada é gravado antes de você conferir a leitura.', 393, 312, 24, 16, { color: P.ink2 });
  fillR(c, 393, 356, 1382, 282, 8, P.shell); tracejado(c, 393, 356, 1382, 282, 8, P.lineStrong);
  if (IMG.importar) c.drawImage(IMG.importar, 1028, 401, 112, 112);
  txu(c, 'Arraste o arquivo para cá ou escolha no computador.', 1084, 521, 24, 16, { color: P.ink2, align: 'center' });
  botao(c, 'Escolher arquivo', 1004, 545, 160, 48, { primario: true });
  fillR(c, 393, 658, 1382, 54, 6, P.infoS); strokeR(c, 393, 658, 1382, 54, 6, P.info);
  icon(c, 'shield-lock', 408, 677, 16, P.info);
  txu(c, 'O conteúdo do extrato não é armazenado. O sistema guarda apenas os lançamentos, o período coberto e os metadados do arquivo.', 436, 673, 19, 13);
  cardImportacoes(c, 364, 773, 1440);
}
// "Importações anteriores": o mesmo cartão, em qualquer largura (o herói usa 760 px)
function cardImportacoes(c, x, y, w) {
  const col = w >= 1200 ? [25, 468, 731, w - 25] : [24, 300, 470, w - 24];
  cartao(c, x, y, w, 185);
  txu(c, 'Importações anteriores', x + 25, y + 25, 30, 22, { w: 600, disp: true });
  if (w >= 1200) txu(c, 'Abra um lote para ver os detalhes ou desfazê-lo.', x + w - 25, y + 25, 19, 13, { color: P.ink2, align: 'right' });
  [['ARQUIVO', col[0]], ['CONTA', col[1]], ['PERÍODO', col[2]]].forEach(([s, cx]) => txu(c, s, x + cx, y + 73, 45, 12, { w: 700, color: P.ink2, track: 0.06 }));
  txu(c, 'GRAVADOS', x + col[3], y + 73, 45, 12, { w: 700, color: P.ink2, track: 0.06, align: 'right' });
  linhaH(c, x + 25, y + 118, w - 50, P.lineStrong);
  const nome = 'extrato-ficticio.csv'; txu(c, nome, x + col[0], y + 130, 18, 14, { color: P.amberText });
  txu(c, '· CSV', x + col[0] + tw(c, nome, 14, 400, 0, true) + 4, y + 131, 16, 13, { color: P.ink2 });
  txu(c, 'Conta corrente', x + col[1], y + 118, 42, 13, { color: P.ink2 });
  txu(c, w >= 1200 ? '01/11/2026 – 20/11/2026' : '01/11 – 20/11/2026', x + col[2], y + 118, 42, 13);
  txu(c, '18', x + col[3], y + 118, 42, 14, { align: 'right' });
}

// ---------- conciliação: fila de pendências (src/components/reconciliation.tsx) ----------
const FILA = [['SALARIO EMPRESA EXEMPLO', 1, 'R$ 5.200,00'], ['MERCADO BOM PRECO', 2, 'R$ -312,40'], ['PADARIA AURORA', 3, 'R$ -18,90'],
  ['POSTO ESTRADA', 4, 'R$ -180,00'], ['STREAMING FILMES', 5, 'R$ -39,90'], ['FARMACIA CENTRAL', 6, 'R$ -64,30']];
function itemFila(c, x, y, w, [nome, dia, valor]) {
  cartao(c, x, y, w, 125);
  txu(c, nome, x + 25, y + 27, 19, 16, { w: 700, color: P.amberText });
  txu(c, `Conta corrente · ${dia} de novembro de 2026`, x + 25, y + 49, 24, 16, { color: P.ink2 });
  strokeR(c, x + 25, y + 73, 103, 27, 4, P.lineStrong); tx(c, 'Sem categoria', x + 76.5, y + 87, 11, { w: 700, color: P.ink2, align: 'center', ui: true });
  txu(c, valor, x + w - 25, y + 25, 24, 16, { w: 700, color: P.amberText, align: 'right' });
}
// st.pendentes: número no título · st.sem: índice do item que virou um plano à parte · st.sobe: 0..1, a fila fecha o vão
function telaConciliacao(c, st = {}) {
  cascoApp(c, 2, 'Conciliação financeira', 'Confirme ou corrija o que ficou em dúvida');
  abas(c, [['Fila de pendências', 167], ['Conferência de fatura', 184]], 0);
  cartao(c, 364, 191, 1440, 114);
  txu(c, 'CONCILIAÇÃO', 389, 216, 16, 12, { w: 700, color: P.ink2, track: 0.08 });
  txu(c, `${st.pendentes ?? 18} itens pendentes`, 389, 250, 30, 22, { w: 600, disp: true });
  c.save(); c.beginPath(); c.rect(0, 320, 1920, 760); c.clip();
  FILA.forEach((it, k) => {
    if (k === st.sem) return;
    const sobe = st.sem != null && k > st.sem ? 157 * ease.inOut(clamp(st.sobe ?? 0)) : 0;
    itemFila(c, 364, 337 + k * 157 - sobe, 1440, it);
  });
  c.restore();
}
function slotItemFila(k) { return { x: 364, y: 337 + k * 157, w: 1440, h: 125 }; }

// ---------- dashboard (src/components/dashboard.tsx) ----------
const brl = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// cartão do Saldo Livre de Risco em qualquer largura; st.valor: número exibido
function cardSaldo(c, x, y, w, st = {}) {
  cartao(c, x, y, w, 193);
  txu(c, 'SALDO LIVRE DE RISCO · 1 A 30 DE NOVEMBRO', x + 29, y + 29, 16, 12, { w: 700, color: P.ink2, track: 0.08 });
  txu(c, 'R$', x + 29, y + 89, 31, 29.12, { w: 500, color: P.ink2, track: -0.02 });
  txu(c, brl(st.valor ?? 376.07), x + 73, y + 65, 59, 56, { w: 600, track: -0.01 });
  let cx = x + 29; const seg2 = (s, w2, cor = P.ink2) => { txu(c, s, cx, y + 144, 20, 13, { w: w2, color: cor }); cx += tw(c, s, 13, w2, 0, true); };
  seg2('3.556,07', 600, P.ink); seg2('  em conta  ', 400); icon(c, 'dash', cx - 4, y + 147, 14, P.ink2); cx += 14;
  seg2('  3.180,00', 600, P.ink); seg2('  já comprometidos em 3 obrigações', 400);
}
const KPIS = [['SALDO EM CONTA', '3.556,07', ['1 conta com saldo conhecido, saldo', 'informado em 20 de novembro']],
  ['GASTOS DO MÊS', '1.793,93', ['Sem base de comparação no mesmo', 'período do mês anterior.']],
  ['MÉDIA DIÁRIA', '85,43', ['Sem base de comparação no ritmo do mês', 'anterior.']],
  ['COMPROMETIDO NO PERÍODO', '3.180,00', ['3 obrigações vencem até o fim do período.']]];
function telaDashboard(c, st = {}) {
  cascoApp(c, 0, 'Dashboard', 'Sua posição financeira atual');
  if (!st.semSaldo) cardSaldo(c, 364, 120, 1440, st);
  KPIS.forEach(([rot, val, desc], i) => {
    const x = 364 + i * 366; cartao(c, x, 345, 342, i === 3 ? 156 : 175);
    txu(c, rot, x + 25, 370, 16, 12, { w: 700, color: P.ink2, track: 0.08 });
    txu(c, 'R$', x + 25, 417, 18, 15.6, { w: 500, color: P.ink2 }); txu(c, val, x + 53, 404, 35, 30, { w: 600 });
    desc.forEach((l, k) => txu(c, l, x + 25, 456 + k * 19, 19, 13, { color: P.ink2 }));
  });
  cartao(c, 364, 551, 1440, 188);
  txu(c, 'Precisa da sua decisão', 389, 576, 30, 22, { w: 600, disp: true });
  txu(c, '18 lançamentos aguardam confirmação. Lançamentos pendentes só entram no saldo e nos gastos depois de confirmados.', 389, 624, 24, 16, { color: P.ink2 });
  botao(c, 'Abrir fila de conciliação', 389, 666, 209, 48, { primario: true });
  cartao(c, 364, 771, 1440, 720);
  txu(c, 'O dinheiro cobre os compromissos do período', 389, 796, 30, 22, { w: 600, disp: true });
  txu(c, '21/11 a 30/11', 1779, 796, 19, 13, { color: P.ink2, align: 'right' });
  c.fillStyle = 'rgba(42,120,214,0.12)'; c.fillRect(420, 891, 590, 300); c.fillRect(1010, 972, 443, 220);
  c.strokeStyle = P.data1; c.lineWidth = 3; c.beginPath(); c.moveTo(420, 891); c.lineTo(1010, 891); c.lineTo(1010, 972); c.lineTo(1453, 972); c.lineTo(1453, 1080); c.stroke();
}
