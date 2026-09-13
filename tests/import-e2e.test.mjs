import test from 'node:test';
import assert from 'node:assert/strict';

/* Teste ponta a ponta da importação, contra o backend local em execução.

   Exercita o que os testes unitários não alcançam: o protocolo de código de
   ação, o escopo por perfil, a gravação atômica, a deduplicação entre
   importações e o efeito no painel.

   Roda contra o servidor de desenvolvimento — `pnpm dev` ou `pnpm docker:up`.
   Sem servidor no ar, a suíte é PULADA em vez de falhar, para que `pnpm test`
   continue verde offline.

   Todos os dados usados aqui são sintéticos e o teste desfaz o lote que criou. */

const BASE = process.env.TALENTUM_E2E_URL ?? 'http://127.0.0.1:3000';
const ACCOUNT_NAME = 'Conta sintética de teste automatizado';

async function serverIsUp() {
  try {
    const response = await fetch(`${BASE}/api/health/live`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

const up = await serverIsUp();
const options = up ? {} : { skip: `Backend local indisponível em ${BASE}` };

/**
 * Emite um código de ação para o par método/rota pretendido.
 *
 * A vinculação usa o caminho sem a query, como `actionCodePath` no cliente e
 * `requireActionCode` no backend.
 */
async function actionCode(method, path) {
  const route = path.split('?')[0];
  const response = await fetch(`${BASE}/api/action-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path: route }),
  });
  assert.equal(response.ok, true, 'a rota de bootstrap deveria emitir o código');
  return (await response.json()).actionCode;
}

/** Chamada funcional completa, com o código consumido no cabeçalho. */
async function call(method, path, { json, form } = {}) {
  const code = await actionCode(method, path);
  const headers = { 'X-Action-Code': code };
  let body;
  if (form) body = form;
  else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const response = await fetch(`${BASE}${path}`, { method, headers, body });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

/** Extrato sintético: nomes, valores e identificadores inventados. */
function syntheticCsv(suffix = '') {
  return [
    'Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo',
    `12/03/2026;COMPRA SINTETICA GAMA${suffix};138;E2E-0003${suffix};DEBITO;- R$ 40,00;R$ 260,00`,
    `11/03/2026;COMPRA SINTETICA BETA${suffix};664;E2E-0002${suffix};DEBITO;- R$ 100,00;R$ 300,00`,
    `10/03/2026;CREDITO SINTETICO ALFA${suffix};493;E2E-0001${suffix};CREDITO;+ R$ 400,00;R$ 400,00`,
  ].join('\n');
}

function upload(text, name = 'extrato-sintetico.csv', extra = {}) {
  const form = new FormData();
  form.set('file', new File([text], name, { type: 'text/csv' }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

test('importação ponta a ponta', options, async (t) => {
  let accountId;
  let batchId;

  await t.test('cria o perfil local de forma idempotente', async () => {
    const first = await call('POST', '/api/profile', { json: {} });
    assert.ok(first.status === 200 || first.status === 201, `status inesperado: ${first.status}`);
    const second = await call('POST', '/api/profile', { json: {} });
    assert.equal(second.payload.created, false, 'chamar duas vezes não pode criar dois perfis');
  });

  await t.test('reaproveita ou cria a conta de destino', async () => {
    const existing = await call('GET', '/api/accounts');
    const found = existing.payload.accounts?.find((account) => account.name === ACCOUNT_NAME);
    if (found) {
      accountId = found.id;
      return;
    }
    const created = await call('POST', '/api/accounts', {
      json: { name: ACCOUNT_NAME, type: 'checking', institutionName: 'Instituição sintética' },
    });
    assert.equal(created.status, 201);
    accountId = created.payload.account.id;
  });

  await t.test('a inspeção mostra a prévia sem gravar nada', async () => {
    const before = await call('GET', '/api/transactions', {});
    const countBefore = before.payload.total;

    const result = await call('POST', '/api/imports/inspect', { form: upload(syntheticCsv()) });
    assert.equal(result.status, 200);
    assert.equal(result.payload.format, 'csv');
    assert.equal(result.payload.rowCount, 3);
    assert.equal(result.payload.issueCount, 0);
    assert.equal(result.payload.closingBalanceCents, '26000');
    assert.deepEqual(result.payload.mapping.roles, [
      'date', 'description', 'document', 'externalId', 'direction', 'amount', 'balance',
    ]);

    const after = await call('GET', '/api/transactions', {});
    assert.equal(after.payload.total, countBefore, 'a inspeção não pode gravar lançamento');
  });

  await t.test('a confirmação grava o lote inteiro', async () => {
    const result = await call('POST', '/api/imports', {
      form: upload(syntheticCsv(), 'extrato-sintetico.csv', { accountId }),
    });
    assert.equal(result.status, 201, JSON.stringify(result.payload));
    assert.equal(result.payload.rowCount, 3);
    assert.equal(result.payload.importedCount, 3);
    assert.equal(result.payload.duplicateCount, 0);
    assert.equal(result.payload.balanceRecorded, true);
    batchId = result.payload.importBatchId;
  });

  await t.test('o mesmo arquivo não é importado duas vezes', async () => {
    const result = await call('POST', '/api/imports', {
      form: upload(syntheticCsv(), 'extrato-sintetico.csv', { accountId }),
    });
    assert.equal(result.status, 409);
    assert.equal(result.payload.error.code, 'DUPLICATE_BATCH');
  });

  await t.test('período sobreposto não duplica lançamento', async () => {
    // Arquivo diferente (uma linha a mais), mesmos identificadores nas outras.
    const overlapping = [
      syntheticCsv(),
      '09/03/2026;COMPRA SINTETICA DELTA;138;E2E-0004;DEBITO;- R$ 25,00;R$ 375,00',
    ].join('\n');

    const result = await call('POST', '/api/imports', {
      form: upload(overlapping, 'extrato-sintetico-2.csv', { accountId }),
    });
    assert.equal(result.status, 201, JSON.stringify(result.payload));
    assert.equal(result.payload.rowCount, 4, 'o arquivo tem quatro lançamentos');
    assert.equal(result.payload.importedCount, 1, 'só o lançamento novo entra');
    assert.equal(result.payload.duplicateCount, 3, 'os três repetidos são reconhecidos');

    await call('DELETE', `/api/imports/${result.payload.importBatchId}`);
  });

  await t.test('os lançamentos gravados aparecem na listagem', async () => {
    const result = await call('GET', `/api/transactions?accountId=${accountId}`);
    assert.equal(result.status, 200);
    const mine = result.payload.transactions.filter((row) => row.importBatchId === batchId);
    assert.equal(mine.length, 3);
    for (const row of mine) {
      assert.match(row.amountCents, /^-?\d+$/, 'o contrato devolve centavos, não texto formatado');
      assert.equal(row.status, 'posted', 'lançamento de extrato já aconteceu');
      assert.equal(row.category, null, 'sem categoria até a conciliação');
    }
  });

  await t.test('OFX percorre o mesmo fluxo, sem mapeamento de colunas', async () => {
    // OFX não tem colunas, então a inspeção devolve `mapping: null`. O caminho
    // precisa funcionar sem que o cliente invente um mapeamento vazio.
    const ofx = [
      'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', '',
      '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL',
      '<BANKTRANLIST><DTSTART>20260401<DTEND>20260430',
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260402<TRNAMT>-75.00<FITID>E2E-OFX-A<MEMO>COMPRA SINTETICA OFX</STMTTRN>',
      '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260410<TRNAMT>300.00<FITID>E2E-OFX-B<MEMO>CREDITO SINTETICO OFX</STMTTRN>',
      '</BANKTRANLIST><LEDGERBAL><BALAMT>225.00<DTASOF>20260430</LEDGERBAL>',
      '</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
    ].join('\n');

    const form = new FormData();
    form.set('file', new File([ofx], 'extrato-sintetico.ofx', { type: 'application/x-ofx' }));
    const inspected = await call('POST', '/api/imports/inspect', { form });
    assert.equal(inspected.status, 200);
    assert.equal(inspected.payload.format, 'ofx');
    assert.equal(inspected.payload.mapping, null, 'OFX não tem mapeamento de colunas');
    assert.equal(inspected.payload.rowCount, 2);
    assert.equal(inspected.payload.closingBalanceCents, '22500');

    const commitForm = new FormData();
    commitForm.set('file', new File([ofx], 'extrato-sintetico.ofx', { type: 'application/x-ofx' }));
    commitForm.set('accountId', accountId);
    const committed = await call('POST', '/api/imports', { form: commitForm });
    assert.equal(committed.status, 201, JSON.stringify(committed.payload));
    assert.equal(committed.payload.importedCount, 2);

    await call('DELETE', `/api/imports/${committed.payload.importBatchId}`);
  });

  await t.test('o mapeamento conferido é salvo e reaplicado no layout seguinte', async () => {
    // Layout próprio, para não colidir com mapeamentos de outros testes.
    const header = 'Quando;Detalhe;Chave;Natureza;Montante;Acumulado';
    const linha = (dia, id, tipo, valor, saldo) =>
      `${dia}/05/2026;LANCAMENTO SINTETICO ${id};MAP-${id};${tipo};${valor};${saldo}`;
    const maio = [header, linha('12', 'A', 'DEBITO', '- R$ 30,00', 'R$ 70,00'), linha('11', 'B', 'CREDITO', '+ R$ 100,00', 'R$ 100,00')].join('\n');

    const primeira = await call('POST', '/api/imports/inspect', { form: upload(maio, 'maio.csv') });
    assert.equal(primeira.status, 200);
    assert.equal(primeira.payload.mappingSource, 'inferido', 'na primeira vez não há nada salvo');
    assert.equal(primeira.payload.canRememberMapping, true);

    // Confirma corrigindo uma coluna: "Chave" vira identificador, não documento.
    const roles = ['date', 'description', 'externalId', 'direction', 'amount', 'balance'];
    const form = upload(maio, 'maio.csv', {
      accountId,
      mapping: JSON.stringify({ roles }),
      rememberMapping: 'true',
    });
    const gravada = await call('POST', '/api/imports', { form });
    assert.equal(gravada.status, 201, JSON.stringify(gravada.payload));
    assert.ok(gravada.payload.savedMapping, 'o mapeamento deveria ter sido salvo');

    // Outro mês, mesmo layout: o mapeamento volta sozinho.
    const junho = [header, linha('12', 'C', 'DEBITO', '- R$ 45,00', 'R$ 55,00'), linha('11', 'D', 'CREDITO', '+ R$ 100,00', 'R$ 100,00')]
      .join('\n')
      .replace(/\/05\/2026/g, '/06/2026');

    const segunda = await call('POST', '/api/imports/inspect', { form: upload(junho, 'junho.csv') });
    assert.equal(segunda.status, 200);
    assert.equal(segunda.payload.mappingSource, 'salvo', 'o layout deveria ter sido reconhecido');
    assert.deepEqual(segunda.payload.mapping.roles, roles, 'os papéis conferidos foram reaplicados');
    assert.ok(segunda.payload.savedMapping.name, 'a tela precisa poder nomear o mapeamento reaplicado');

    const mappings = await call('GET', '/api/csv-mappings');
    assert.equal(mappings.status, 200);
    const salvo = mappings.payload.mappings.find((m) => m.id === gravada.payload.savedMapping.id);
    assert.ok(salvo, 'o mapeamento aparece na listagem');

    await call('DELETE', `/api/imports/${gravada.payload.importBatchId}`);
    await call('DELETE', `/api/csv-mappings/${gravada.payload.savedMapping.id}`);

    // Removido o mapeamento, o reconhecimento deixa de acontecer.
    const depois = await call('POST', '/api/imports/inspect', { form: upload(junho, 'junho.csv') });
    assert.equal(depois.payload.mappingSource, 'inferido');
  });

  await t.test('sem pedir para lembrar, nada é salvo', async () => {
    const texto = ['Dia;Texto;Sinal;Cifra', '12/05/2026;LANCAMENTO SINTETICO E;DEBITO;- R$ 10,00'].join('\n');
    const gravada = await call('POST', '/api/imports', { form: upload(texto, 'sem-lembrar.csv', { accountId }) });
    assert.equal(gravada.status, 201, JSON.stringify(gravada.payload));
    assert.equal(gravada.payload.savedMapping, null, 'salvar exige pedido explícito');

    const conferindo = await call('POST', '/api/imports/inspect', { form: upload(texto, 'sem-lembrar.csv') });
    assert.equal(conferindo.payload.mappingSource, 'inferido');

    await call('DELETE', `/api/imports/${gravada.payload.importBatchId}`);
  });

  await t.test('o painel reflete a importação', async () => {
    const result = await call('GET', '/api/dashboard');
    assert.equal(result.status, 200);
    assert.equal(result.payload.hasProfile, true);
    assert.match(result.payload.balanceCents, /^-?\d+$/);
    assert.ok(result.payload.accountsWithKnownBalance >= 1, 'o saldo do extrato virou saldo conhecido');
    assert.equal(result.payload.importCount >= 1, true);
  });

  await t.test('o detalhe do lote traz os metadados, nunca o conteúdo', async () => {
    const result = await call('GET', `/api/imports/${batchId}`);
    assert.equal(result.status, 200);
    assert.equal(result.payload.batch.importedCount, 3);
    assert.ok(result.payload.batch.file, 'os metadados do arquivo ficam registrados');
    const serialized = JSON.stringify(result.payload);
    assert.doesNotMatch(serialized, /COMPRA SINTETICA GAMA/, 'o conteúdo do extrato não é devolvido pelo lote');
  });

  await t.test('desfazer o lote preserva saldo informado à mão', async () => {
    // Um saldo cadastrado depois da importação não nasceu do lote e não pode
    // ser apagado junto com ele.
    const manualName = `${ACCOUNT_NAME} (saldo manual)`;
    const existing = await call('GET', '/api/accounts');
    // Reaproveita a conta de execuções anteriores: criar uma nova a cada rodada
    // acumularia lixo no banco de desenvolvimento.
    let manualId = existing.payload.accounts?.find((account) => account.name === manualName)?.id;
    if (!manualId) {
      const manual = await call('POST', '/api/accounts', {
        json: { name: manualName, type: 'cash', balanceCents: '12345' },
      });
      assert.equal(manual.status, 201);
      manualId = manual.payload.account.id;
    }

    await call('DELETE', `/api/imports/${batchId}`);

    const accounts = await call('GET', '/api/accounts');
    const kept = accounts.payload.accounts.find((account) => account.id === manualId);
    assert.equal(kept.balanceCents, '12345', 'o saldo informado à mão sobreviveu à reversão');
  });

  await t.test('desfazer o lote remove exatamente o que ele criou', async () => {
    // O lote já foi revertido no teste anterior; confirma o efeito.
    const gone = await call('GET', `/api/imports/${batchId}`);
    assert.equal(gone.status, 404);

    const remaining = await call('GET', `/api/transactions?accountId=${accountId}`);
    const orphans = remaining.payload.transactions.filter((row) => row.importBatchId === batchId);
    assert.equal(orphans.length, 0, 'nenhum lançamento do lote sobreviveu');
  });
});

test('controles de segurança da importação', options, async (t) => {
  await t.test('requisição sem código de ação é recusada', async () => {
    const form = upload(syntheticCsv());
    const response = await fetch(`${BASE}/api/imports/inspect`, { method: 'POST', body: form });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'INVALID_ACTION_CODE');
  });

  await t.test('código de ação é de uso único', async () => {
    const code = await actionCode('GET', '/api/transactions');
    const first = await fetch(`${BASE}/api/transactions`, { headers: { 'X-Action-Code': code } });
    assert.equal(first.status, 200);
    const second = await fetch(`${BASE}/api/transactions`, { headers: { 'X-Action-Code': code } });
    assert.equal(second.status, 403, 'reutilizar o código precisa falhar');
  });

  await t.test('o código vale para a rota, independentemente do filtro', async () => {
    // A vinculação é ao contrato, não aos valores da query. Se fosse à URL
    // inteira, o backend — que só vê o pathname — nunca casaria os dois.
    const code = await actionCode('GET', '/api/transactions');
    const response = await fetch(`${BASE}/api/transactions?limit=5`, { headers: { 'X-Action-Code': code } });
    assert.equal(response.status, 200);
  });

  await t.test('código emitido para outra rota não serve', async () => {
    const code = await actionCode('GET', '/api/dashboard');
    const response = await fetch(`${BASE}/api/transactions`, { headers: { 'X-Action-Code': code } });
    assert.equal(response.status, 403, 'o código é vinculado ao contrato');
  });

  await t.test('código emitido para outro método não serve', async () => {
    const code = await actionCode('POST', '/api/transactions');
    const response = await fetch(`${BASE}/api/transactions`, { headers: { 'X-Action-Code': code } });
    assert.equal(response.status, 403);
  });

  await t.test('a rota de bootstrap não emite código para si mesma', async () => {
    const response = await fetch(`${BASE}/api/action-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'POST', path: '/api/action-codes' }),
    });
    assert.equal(response.status, 400);
  });

  await t.test('conteúdo binário disfarçado de CSV é recusado', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);
    const form = new FormData();
    form.set('file', new File([bytes], 'malicioso.csv', { type: 'text/csv' }));
    const result = await call('POST', '/api/imports/inspect', { form });
    assert.equal(result.status, 400);
    assert.ok(['BINARY_CONTENT', 'UNREADABLE_ENCODING', 'UNSUPPORTED_FORMAT'].includes(result.payload.error.code));
  });

  await t.test('o formato vem do conteúdo, não da extensão declarada', async () => {
    const ofx = 'OFXHEADER:100\n\n<OFX><BANKTRANLIST><DTSTART>20260301<DTEND>20260331<STMTTRN><DTPOSTED>20260302<TRNAMT>-10.00<FITID>E2E-OFX-1<MEMO>SINTETICO</STMTTRN></BANKTRANLIST></OFX>';
    const form = new FormData();
    // Nome e tipo mentem: dizem CSV, o conteúdo é OFX.
    form.set('file', new File([ofx], 'disfarce.csv', { type: 'text/csv' }));
    const result = await call('POST', '/api/imports/inspect', { form });
    assert.equal(result.status, 200);
    assert.equal(result.payload.format, 'ofx');
  });

  await t.test('importar sem escolher conta é recusado', async () => {
    const result = await call('POST', '/api/imports', { form: upload(syntheticCsv('-x')) });
    assert.equal(result.status, 400);
    assert.equal(result.payload.error.code, 'ACCOUNT_REQUIRED');
  });

  await t.test('conta inexistente é recusada sem revelar se existe', async () => {
    const result = await call('POST', '/api/imports', {
      form: upload(syntheticCsv('-y'), 'x.csv', { accountId: 'conta-que-nao-existe' }),
    });
    assert.equal(result.status, 404);
    assert.equal(result.payload.error.code, 'ACCOUNT_NOT_FOUND');
  });

  await t.test('lote de outro identificador não vaza dados', async () => {
    const result = await call('GET', '/api/imports/lote-inexistente-123');
    assert.equal(result.status, 404);
    assert.equal(result.payload.error.code, 'IMPORT_NOT_FOUND');
  });

  await t.test('filtro inválido é recusado no backend', async () => {
    const result = await call('GET', '/api/transactions?limit=99999');
    assert.equal(result.status, 400);
    assert.equal(result.payload.error.code, 'INVALID_QUERY');
  });

  await t.test('respostas privadas não são cacheáveis', async () => {
    const code = await actionCode('GET', '/api/dashboard');
    const response = await fetch(`${BASE}/api/dashboard`, { headers: { 'X-Action-Code': code } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  await t.test('erro não devolve stack trace nem caminho interno', async () => {
    const result = await call('POST', '/api/imports/inspect', { form: upload('') });
    const serialized = JSON.stringify(result.payload);
    assert.doesNotMatch(serialized, /at \w+|node_modules|[A-Za-z]:\\\\|\/app\/|prisma/i);
  });
});

/* Rotas de tendência do painel — elementos G-1 e G-3 de docs/DASHBOARD.md. */
test('rotas de tendência do painel', options, async (t) => {
  await t.test('a projeção de caixa nunca incorpora renda futura', async () => {
    const result = await call('GET', '/api/dashboard/risk-free-balance');
    assert.equal(result.status, 200);
    if (!result.payload.hasProfile) return;

    assert.match(result.payload.balanceCents, /^-?\d+$/, 'centavos inteiros, não texto');
    assert.match(result.payload.riskFreeBalanceCents, /^-?\d+$/);

    // O saldo livre é exatamente saldo menos comprometido: nenhuma entrada
    // prevista pode aparecer no meio.
    const esperado = BigInt(result.payload.balanceCents) - BigInt(result.payload.committedCents);
    assert.equal(result.payload.riskFreeBalanceCents, esperado.toString());

    const serialized = JSON.stringify(result.payload);
    assert.doesNotMatch(serialized, /R\$/, 'o backend não devolve texto monetário formatado');
  });

  await t.test('a projeção começa no saldo e só cai nos vencimentos', async () => {
    const result = await call('GET', '/api/dashboard/risk-free-balance');
    if (!result.payload.hasProfile) return;
    const { points } = result.payload.projection;
    if (points.length === 0) return;

    for (const point of points) {
      assert.match(point.balanceCents, /^-?\d+$/);
      assert.match(point.dueCents, /^-?\d+$/);
      assert.match(point.day, /^\d{4}-\d{2}-\d{2}$/);
    }
    // O último ponto é o saldo final declarado.
    assert.equal(points[points.length - 1].balanceCents, result.payload.projection.endingBalanceCents);
  });

  await t.test('o fluxo mensal só devolve mês com cobertura de extrato', async () => {
    const result = await call('GET', '/api/dashboard/cash-flow');
    assert.equal(result.status, 200);
    if (!result.payload.hasProfile) return;

    for (const month of result.payload.months) {
      assert.match(month.month, /^\d{4}-\d{2}$/);
      assert.ok(['full', 'partial'].includes(month.coverage), 'mês sem cobertura não pode ser devolvido');
      // O resultado é sempre entradas menos saídas: nada é inventado no meio.
      const esperado = BigInt(month.incomeCents) - BigInt(month.expenseCents);
      assert.equal(month.netCents, esperado.toString());
    }
  });

  await t.test('sem nenhum extrato, a série vem vazia em vez de zerada', async () => {
    const result = await call('GET', '/api/dashboard/cash-flow');
    if (!result.payload.hasProfile) return;
    if (result.payload.coverageRanges === 0) {
      assert.deepEqual(result.payload.months, [], 'série vazia é diferente de série de zeros');
    }
  });

  await t.test('as rotas de tendência exigem código de ação', async () => {
    for (const path of ['/api/dashboard/cash-flow', '/api/dashboard/risk-free-balance']) {
      const response = await fetch(`${BASE}${path}`);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
    }
  });
});
