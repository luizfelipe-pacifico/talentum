import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './helpers/worker.mjs';

/* Comunidade de feedback no Worker (Stage 20): autenticação, autorização,
   validação, Turnstile, idempotência, rate limit e lápides. */

const idem = (key) => ({ 'Idempotency-Key': key });
const newPost = { title: 'Importar extrato do cartão', body: 'Seria útil importar a fatura do cartão em OFX.' };

test('escrita exige sessão; leitura pública não revela e-mail nem ID da conta', async () => {
  const { call, session } = await createWorker();
  assert.equal((await call('POST', '/api/feedback/posts', { body: newPost, headers: idem('chave-0000001') })).status, 401);
  const a = await session({ email: 'autora@exemplo.test', name: 'Autora' });
  const created = await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-0000002') } });
  assert.equal(created.status, 201);
  const list = await call('GET', '/api/feedback/posts');
  const text = await list.text();
  assert.doesNotMatch(text, /autora@exemplo\.test/);
  assert.ok(!text.includes(a.userId), 'o ID da conta não aparece; só o do perfil');
  const { posts } = JSON.parse(text);
  assert.equal(posts[0].author.publicName, 'Autora');
  assert.equal(posts[0].author.profileId, a.profileId);
});

test('mesma chave de idempotência e mesmo corpo: um efeito só; corpo diferente: 409', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const headers = { ...a.auth, ...idem('chave-repetida-01') };
  const [first, second] = await Promise.all([
    call('POST', '/api/feedback/posts', { body: newPost, headers }),
    call('POST', '/api/feedback/posts', { body: newPost, headers }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.ok(statuses.includes(201));
  const third = await call('POST', '/api/feedback/posts', { body: newPost, headers });
  assert.equal(third.status, 201);
  assert.deepEqual(await third.json(), await (first.status === 201 ? first : second).json());
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback_posts').get().n, 1);
  const changed = await call('POST', '/api/feedback/posts', { body: { ...newPost, title: 'Outro título sintético' }, headers });
  assert.equal(changed.status, 409);
  assert.equal((await call('POST', '/api/feedback/posts', { body: newPost, headers: a.auth })).status, 400, 'sem chave');
});

test('texto é normalizado e guardado como texto; HTML não é interpretado nem removido em silêncio', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const body = 'Teste <script>alert(1)</script>\u202e invertido\n\n\n\nfim do texto sintético';
  const created = await call('POST', '/api/feedback/posts', { body: { title: 'Título <b>sintético</b>', body }, headers: { ...a.auth, ...idem('chave-html-0001') } });
  const { post } = await created.json();
  const row = env.DB.raw.prepare('SELECT title,body FROM feedback_posts WHERE id=?').get(post.id);
  assert.equal(row.title, 'Título <b>sintético</b>');
  assert.ok(row.body.includes('<script>'), 'o texto fica como texto; a LP escapa na saída');
  assert.doesNotMatch(row.body, /\u202e/);
  assert.doesNotMatch(row.body, /\n{3,}/);
  const detail = await call('GET', `/api/feedback/posts/${post.id}`);
  assert.equal(detail.headers.get('Content-Security-Policy'), "default-src 'none'; frame-ancestors 'none'");
});

test('limites de tamanho e campos extras ignorados (mass assignment)', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const short = await call('POST', '/api/feedback/posts', { body: { title: 'Oi', body: newPost.body }, headers: { ...a.auth, ...idem('chave-curta-01') } });
  assert.equal((await short.json()).error.code, 'INVALID_TITLE');
  const long = await call('POST', '/api/feedback/posts', { body: { title: newPost.title, body: 'x'.repeat(4001) }, headers: { ...a.auth, ...idem('chave-longa-01') } });
  assert.equal((await long.json()).error.code, 'INVALID_BODY');
  const sneaky = await call('POST', '/api/feedback/posts', {
    body: { ...newPost, status: 'HIDDEN', author_user_id: 'outra', id: 'escolhido' },
    headers: { ...a.auth, ...idem('chave-extra-01') },
  });
  const { post } = await sneaky.json();
  const row = env.DB.raw.prepare('SELECT id,status,author_user_id FROM feedback_posts WHERE id=?').get(post.id);
  assert.notEqual(row.id, 'escolhido');
  assert.equal(row.status, 'PUBLISHED');
  assert.equal(row.author_user_id, a.userId);
});

test('só quem escreveu edita; moderação remove; outra pessoa recebe 403 (IDOR)', async () => {
  const { call, session } = await createWorker();
  const a = await session();
  const b = await session();
  const mod = await session({ moderator: true });
  const { post } = await (await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-idor-001') } })).json();
  assert.equal((await call('PATCH', `/api/feedback/posts/${post.id}`, { body: newPost, headers: b.auth })).status, 403);
  assert.equal((await call('DELETE', `/api/feedback/posts/${post.id}`, { headers: b.auth })).status, 403);
  assert.equal((await call('PATCH', `/api/feedback/posts/${post.id}`, { body: { ...newPost, title: 'Título editado sintético' }, headers: a.auth })).status, 200);
  assert.equal((await call('DELETE', `/api/feedback/posts/${post.id}`, { headers: mod.auth })).status, 200);
  assert.equal((await call('GET', `/api/feedback/posts/${post.id}`)).status, 404, 'lápide não aparece');
  assert.equal((await call('GET', '/api/feedback/moderation/reports', { headers: a.auth })).status, 403, 'fila só para moderação');
});

test('comentários: resposta de um nível, publicação fechada recusa, lápide preserva a conversa', async () => {
  const { call, session } = await createWorker();
  const a = await session();
  const b = await session();
  const mod = await session({ moderator: true });
  const { post } = await (await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-coment-01') } })).json();
  const root = await (await call('POST', `/api/feedback/posts/${post.id}/comments`, { body: { body: 'Concordo.' }, headers: { ...b.auth, ...idem('chave-coment-02') } })).json();
  const reply = await (
    await call('POST', `/api/feedback/posts/${post.id}/comments`, { body: { body: 'Eu também.', parentCommentId: root.comment.id }, headers: { ...a.auth, ...idem('chave-coment-03') } })
  ).json();
  const nested = await (
    await call('POST', `/api/feedback/posts/${post.id}/comments`, { body: { body: 'Terceiro nível.', parentCommentId: reply.comment.id }, headers: { ...b.auth, ...idem('chave-coment-04') } })
  ).json();
  await call('DELETE', `/api/feedback/comments/${root.comment.id}`, { headers: b.auth });
  const detail = await (await call('GET', `/api/feedback/posts/${post.id}`)).json();
  const byId = Object.fromEntries(detail.comments.map((c) => [c.id, c]));
  assert.equal(byId[root.comment.id].body, null);
  assert.equal(byId[root.comment.id].author, null);
  assert.equal(byId[nested.comment.id].parentCommentId, root.comment.id, 'resposta à resposta vira resposta ao comentário de origem');
  await call('POST', '/api/feedback/moderation/actions', { body: { action: 'CLOSE', postId: post.id, reason: 'Concluída' }, headers: mod.auth });
  const closed = await call('POST', `/api/feedback/posts/${post.id}/comments`, { body: { body: 'Depois de fechar.' }, headers: { ...b.auth, ...idem('chave-coment-05') } });
  assert.equal(closed.status, 409);
});

test('votos são idempotentes e por pessoa', async () => {
  const { call, session } = await createWorker();
  const a = await session();
  const b = await session();
  const { post } = await (await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-voto-001') } })).json();
  await Promise.all([1, 2, 3].map(() => call('PUT', `/api/feedback/posts/${post.id}/vote`, { headers: b.auth })));
  let state = await (await call('PUT', `/api/feedback/posts/${post.id}/vote`, { headers: a.auth })).json();
  assert.equal(state.voteCount, 2);
  state = await (await call('DELETE', `/api/feedback/posts/${post.id}/vote`, { headers: b.auth })).json();
  assert.equal(state.voteCount, 1);
  state = await (await call('DELETE', `/api/feedback/posts/${post.id}/vote`, { headers: b.auth })).json();
  assert.equal(state.voteCount, 1);
});

test('denúncia: uma por pessoa e conteúdo, não da própria publicação; moderação oculta e resolve', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const b = await session();
  const mod = await session({ moderator: true });
  const { post } = await (await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-denun-01') } })).json();
  assert.equal((await call('POST', '/api/feedback/reports', { body: { postId: post.id, reason: 'Conteúdo fora do tema.' }, headers: a.auth })).status, 400);
  const first = await call('POST', '/api/feedback/reports', { body: { postId: post.id, reason: 'Conteúdo fora do tema.' }, headers: b.auth });
  assert.equal(first.status, 201);
  const again = await call('POST', '/api/feedback/reports', { body: { postId: post.id, reason: 'De novo.' }, headers: b.auth });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).report.id, (await first.json()).report.id);
  const queue = await (await call('GET', '/api/feedback/moderation/reports', { headers: mod.auth })).json();
  assert.equal(queue.reports.length, 1);
  const hide = await call('POST', '/api/feedback/moderation/actions', {
    body: { action: 'HIDE', postId: post.id, reportId: queue.reports[0].id, reason: 'Fora do tema' },
    headers: mod.auth,
  });
  assert.equal(hide.status, 200);
  assert.equal((await call('GET', `/api/feedback/posts/${post.id}`)).status, 404);
  assert.equal((await call('GET', `/api/feedback/posts/${post.id}`, { headers: mod.auth })).status, 200, 'moderação ainda vê');
  assert.equal(env.DB.raw.prepare("SELECT status FROM feedback_reports").get().status, 'RESOLVED');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM moderation_actions WHERE action='HIDE'").get().n, 1);
  assert.ok(env.DB.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='MODERATION_HIDE'").get().n >= 1);
});

test('Turnstile é exigido na criação de conteúdo quando configurado', async () => {
  const { call, session, providers } = await createWorker({ env: { TURNSTILE_SECRET_KEY: 'segredo-turnstile-sintetico' } });
  const a = await session();
  const without = await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-turn-0001') } });
  assert.equal((await without.json()).error.code, 'CHALLENGE_FAILED');
  providers.state.turnstile = { success: true, hostname: 'localhost', action: 'community' };
  const ok = await call('POST', '/api/feedback/posts', {
    body: { ...newPost, turnstileToken: 'token-sintetico-turnstile' },
    headers: { ...a.auth, ...idem('chave-turn-0002') },
  });
  assert.equal(ok.status, 201);
  // Repetir com a mesma chave devolve a resposta guardada sem gastar outro desafio.
  const calls = providers.state.turnstileCalls;
  const replay = await call('POST', '/api/feedback/posts', {
    body: { ...newPost, turnstileToken: 'outro-token-sintetico' },
    headers: { ...a.auth, ...idem('chave-turn-0002') },
  });
  assert.equal(replay.status, 201);
  assert.equal(providers.state.turnstileCalls, calls);
});

test('rate limit por pessoa na criação de publicações', async () => {
  const { call, session } = await createWorker();
  const a = await session();
  let last = 0;
  for (let i = 0; i < 6; i += 1) {
    last = (await call('POST', '/api/feedback/posts', { body: { ...newPost, title: `Sugestão sintética ${i}` }, headers: { ...a.auth, ...idem(`chave-limite-${i}0`) } })).status;
  }
  assert.equal(last, 429);
});

test('paginação por cursor e cursor adulterado', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const db = env.DB.raw;
  for (let i = 0; i < 25; i += 1) {
    const t = new Date(Date.now() - i * 1000).toISOString();
    db.prepare("INSERT INTO feedback_posts(id,author_user_id,title,body,status,created_at,updated_at) VALUES(?,?,?,?,'PUBLISHED',?,?)").run(`p${i}`, a.userId, `Título ${i}`, 'Corpo sintético da publicação.', t, t);
  }
  const page1 = await (await call('GET', '/api/feedback/posts')).json();
  assert.equal(page1.posts.length, 20);
  const page2 = await (await call('GET', `/api/feedback/posts?cursor=${page1.nextCursor}`)).json();
  assert.equal(page2.posts.length, 5);
  assert.equal(page2.nextCursor, null);
  assert.equal(new Set([...page1.posts, ...page2.posts].map((p) => p.id)).size, 25);
  assert.equal((await call('GET', '/api/feedback/posts?cursor=%%%invalido')).status, 400);
  const top = await (await call('GET', '/api/feedback/posts?sort=votes')).json();
  assert.equal(top.posts.length, 20);
});

test('perfil público mínimo: nome e mês de entrada, sem e-mail', async () => {
  const { call, session } = await createWorker();
  const a = await session({ email: 'perfil@exemplo.test', name: 'Perfil' });
  await call('POST', '/api/feedback/posts', { body: newPost, headers: { ...a.auth, ...idem('chave-perfil-01') } });
  const response = await call('GET', `/api/feedback/profiles/${a.profileId}`);
  const text = await response.text();
  assert.doesNotMatch(text, /perfil@exemplo\.test/);
  const body = JSON.parse(text);
  assert.match(body.profile.memberSince, /^\d{4}-\d{2}$/);
  assert.equal(body.posts.length, 1);
  // Travessia nem chega a ganhar código de ação: o alvo não casa com rota alguma.
  assert.ok([400, 404].includes((await call('GET', '/api/feedback/profiles/..%2F..%2Fx')).status));
});
