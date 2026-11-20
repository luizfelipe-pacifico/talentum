import { type Ctx, currentSession, isModerator, requireSession } from './context.ts';
import type { Env } from './env.ts';
import { b64, fromB64, now } from './lib/crypto.ts';
import { auditEvent, record } from './lib/events.ts';
import { body, deny, json } from './lib/http.ts';
import { idempotent } from './lib/idempotency.ts';
import { BUCKETS, limit } from './lib/limits.ts';
import { boundedText, excerpt, opaqueId } from './lib/text.ts';
import { requireTurnstile } from './lib/turnstile.ts';

/* Comunidade de feedback (Stage 20; docs/SECURITY.md, Feedback community).

   Leitura pública só de conteúdo PUBLISHED/CLOSED, com perfil público mínimo
   (ID do perfil e nome público; nunca e-mail, sujeito OAuth, IP ou ID da
   conta). Escrita exige sessão; criação exige Turnstile e chave de
   idempotência; toda escrita tem rate limit por pessoa. Texto é puro: o Worker
   normaliza e limita, a LP escapa na saída. Exclusão é lápide. */

const PAGE = 20;
const enc = new TextEncoder();

type PostRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
  author_user_id: string;
  profile_id: string | null;
  public_name: string | null;
  vote_count: number;
  comment_count: number;
  viewer_voted: number;
};

const POST_SELECT = `SELECT p.id,p.title,p.body,p.status,p.created_at,p.updated_at,p.author_user_id,pr.id profile_id,pr.public_name,
  (SELECT COUNT(*) FROM feedback_post_votes v WHERE v.post_id=p.id) vote_count,
  (SELECT COUNT(*) FROM feedback_comments c WHERE c.post_id=p.id AND c.status='PUBLISHED') comment_count,
  EXISTS(SELECT 1 FROM feedback_post_votes v WHERE v.post_id=p.id AND v.user_id=?) viewer_voted
  FROM feedback_posts p LEFT JOIN user_profiles pr ON pr.user_id=p.author_user_id`;

function postSummary(row: PostRow, viewer: string | null) {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.body.replace(/\s+/g, ' '), 280),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.profile_id ? { profileId: row.profile_id, publicName: row.public_name } : null,
    voteCount: row.vote_count,
    commentCount: row.comment_count,
    viewerHasVoted: row.viewer_voted === 1,
    viewerIsAuthor: viewer !== null && viewer === row.author_user_id,
  };
}

const encodeCursor = (value: Record<string, unknown>) => b64(enc.encode(JSON.stringify(value)));
function decodeCursor(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  if (value.length > 200) return deny('INVALID_CURSOR', 400);
  try {
    return JSON.parse(new TextDecoder().decode(fromB64(value))) as Record<string, unknown>;
  } catch {
    return deny('INVALID_CURSOR', 400);
  }
}

/** GET /api/feedback/posts?sort=recent|votes&cursor= */
export async function listPosts(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.communityRead, ctx.ip);
  const viewer = (await currentSession(ctx))?.user_id ?? null;
  const sort = ctx.url.searchParams.get('sort') === 'votes' ? 'votes' : 'recent';
  const cursor = decodeCursor(ctx.url.searchParams.get('cursor'));
  let rows: PostRow[];
  if (sort === 'recent') {
    const c = cursor && typeof cursor.c === 'string' && typeof cursor.i === 'string' ? cursor : null;
    rows = (
      await ctx.e.DB.prepare(
        `${POST_SELECT} WHERE p.status IN ('PUBLISHED','CLOSED') AND (? IS NULL OR p.created_at<? OR (p.created_at=? AND p.id<?))
         ORDER BY p.created_at DESC,p.id DESC LIMIT ?`,
      )
        .bind(viewer ?? '', c?.c ?? null, c?.c ?? null, c?.c ?? null, c?.i ?? null, PAGE + 1)
        .all<PostRow>()
    ).results;
  } else {
    const offset = cursor && Number.isInteger(cursor.o) && (cursor.o as number) >= 0 && (cursor.o as number) <= 1000 ? (cursor.o as number) : 0;
    rows = (
      await ctx.e.DB.prepare(`${POST_SELECT} WHERE p.status IN ('PUBLISHED','CLOSED') ORDER BY vote_count DESC,p.created_at DESC,p.id DESC LIMIT ? OFFSET ?`)
        .bind(viewer ?? '', PAGE + 1, offset)
        .all<PostRow>()
    ).results;
    if (rows.length > PAGE) {
      return json({ posts: rows.slice(0, PAGE).map((row) => postSummary(row, viewer)), nextCursor: encodeCursor({ o: offset + PAGE }) });
    }
  }
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  const nextCursor = sort === 'recent' && rows.length > PAGE && last ? encodeCursor({ c: last.created_at, i: last.id }) : null;
  return json({ posts: page.map((row) => postSummary(row, viewer)), nextCursor });
}

async function visiblePost(e: Env, postId: string, viewer: string | null, moderator: boolean) {
  const row = await e.DB.prepare(`${POST_SELECT} WHERE p.id=?`).bind(viewer ?? '', postId).first<PostRow>();
  if (!row || row.status === 'DELETED' || (row.status === 'HIDDEN' && !moderator)) return deny('POST_NOT_FOUND', 404);
  return row;
}

/** GET /api/feedback/posts/:postId */
export async function getPost(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.communityRead, ctx.ip);
  const postId = opaqueId(ctx.params[0], 'POST_NOT_FOUND');
  const viewer = (await currentSession(ctx))?.user_id ?? null;
  const moderator = await isModerator(ctx.e, viewer);
  const post = await visiblePost(ctx.e, postId, viewer, moderator);
  const comments = await ctx.e.DB.prepare(
    `SELECT c.id,c.parent_comment_id,c.body,c.status,c.created_at,c.author_user_id,pr.id profile_id,pr.public_name,
       (SELECT COUNT(*) FROM feedback_comment_votes v WHERE v.comment_id=c.id) vote_count,
       EXISTS(SELECT 1 FROM feedback_comment_votes v WHERE v.comment_id=c.id AND v.user_id=?) viewer_voted
     FROM feedback_comments c LEFT JOIN user_profiles pr ON pr.user_id=c.author_user_id
     WHERE c.post_id=? ORDER BY c.created_at ASC,c.id ASC LIMIT 500`,
  )
    .bind(viewer ?? '', postId)
    .all<{
      id: string;
      parent_comment_id: string | null;
      body: string;
      status: string;
      created_at: string;
      author_user_id: string;
      profile_id: string | null;
      public_name: string | null;
      vote_count: number;
      viewer_voted: number;
    }>();
  return json({
    post: { ...postSummary(post, viewer), body: post.body },
    comments: comments.results.map((c) => {
      const visible = c.status === 'PUBLISHED' || (c.status === 'HIDDEN' && moderator);
      return {
        id: c.id,
        parentCommentId: c.parent_comment_id,
        body: visible ? c.body : null,
        status: c.status,
        createdAt: c.created_at,
        author: visible && c.profile_id ? { profileId: c.profile_id, publicName: c.public_name } : null,
        voteCount: c.vote_count,
        viewerHasVoted: c.viewer_voted === 1,
        viewerIsAuthor: viewer !== null && viewer === c.author_user_id && c.status === 'PUBLISHED',
      };
    }),
    viewerCanModerate: moderator,
  });
}

/** POST /api/feedback/posts {title, body, turnstileToken} + Idempotency-Key */
export async function createPost(ctx: Ctx) {
  const session = await requireSession(ctx);
  const input = await body(ctx.r);
  return idempotent(ctx, session.user_id, 'POST /api/feedback/posts', input, async () => {
    await limit(ctx.e, BUCKETS.postUser, session.user_id);
    const title = boundedText(input.title, 5, 120, 'INVALID_TITLE', false);
    const text = boundedText(input.body, 10, 4000, 'INVALID_BODY');
    await requireTurnstile(ctx.e, input.turnstileToken, 'community', ctx.ip);
    const id = crypto.randomUUID();
    const t = now();
    await ctx.e.DB.prepare('INSERT INTO feedback_posts(id,author_user_id,title,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(id, session.user_id, title, text, 'PUBLISHED', t, t)
      .run();
    return { status: 201, body: { post: { id } } };
  });
}

/** PATCH /api/feedback/posts/:postId {title, body}: só quem escreveu, só enquanto publicado. */
export async function updatePost(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.editUser, session.user_id);
  const postId = opaqueId(ctx.params[0], 'POST_NOT_FOUND');
  const input = await body(ctx.r);
  const title = boundedText(input.title, 5, 120, 'INVALID_TITLE', false);
  const text = boundedText(input.body, 10, 4000, 'INVALID_BODY');
  const row = await ctx.e.DB.prepare('SELECT author_user_id,status FROM feedback_posts WHERE id=?').bind(postId).first<{ author_user_id: string; status: string }>();
  if (!row || row.status === 'DELETED') return deny('POST_NOT_FOUND', 404);
  if (row.author_user_id !== session.user_id) return deny('FORBIDDEN', 403);
  const updated = await ctx.e.DB.prepare("UPDATE feedback_posts SET title=?,body=?,updated_at=? WHERE id=? AND author_user_id=? AND status='PUBLISHED'")
    .bind(title, text, now(), postId, session.user_id)
    .run();
  if (updated.meta.changes !== 1) return deny('POST_LOCKED', 409);
  return json({ post: { id: postId } });
}

async function moderationTrail(e: Env, moderatorId: string, action: string, reason: string, target: { postId?: string; commentId?: string; reportId?: string }) {
  await e.DB.prepare('INSERT INTO moderation_actions(id,moderator_user_id,report_id,post_id,comment_id,action,reason,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), moderatorId, target.reportId ?? null, target.postId ?? null, target.commentId ?? null, action, reason, now())
    .run();
  await record(
    auditEvent(e, `MODERATION_${action}`, { type: target.commentId ? 'feedback_comment' : 'feedback_post', id: target.commentId ?? target.postId ?? null }, 'SUCCESS', moderatorId),
  );
}

/** DELETE /api/feedback/posts/:postId: autor ou moderação; lápide. */
export async function deletePost(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.editUser, session.user_id);
  const postId = opaqueId(ctx.params[0], 'POST_NOT_FOUND');
  const row = await ctx.e.DB.prepare('SELECT author_user_id,status FROM feedback_posts WHERE id=?').bind(postId).first<{ author_user_id: string; status: string }>();
  if (!row || row.status === 'DELETED') return deny('POST_NOT_FOUND', 404);
  const own = row.author_user_id === session.user_id;
  if (!own && !(await isModerator(ctx.e, session.user_id))) return deny('FORBIDDEN', 403);
  const t = now();
  await ctx.e.DB.prepare("UPDATE feedback_posts SET status='DELETED',title='',body='',deleted_at=?,updated_at=? WHERE id=? AND status<>'DELETED'")
    .bind(t, t, postId)
    .run();
  if (own) await record(auditEvent(ctx.e, 'FEEDBACK_POST_DELETED', { type: 'feedback_post', id: postId }, 'SUCCESS', session.user_id));
  else await moderationTrail(ctx.e, session.user_id, 'DELETE', 'Removido pela moderação', { postId });
  return json({ ok: true });
}

/** POST /api/feedback/posts/:postId/comments {body, parentCommentId?, turnstileToken} + Idempotency-Key */
export async function createComment(ctx: Ctx) {
  const session = await requireSession(ctx);
  const postId = opaqueId(ctx.params[0], 'POST_NOT_FOUND');
  const input = await body(ctx.r);
  return idempotent(ctx, session.user_id, `POST /api/feedback/posts/${postId}/comments`, input, async () => {
    await limit(ctx.e, BUCKETS.commentUser, session.user_id);
    const text = boundedText(input.body, 1, 2000, 'INVALID_BODY');
    const post = await ctx.e.DB.prepare('SELECT status FROM feedback_posts WHERE id=?').bind(postId).first<{ status: string }>();
    if (!post || post.status === 'DELETED' || post.status === 'HIDDEN') return deny('POST_NOT_FOUND', 404);
    if (post.status !== 'PUBLISHED') return deny('POST_LOCKED', 409);
    let parent: string | null = null;
    if (input.parentCommentId !== undefined && input.parentCommentId !== null && input.parentCommentId !== '') {
      const parentId = opaqueId(input.parentCommentId, 'COMMENT_NOT_FOUND');
      const row = await ctx.e.DB.prepare("SELECT id,parent_comment_id FROM feedback_comments WHERE id=? AND post_id=? AND status='PUBLISHED'")
        .bind(parentId, postId)
        .first<{ id: string; parent_comment_id: string | null }>();
      if (!row) return deny('COMMENT_NOT_FOUND', 404);
      // Um nível de resposta: responder a uma resposta vira resposta ao comentário de origem.
      parent = row.parent_comment_id ?? row.id;
    }
    await requireTurnstile(ctx.e, input.turnstileToken, 'community', ctx.ip);
    const id = crypto.randomUUID();
    const t = now();
    await ctx.e.DB.prepare('INSERT INTO feedback_comments(id,post_id,author_user_id,parent_comment_id,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, postId, session.user_id, parent, text, 'PUBLISHED', t, t)
      .run();
    return { status: 201, body: { comment: { id } } };
  });
}

/** PATCH /api/feedback/comments/:commentId {body} */
export async function updateComment(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.editUser, session.user_id);
  const commentId = opaqueId(ctx.params[0], 'COMMENT_NOT_FOUND');
  const input = await body(ctx.r);
  const text = boundedText(input.body, 1, 2000, 'INVALID_BODY');
  const row = await ctx.e.DB.prepare('SELECT author_user_id,status FROM feedback_comments WHERE id=?').bind(commentId).first<{ author_user_id: string; status: string }>();
  if (!row || row.status === 'DELETED') return deny('COMMENT_NOT_FOUND', 404);
  if (row.author_user_id !== session.user_id) return deny('FORBIDDEN', 403);
  const updated = await ctx.e.DB.prepare("UPDATE feedback_comments SET body=?,updated_at=? WHERE id=? AND author_user_id=? AND status='PUBLISHED'")
    .bind(text, now(), commentId, session.user_id)
    .run();
  if (updated.meta.changes !== 1) return deny('COMMENT_LOCKED', 409);
  return json({ comment: { id: commentId } });
}

/** DELETE /api/feedback/comments/:commentId: autor ou moderação; lápide. */
export async function deleteComment(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.editUser, session.user_id);
  const commentId = opaqueId(ctx.params[0], 'COMMENT_NOT_FOUND');
  const row = await ctx.e.DB.prepare('SELECT author_user_id,status,post_id FROM feedback_comments WHERE id=?')
    .bind(commentId)
    .first<{ author_user_id: string; status: string; post_id: string }>();
  if (!row || row.status === 'DELETED') return deny('COMMENT_NOT_FOUND', 404);
  const own = row.author_user_id === session.user_id;
  if (!own && !(await isModerator(ctx.e, session.user_id))) return deny('FORBIDDEN', 403);
  const t = now();
  await ctx.e.DB.prepare("UPDATE feedback_comments SET status='DELETED',body='',deleted_at=?,updated_at=? WHERE id=? AND status<>'DELETED'")
    .bind(t, t, commentId)
    .run();
  if (own) await record(auditEvent(ctx.e, 'FEEDBACK_COMMENT_DELETED', { type: 'feedback_comment', id: commentId }, 'SUCCESS', session.user_id));
  else await moderationTrail(ctx.e, session.user_id, 'DELETE', 'Removido pela moderação', { commentId, postId: row.post_id });
  return json({ ok: true });
}

/** PUT|DELETE /api/feedback/posts/:postId/vote — idempotente pela restrição única. */
export async function votePost(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.voteUser, session.user_id);
  const postId = opaqueId(ctx.params[0], 'POST_NOT_FOUND');
  const post = await ctx.e.DB.prepare('SELECT status FROM feedback_posts WHERE id=?').bind(postId).first<{ status: string }>();
  if (!post || post.status === 'DELETED' || post.status === 'HIDDEN') return deny('POST_NOT_FOUND', 404);
  if (ctx.r.method === 'PUT') {
    if (post.status !== 'PUBLISHED') return deny('POST_LOCKED', 409);
    await ctx.e.DB.prepare('INSERT INTO feedback_post_votes(id,post_id,user_id,created_at) VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING')
      .bind(crypto.randomUUID(), postId, session.user_id, now())
      .run();
  } else {
    await ctx.e.DB.prepare('DELETE FROM feedback_post_votes WHERE post_id=? AND user_id=?').bind(postId, session.user_id).run();
  }
  const count = await ctx.e.DB.prepare('SELECT COUNT(*) n FROM feedback_post_votes WHERE post_id=?').bind(postId).first<{ n: number }>();
  return json({ voteCount: count?.n ?? 0, viewerHasVoted: ctx.r.method === 'PUT' });
}

/** PUT|DELETE /api/feedback/comments/:commentId/vote */
export async function voteComment(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.voteUser, session.user_id);
  const commentId = opaqueId(ctx.params[0], 'COMMENT_NOT_FOUND');
  const comment = await ctx.e.DB.prepare('SELECT status FROM feedback_comments WHERE id=?').bind(commentId).first<{ status: string }>();
  if (comment?.status !== 'PUBLISHED') return deny('COMMENT_NOT_FOUND', 404);
  if (ctx.r.method === 'PUT') {
    await ctx.e.DB.prepare('INSERT INTO feedback_comment_votes(id,comment_id,user_id,created_at) VALUES(?,?,?,?) ON CONFLICT(comment_id,user_id) DO NOTHING')
      .bind(crypto.randomUUID(), commentId, session.user_id, now())
      .run();
  } else {
    await ctx.e.DB.prepare('DELETE FROM feedback_comment_votes WHERE comment_id=? AND user_id=?').bind(commentId, session.user_id).run();
  }
  const count = await ctx.e.DB.prepare('SELECT COUNT(*) n FROM feedback_comment_votes WHERE comment_id=?').bind(commentId).first<{ n: number }>();
  return json({ voteCount: count?.n ?? 0, viewerHasVoted: ctx.r.method === 'PUT' });
}

/** POST /api/feedback/reports {postId|commentId, reason, turnstileToken} */
export async function report(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.reportUser, session.user_id);
  const input = await body(ctx.r);
  const reason = boundedText(input.reason, 5, 500, 'INVALID_REASON');
  const hasPost = typeof input.postId === 'string' && input.postId !== '';
  const hasComment = typeof input.commentId === 'string' && input.commentId !== '';
  if (hasPost === hasComment) return deny('INVALID_REPORT_TARGET', 400);
  const targetId = opaqueId(hasPost ? input.postId : input.commentId, 'INVALID_REPORT_TARGET', 400);
  const target = hasPost
    ? await ctx.e.DB.prepare("SELECT author_user_id FROM feedback_posts WHERE id=? AND status IN ('PUBLISHED','CLOSED')").bind(targetId).first<{ author_user_id: string }>()
    : await ctx.e.DB.prepare("SELECT author_user_id FROM feedback_comments WHERE id=? AND status='PUBLISHED'").bind(targetId).first<{ author_user_id: string }>();
  if (!target) return deny(hasPost ? 'POST_NOT_FOUND' : 'COMMENT_NOT_FOUND', 404);
  if (target.author_user_id === session.user_id) return deny('CANNOT_REPORT_OWN', 400);
  const column = hasPost ? 'post_id' : 'comment_id';
  const existing = await ctx.e.DB.prepare(`SELECT id FROM feedback_reports WHERE reporter_user_id=? AND ${column}=?`)
    .bind(session.user_id, targetId)
    .first<{ id: string }>();
  if (existing) return json({ report: { id: existing.id } });
  await requireTurnstile(ctx.e, input.turnstileToken, 'community', ctx.ip);
  const id = crypto.randomUUID();
  await ctx.e.DB.prepare(`INSERT OR IGNORE INTO feedback_reports(id,reporter_user_id,${column},reason,created_at) VALUES(?,?,?,?,?)`)
    .bind(id, session.user_id, targetId, reason, now())
    .run();
  const row = await ctx.e.DB.prepare(`SELECT id FROM feedback_reports WHERE reporter_user_id=? AND ${column}=?`).bind(session.user_id, targetId).first<{ id: string }>();
  return json({ report: { id: row?.id ?? id } }, row?.id === id ? 201 : 200);
}

/** GET /api/feedback/profiles/:profileId: perfil público mínimo. */
export async function profile(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.communityRead, ctx.ip);
  const profileId = opaqueId(ctx.params[0], 'PROFILE_NOT_FOUND');
  const viewer = (await currentSession(ctx))?.user_id ?? null;
  const row = await ctx.e.DB.prepare("SELECT p.id,p.public_name,p.user_id,u.created_at FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.status='ACTIVE'")
    .bind(profileId)
    .first<{ id: string; public_name: string; user_id: string; created_at: string }>();
  if (!row) return deny('PROFILE_NOT_FOUND', 404);
  const posts = await ctx.e.DB.prepare(`${POST_SELECT} WHERE p.author_user_id=? AND p.status IN ('PUBLISHED','CLOSED') ORDER BY p.created_at DESC LIMIT ?`)
    .bind(viewer ?? '', row.user_id, PAGE)
    .all<PostRow>();
  return json({
    profile: { profileId: row.id, publicName: row.public_name, memberSince: row.created_at.slice(0, 7) },
    posts: posts.results.map((post) => postSummary(post, viewer)),
  });
}

async function requireModerator(ctx: Ctx) {
  const session = await requireSession(ctx);
  if (!(await isModerator(ctx.e, session.user_id))) return deny('FORBIDDEN', 403);
  await limit(ctx.e, BUCKETS.moderation, session.user_id);
  return session;
}

/** GET /api/feedback/moderation/reports */
export async function moderationQueue(ctx: Ctx) {
  await requireModerator(ctx);
  const rows = await ctx.e.DB.prepare(
    `SELECT r.id,r.reason,r.created_at,r.post_id,r.comment_id,p.title,p.status post_status,c.body,c.status comment_status,c.post_id comment_post_id
     FROM feedback_reports r LEFT JOIN feedback_posts p ON p.id=r.post_id LEFT JOIN feedback_comments c ON c.id=r.comment_id
     WHERE r.status='OPEN' ORDER BY r.created_at ASC LIMIT 100`,
  ).all<{
    id: string;
    reason: string;
    created_at: string;
    post_id: string | null;
    comment_id: string | null;
    title: string | null;
    post_status: string | null;
    body: string | null;
    comment_status: string | null;
    comment_post_id: string | null;
  }>();
  return json({
    reports: rows.results.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      target: r.post_id
        ? { type: 'POST', id: r.post_id, postId: r.post_id, preview: excerpt(r.title ?? '', 160), status: r.post_status }
        : { type: 'COMMENT', id: r.comment_id, postId: r.comment_post_id, preview: excerpt((r.body ?? '').replace(/\s+/g, ' '), 160), status: r.comment_status },
    })),
  });
}

const TRANSITIONS: Record<string, { from: string[]; to: string; posts: boolean; comments: boolean }> = {
  HIDE: { from: ['PUBLISHED', 'CLOSED'], to: 'HIDDEN', posts: true, comments: true },
  RESTORE: { from: ['HIDDEN'], to: 'PUBLISHED', posts: true, comments: true },
  CLOSE: { from: ['PUBLISHED'], to: 'CLOSED', posts: true, comments: false },
  REOPEN: { from: ['CLOSED'], to: 'PUBLISHED', posts: true, comments: false },
};

/** POST /api/feedback/moderation/actions {action, postId?|commentId?|reportId?, reason} */
export async function moderate(ctx: Ctx) {
  const session = await requireModerator(ctx);
  const input = await body(ctx.r);
  const reason = boundedText(input.reason, 3, 500, 'INVALID_REASON');
  const action = typeof input.action === 'string' ? input.action : '';
  const reportId = input.reportId ? opaqueId(input.reportId, 'REPORT_NOT_FOUND') : null;
  if (action === 'DISMISS') {
    if (!reportId) return deny('REPORT_NOT_FOUND', 404);
    await ctx.e.DB.prepare("UPDATE feedback_reports SET status='DISMISSED',resolved_at=? WHERE id=? AND status='OPEN'").bind(now(), reportId).run();
    await moderationTrail(ctx.e, session.user_id, 'DISMISS', reason, { reportId });
    return json({ ok: true });
  }
  const transition = TRANSITIONS[action];
  if (!transition) return deny('INVALID_ACTION', 400);
  const postId = input.postId ? opaqueId(input.postId, 'POST_NOT_FOUND') : null;
  const commentId = input.commentId ? opaqueId(input.commentId, 'COMMENT_NOT_FOUND') : null;
  if ((postId === null) === (commentId === null)) return deny('INVALID_ACTION', 400);
  if (commentId && !transition.comments) return deny('INVALID_ACTION', 400);
  const table = postId ? 'feedback_posts' : 'feedback_comments';
  const placeholders = transition.from.map(() => '?').join(',');
  // Transição condicionada ao estado de origem: repetir a ação não muda nada.
  await ctx.e.DB.prepare(`UPDATE ${table} SET status=?,updated_at=? WHERE id=? AND status IN (${placeholders})`)
    .bind(transition.to, now(), postId ?? commentId, ...transition.from)
    .run();
  if (reportId) await ctx.e.DB.prepare("UPDATE feedback_reports SET status='RESOLVED',resolved_at=? WHERE id=? AND status='OPEN'").bind(now(), reportId).run();
  await moderationTrail(ctx.e, session.user_id, action, reason, { postId: postId ?? undefined, commentId: commentId ?? undefined, reportId: reportId ?? undefined });
  return json({ ok: true });
}
