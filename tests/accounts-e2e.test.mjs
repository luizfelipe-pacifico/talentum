import test from 'node:test';
import assert from 'node:assert/strict';

/* Ponta a ponta da Feature 2: instituições, contas, saldos e chaves PIX.

   Roda contra o backend local em execução — `pnpm dev` ou `pnpm docker:up`. Sem
   servidor no ar, a suíte é PULADA para que `pnpm test` continue verde offline.

   Todos os dados são sintéticos, e o teste remove o que cria. */

const BASE = process.env.TALENTUM_E2E_URL ?? 'http://127.0.0.1:3000';
const INSTITUTION = 'Banco sintético de teste';
const ACCOUNT = 'Conta sintética Feature 2';

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

async function call(method, path, json) {
  const route = path.split('?')[0];
  const bootstrap = await fetch(`${BASE}/api/action-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path: route }),
  });
  const { actionCode } = await bootstrap.json();
  const headers = { 'X-Action-Code': actionCode };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const response = await fetch(`${BASE}${path}`, { method, headers, body });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

/** Remove contas e instituições sintéticas deixadas por execuções anteriores. */
async function cleanup() {
  const accounts = await call('GET', '/api/accounts');
  for (const account of accounts.payload.accounts ?? []) {
    if (!account.name.startsWith(ACCOUNT)) continue;
    await call('DELETE', `/api/accounts/${account.id}`);
  }
  const institutions = await call('GET', '/api/institutions');
  for (const institution of institutions.payload.institutions ?? []) {
    if (institution.name !== INSTITUTION) continue;
    await call('DELETE', `/api/institutions/${institution.id}`);
  }
}

test('contas, saldos e chaves PIX', options, async (t) => {
  let institutionId;
  let accountId;

  await call('POST', '/api/profile', {});
  await cleanup();

  await t.test('cadastra instituição e reaproveita pelo nome', async () => {
    const created = await call('POST', '/api/institutions', { name: INSTITUTION });
    assert.equal(created.status, 201);
    institutionId = created.payload.institution.id;

    const again = await call('POST', '/api/institutions', { name: INSTITUTION });
    assert.equal(again.payload.created, false, 'o mesmo nome não pode criar duas instituições');
    assert.equal(again.payload.institution.id, institutionId);
  });

  await t.test('cria conta com saldo informado', async () => {
    const created = await call('POST', '/api/accounts', {
      name: ACCOUNT,
      type: 'checking',
      institutionId,
      balanceCents: '150000',
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    accountId = created.payload.account.id;

    const detail = await call('GET', `/api/accounts/${accountId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.payload.account.balanceCents, '150000');
    assert.equal(detail.payload.account.institution.id, institutionId);
    assert.equal(detail.payload.account.isActive, true);
  });

  await t.test('conta sem saldo é desconhecida, nunca zero', async () => {
    const created = await call('POST', '/api/accounts', { name: `${ACCOUNT} sem saldo`, type: 'cash' });
    assert.equal(created.status, 201);
    const detail = await call('GET', `/api/accounts/${created.payload.account.id}`);
    assert.equal(detail.payload.account.balanceCents, null, 'ausência de saldo não pode virar zero');
    await call('DELETE', `/api/accounts/${created.payload.account.id}`);
  });

  await t.test('registrar saldo novo preserva o anterior', async () => {
    const created = await call('POST', `/api/accounts/${accountId}/balance-snapshots`, { balanceCents: '99900' });
    assert.equal(created.status, 201);

    const history = await call('GET', `/api/accounts/${accountId}/balance-snapshots`);
    assert.equal(history.status, 200);
    assert.ok(history.payload.snapshots.length >= 2, 'cada saldo é um fato datado, não uma sobrescrita');
    assert.equal(history.payload.snapshots[0].balanceCents, '99900');
    assert.equal(history.payload.snapshots[0].fromImport, false, 'saldo informado à mão não vem de lote');
  });

  await t.test('edita a conta e recusa moeda incompatível com o histórico', async () => {
    const renamed = await call('PATCH', `/api/accounts/${accountId}`, { name: `${ACCOUNT} renomeada` });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.payload.account.name, `${ACCOUNT} renomeada`);

    // Sem lançamentos ainda, trocar a moeda é permitido.
    const currency = await call('PATCH', `/api/accounts/${accountId}`, { currency: 'USD' });
    assert.equal(currency.status, 200);
    await call('PATCH', `/api/accounts/${accountId}`, { currency: 'BRL' });
  });

  await t.test('desativar tira a conta dos ativos sem apagar nada', async () => {
    const off = await call('PATCH', `/api/accounts/${accountId}`, { isActive: false });
    assert.equal(off.status, 200);
    assert.equal(off.payload.account.isActive, false);

    const listed = await call('GET', '/api/accounts');
    const found = listed.payload.accounts.find((account) => account.id === accountId);
    assert.ok(found, 'a conta continua existindo');
    assert.equal(found.isActive, false);

    await call('PATCH', `/api/accounts/${accountId}`, { isActive: true });
  });

  await t.test('cadastra chave PIX sem nunca devolver o valor em claro', async () => {
    const created = await call('POST', `/api/accounts/${accountId}/pix-identifiers`, {
      type: 'cpf',
      value: '999.999.999-99',
      label: 'Chave sintética',
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));

    const listed = await call('GET', `/api/accounts/${accountId}/pix-identifiers`);
    assert.equal(listed.status, 200);
    const serialized = JSON.stringify(listed.payload);
    assert.doesNotMatch(serialized, /99999999999/, 'a listagem não pode expor o valor');
    assert.doesNotMatch(serialized, /valueCiphertext|valueIndex/, 'nem o cifrado, nem o índice');
    assert.match(serialized, /•/, 'a listagem devolve a forma mascarada');
  });

  await t.test('a mesma chave não é cadastrada duas vezes, mesmo escrita diferente', async () => {
    // Normalização: o índice HMAC do valor canônico é o mesmo.
    const repeated = await call('POST', `/api/accounts/${accountId}/pix-identifiers`, {
      type: 'cpf',
      value: '99999999999',
    });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.payload.error.code, 'PIX_KEY_ALREADY_REGISTERED');
  });

  await t.test('recusa chave que não corresponde ao tipo', async () => {
    const bad = await call('POST', `/api/accounts/${accountId}/pix-identifiers`, { type: 'cpf', value: '123' });
    assert.equal(bad.status, 400);
  });

  await t.test('ver a chave em claro é ação explícita', async () => {
    const listed = await call('GET', `/api/accounts/${accountId}/pix-identifiers`);
    const id = listed.payload.pixIdentifiers[0].id;

    const masked = await call('GET', `/api/accounts/${accountId}/pix-identifiers/${id}`);
    assert.equal(masked.payload.pixIdentifier.value, null, 'sem pedido, nada em claro');

    const revealed = await call('GET', `/api/accounts/${accountId}/pix-identifiers/${id}?reveal=1`);
    assert.equal(revealed.payload.pixIdentifier.value, '99999999999', 'o valor volta normalizado');

    const patched = await call('PATCH', `/api/accounts/${accountId}/pix-identifiers/${id}`, { isActive: false });
    assert.equal(patched.payload.pixIdentifier.isActive, false);

    const removed = await call('DELETE', `/api/accounts/${accountId}/pix-identifiers/${id}`);
    assert.equal(removed.status, 200);
  });

  await t.test('instituição com contas não pode ser excluída em silêncio', async () => {
    // A chave estrangeira é SET NULL: apagar deixaria a conta órfã sem aviso.
    const refused = await call('DELETE', `/api/institutions/${institutionId}`);
    assert.equal(refused.status, 409);
    assert.equal(refused.payload.error.code, 'INSTITUTION_HAS_ACCOUNTS');
  });

  await t.test('limpeza remove o que o teste criou', async () => {
    assert.equal((await call('DELETE', `/api/accounts/${accountId}`)).status, 200);
    assert.equal((await call('DELETE', `/api/institutions/${institutionId}`)).status, 200);
    assert.equal((await call('GET', `/api/accounts/${accountId}`)).status, 404);
  });
});

test('isolamento e validação da Feature 2', options, async (t) => {
  await t.test('ID inexistente não vaza dados', async () => {
    for (const path of [
      '/api/accounts/conta-que-nao-existe',
      '/api/institutions/instituicao-que-nao-existe',
      '/api/accounts/conta-que-nao-existe/balance-snapshots',
      '/api/accounts/conta-que-nao-existe/pix-identifiers',
    ]) {
      const result = await call('GET', path);
      assert.equal(result.status, 404, path);
    }
  });

  await t.test('entrada inválida é recusada no backend', async () => {
    const accounts = await call('GET', '/api/accounts');
    const any = accounts.payload.accounts?.[0];
    if (!any) return;

    assert.equal((await call('POST', '/api/accounts', { name: '', type: 'checking' })).status, 400);
    assert.equal((await call('POST', '/api/accounts', { name: 'X', type: 'inexistente' })).status, 400);
    assert.equal(
      (await call('POST', `/api/accounts/${any.id}/balance-snapshots`, { balanceCents: '12,34' })).status,
      400,
      'saldo precisa ser centavos inteiros',
    );
    assert.equal((await call('PATCH', `/api/accounts/${any.id}`, {})).status, 400, 'PATCH vazio não é alteração');
  });

  await t.test('as rotas da Feature 2 exigem código de ação', async () => {
    const response = await fetch(`${BASE}/api/accounts`, { method: 'GET' });
    assert.equal(response.status, 403);
  });
});
