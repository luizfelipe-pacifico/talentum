// Talentum · filme publicitário, 32 s, 16:9. Arco publicitário da skill motion-product:
//   dúvida do mês → traço âmbar e CLAREZA → "Apresentando" → 3 momentos de um sábado de manhã (importar, conciliar,
//   ver o saldo livre) → o número que sobra, com o que já foi descontado → campo âmbar com o lema → slogan → marca.
// Dados fictícios, os mesmos do servidor isolado de teste: R$ 3.556,07 em conta, R$ 3.180,00 em 3 obrigações,
// R$ 376,07 de Saldo Livre de Risco. MARCOS alimenta `render.mjs --marcos`.
const A = { caos: 0, traco: 3.0, pilula: 4.8, m1: 7.4, m2: 10.8, m3: 14.2, res: 17.8, campo: 21.2, slogan: 24.6, fecho: 27.6 };
window.MARCOS = A;

// dores do mês: ícones do próprio produto (Bootstrap Icons)
const DORES = [['calendar-event', '#d9a93e', 'Fatura vence dia 25'], ['house', '#cfc9c0', 'Aluguel no dia 28'], ['tv', '#8fb4ce', 'Streaming renovou sozinho'],
  ['question-circle', '#e08c8c', 'Quanto posso gastar?'], ['file-earmark-spreadsheet', '#8fb283', 'Planilha parada desde março'], ['wallet2', '#d9a93e', 'R$ 3.556,07 na conta'],
  ['arrow-repeat', '#cfc9c0', 'Condomínio reajustou'], ['credit-card', '#e08c8c', 'Parcela 7 de 10'], ['lightning-charge', '#d9a93e', 'Débito automático amanhã']];
const DESCONTOS = ['Fatura do cartão · R$ 960,00', 'Aluguel · R$ 1.800,00', 'Condomínio · R$ 420,00'];
const FEITO = [A.m1 + 2.2, A.m2 + 2.3, A.m3 + 2.4];
const HEROI_W = 760;
// o selo de cada momento diz o que aconteceu, em vez de "Em andamento" e "Concluído"
const SELOS = new Map([[FEITO[0], { antes: 'Lendo o arquivo', depois: '18 lançamentos gravados' }], [FEITO[1], { antes: '18 pendentes', depois: '17 pendentes' }], [FEITO[2], { antes: 'Descontando', depois: 'R$ 376,07 livres' }]]);
const _seloEstado = seloEstado;
seloEstado = (x, y, t, feito, opts) => _seloEstado(x, y, t, feito, opts || SELOS.get(feito));
let CHIPS, telaImp, telaConc, telaDash, heroiImp, itemConc, heroiSaldo, chaveConc = '';

function monta() {
  CHIPS = montaCaos(DORES);
  // momento 1: a tela de importação sobre a mesa; o cartão "Importações anteriores" nasce escaneado à frente
  telaImp = plano(null, 1920, 1080, { r: 22 }); pinta(telaImp, telaImportar, {});
  heroiImp = plano(null, HEROI_W, 185, { res: 2, r: 8, sombra: '0 50px 100px rgba(0,0,0,.6)', heroi: true, nome: 'importações' });
  // momento 2: a fila de conciliação; o item decidido descola e sai, a fila fecha o vão e a contagem cai
  telaConc = plano(null, 1920, 1080, { r: 22 });
  const sl = slotItemFila(1);
  itemConc = plano(telaConc.el, sl.w, sl.h, { res: 1.5, r: 8, ax: sl.x + sl.w / 2, ay: sl.y + sl.h / 2, sombra: '0 40px 70px rgba(0,0,0,.45)' });
  { const c = itemConc.ctx; c.scale(1.5, 1.5); itemFila(c, 0, 0, sl.w, FILA[1]); }
  // momento 3: o dashboard sobre a mesa; o cartão do Saldo Livre de Risco à frente, com o número descendo
  telaDash = plano(null, 1920, 1080, { r: 22 }); pinta(telaDash, telaDashboard, { semSaldo: true });
  heroiSaldo = plano(null, HEROI_W, 193, { res: 2, r: 8, sombra: '0 50px 100px rgba(0,0,0,.6)', heroi: true, nome: 'saldo livre' });
}
function pintaConc(st) { const k = JSON.stringify(st); if (k !== chaveConc) { pinta(telaConc, telaConciliacao, st); chaveConc = k; } }

// o cartão-herói (760 px de largura) em um plano próprio
const noHeroi = fn => (c, st) => fn(c, 0, 0, HEROI_W, st);

// fecho com a marca oficial: o símbolo se desenha por traço, encolhe e a marca de verdade assume no lugar
function marcaOficial(t, a) {
  const lh = 150, lw = logoLargura(lh), lx = W / 2 - lw / 2, ly = 470 - lh / 2, sb = LOGO_SIMBOLO(lh), u = ease.out(seg(t, a + 1.9, a + 2.3));
  if (u <= 0 || !IMG.marca) return;
  f.save(); f.globalAlpha = u; f.fillStyle = T.primaryDeep; f.fillRect(lx + sb.x - 4, ly + sb.y - 4, sb.size + 8, sb.size + 8);
  const gg = f.createLinearGradient(0, 0, W, H); gg.addColorStop(0, T.primaryFg); gg.addColorStop(1, T.primaryDeep); f.fillStyle = gg; f.fillRect(lx + sb.x - 4, ly + sb.y - 4, sb.size + 8, sb.size + 8);
  f.drawImage(IMG.marca, lx + sb.x, ly + sb.y + sb.size * 0.06, sb.size, sb.size * 545 / 620); f.restore();
}

window.seek = t => {
  t = clamp(t, 0, DUR - 1e-4); inicioQuadro(); let halo = 0, claro = 0;
  // 1) a dúvida do mês → traço âmbar → CLAREZA
  cenaCaos(t, CHIPS, { a: A.caos, traco: A.traco, fim: A.pilula, caos: 'DÚVIDA', virada: 'CLAREZA', viradaTam: 300 });
  // 2) "Apresentando" + pílula + clique + flash
  if (t >= A.pilula - 0.1 && t < A.m1 + 0.1) ({ halo, claro } = cenaApresentando(t, A.pilula + 0.1, A.m1));
  // 3) momento 1: importar
  if (t >= A.m1 - 0.1 && t < A.m2 + 0.1) {
    telaMesa(telaImp, t, A.m1, A.m2, { x: 760, y: 120, lado: 1, rz: -14 });
    pintaVarrendo(heroiImp, noHeroi(cardImportacoes), {}, 0, 0, HEROI_W, 185, seg(t, A.m1 + 0.6, A.m1 + 1.6));
    heroiEntra(heroiImp, t, A.m1 + 0.3, A.m2, { x: 480, y: 60, s: 0.94 });
    blocoTitulo(t, A.m1 + 0.3, A.m2 - 0.45, 'SÁBADO · 08:10', 'O extrato entra.', 'Nada sai daqui.', 120, FEITO[0], { size: 84 });
  }
  // 4) momento 2: conciliar
  if (t >= A.m2 - 0.1 && t < A.m3 + 0.1) {
    const a = A.m2 + 0.9, sai = ease.inOut(seg(t, a, a + 0.9)), fecha = seg(t, a + 0.7, a + 1.3);
    pintaConc({ sem: sai > 0 ? 1 : null, sobe: fecha, pendentes: fecha >= 0.5 ? 17 : 18 });
    telaMesa(telaConc, t, A.m2, A.m3, { x: 700, y: 100, lado: 1, rz: -12, blurBase: 1.5 });
    if (sai <= 0) pose(itemConc, {});
    else { const lift = ease.out(seg(t, a, a + 0.3)); pose(itemConc, { x: 1500 * sai, z: 200 * lift, rx: -12 * lift, rz: 5 * sai, s: 1 + 0.1 * lift, o: 1 - seg(t, a + 0.6, a + 0.9) }); }
    blocoTitulo(t, A.m2 + 0.3, A.m3 - 0.45, 'SÁBADO · 08:12', 'Você confirma', 'só a dúvida.', 120, FEITO[1], { size: 84 });
  }
  // 5) momento 3: o saldo livre
  if (t >= A.m3 - 0.1 && t < A.res + 0.1) {
    telaMesa(telaDash, t, A.m3, A.res, { x: 760, y: 120, lado: 1, rz: -14 });
    const desce = ease.inOut(seg(t, A.m3 + 1.3, A.m3 + 2.4)), valor = Math.round((3556.07 - 3179.99 * desce) * 100) / 100;
    pintaVarrendo(heroiSaldo, noHeroi(cardSaldo), { valor: desce >= 1 ? 376.07 : valor }, 0, 0, HEROI_W, 193, seg(t, A.m3 + 0.5, A.m3 + 1.3));
    heroiEntra(heroiSaldo, t, A.m3 + 0.3, A.res, { x: 480, y: 60, s: 0.94 });
    blocoTitulo(t, A.m3 + 0.3, A.res - 0.45, 'SÁBADO · 08:15', 'Isto é o que', 'sobra de verdade.', 120, FEITO[2], { size: 84 });
  }
  // 6) o número que sobra, com o que já foi descontado
  if (t >= A.res && t < A.campo + 0.3) {
    const a = A.res, scr = seg(t, a + 0.8, a + 1.6);
    frase('NOVEMBRO · ATÉ O DIA 30', 165, 330, 28, seg(t, a + 0.05, a + 0.45), { w: 700, cor: T.muted, track: 0.14 });
    linhaMascara(t < a + 0.8 ? 'R$ 0,00' : 'R$ ' + embaralha(scr >= 1 ? '376,07' : '000,00', scr, 29), 160, 560, 200, seg(t, a + 0.05, a + 0.6), scr >= 1 ? T.primary : T.fg);
    if (t < a + 1.9) frase('livres para gastar', 165, 660, 52, seg(t, a + 0.25, a + 0.7), { w: 600, cor: T.muted });
    else seloOk(165, 640, ease.back(seg(t, a + 1.9, a + 2.25)), 'Compromissos descontados');
    frase('JÁ DESCONTADO', 1060, 330, 28, seg(t, a + 0.15, a + 0.55), { w: 700, cor: T.muted, track: 0.14 });
    listaMarcada(DESCONTOS, 1040, 430, t, a + 0.3, k => seg(t, a + 0.9 + k * 0.3, a + 1.2 + k * 0.3), { passo: 84, size: 34 });
  }
  // 7) campo âmbar com o lema; slogan sobre o âmbar
  if (campoCor(t, A.campo, { de: [400, 672] }) > 0 && t < A.fecho + 0.6) {
    const a = A.campo;
    tinta('Clareza para o presente.', 470, 104, seg(t, a + 0.15, a + 0.6), seg(t, A.slogan - 0.35, A.slogan - 0.1), { w: 700 });
    tinta('Disciplina para o futuro.', 620, 104, seg(t, a + 0.35, a + 0.8), seg(t, A.slogan - 0.3, A.slogan - 0.05), { w: 700 });
    sloganTroca(t, A.slogan, A.fecho, ['Seu extrato', 'Sua fatura', 'Seu saldo'], ' não vai para a nuvem.', { passo: 0.8, size: 84 });
  }
  // 8) fecho: símbolo desenhado → marca oficial e nome; assinatura; silêncio no som
  cenaFecho(t, A.fecho, { assinatura: 'Quanto sobra de verdade, sem planilha.' });
  marcaOficial(t, A.fecho);
  // anel de progresso durante os momentos
  const feitas = FEITO.reduce((n, ft) => n + ease.out(seg(t, ft, ft + 0.4)), 0), ap = ease.expoOut(seg(t, A.m1 - 0.2, A.m1 + 0.4)) * (1 - seg(t, A.res - 0.3, A.res));
  anelProgresso(feitas, 3, ap, n => `Novembro · ${n} de 3 passos`);
  fimQuadro(t, halo, claro);
};

const imagem = (src, chave) => new Promise(r => { const img = new Image(); img.onload = () => { IMG[chave] = img; r(); }; img.onerror = () => r(); img.src = src; });
carregar(monta, [imagem('../assets/img/talentum-escura.svg', 'marca'), imagem('../assets/img/importar-extrato.svg', 'importar')]);
