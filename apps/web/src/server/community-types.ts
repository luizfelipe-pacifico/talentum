/* Formas das respostas do Worker usadas pelas páginas da comunidade e da conta
   (contrato em docs/ARCHITECTURE.md, §3.5). */

export type Author = { profileId: string; publicName: string };

export type PostSummary = {
  id: string;
  title: string;
  excerpt: string;
  status: 'PUBLISHED' | 'CLOSED' | 'HIDDEN' | 'DELETED';
  createdAt: string;
  updatedAt: string;
  author: Author;
  voteCount: number;
  commentCount: number;
  viewerHasVoted: boolean;
  viewerIsAuthor: boolean;
};

export type PostDetail = PostSummary & { body: string };

export type Comment = {
  id: string;
  parentCommentId: string | null;
  body: string | null;
  status: 'PUBLISHED' | 'HIDDEN' | 'DELETED';
  createdAt: string;
  author: Author | null;
  voteCount: number;
  viewerHasVoted: boolean;
  viewerIsAuthor: boolean;
};

export type PostPage = { post: PostDetail; comments: Comment[]; viewerCanModerate: boolean };
export type PostList = { posts: PostSummary[]; nextCursor: string | null };
export type ProfilePage = { profile: { profileId: string; publicName: string; memberSince: string }; posts: PostSummary[] };

export type Report = {
  id: string;
  reason: string;
  createdAt: string;
  target: { type: 'POST' | 'COMMENT'; id: string; postId: string; preview: string; status: string };
};

export type Me = { user: { profileId: string; publicName: string; isModerator: boolean; memberSince: string } };
export type Session = { id: string; createdAt: string; lastSeenAt: string | null; current: boolean };
export type MfaStatus = { totp: 'NONE' | 'PENDING' | 'ACTIVE'; recoveryCodesRemaining: number; recoveryCodesToReveal: boolean };
