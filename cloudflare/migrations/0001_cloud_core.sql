PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'DELETED')),
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  public_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE oauth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, document_type, document_version)
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE refresh_token_families (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  revoked_at TEXT,
  compromise_detected_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  successor_token_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES refresh_token_families(id) ON DELETE CASCADE,
  FOREIGN KEY (successor_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

CREATE TABLE releases (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('STABLE', 'BETA')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'REVOKED')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (version, channel)
);

CREATE TABLE release_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('WINDOWS', 'LINUX')),
  architecture TEXT NOT NULL,
  download_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  signature TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  UNIQUE (release_id, platform, architecture)
);

CREATE TABLE download_grants (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  grant_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id) REFERENCES release_artifacts(id) ON DELETE CASCADE
);

CREATE TABLE feedback_posts (
  id TEXT PRIMARY KEY NOT NULL,
  author_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN', 'DELETED', 'CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE feedback_comments (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  parent_comment_id TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN', 'DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (post_id) REFERENCES feedback_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_comment_id) REFERENCES feedback_comments(id) ON DELETE CASCADE
);

CREATE TABLE feedback_post_votes (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES feedback_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (post_id, user_id)
);

CREATE TABLE feedback_comment_votes (
  id TEXT PRIMARY KEY NOT NULL,
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES feedback_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (comment_id, user_id)
);

CREATE TABLE feedback_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_user_id TEXT NOT NULL,
  post_id TEXT,
  comment_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (post_id) REFERENCES feedback_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES feedback_comments(id) ON DELETE CASCADE,
  CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY NOT NULL,
  moderator_user_id TEXT NOT NULL,
  report_id TEXT,
  post_id TEXT,
  comment_id TEXT,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (moderator_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (report_id) REFERENCES feedback_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (post_id) REFERENCES feedback_posts(id) ON DELETE SET NULL,
  FOREIGN KEY (comment_id) REFERENCES feedback_comments(id) ON DELETE SET NULL
);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE SET NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_oauth_identities_user_id ON oauth_identities(user_id);
CREATE INDEX idx_consents_user_id ON consents(user_id);
CREATE INDEX idx_auth_sessions_user_expires ON auth_sessions(user_id, expires_at);
CREATE INDEX idx_refresh_token_families_session_id ON refresh_token_families(session_id);
CREATE INDEX idx_refresh_tokens_family_expires ON refresh_tokens(family_id, expires_at);
CREATE INDEX idx_release_artifacts_release_id ON release_artifacts(release_id);
CREATE INDEX idx_download_grants_user_expires ON download_grants(user_id, expires_at);
CREATE INDEX idx_feedback_posts_status_created ON feedback_posts(status, created_at);
CREATE INDEX idx_feedback_comments_post_created ON feedback_comments(post_id, created_at);
CREATE INDEX idx_feedback_reports_status_created ON feedback_reports(status, created_at);
CREATE INDEX idx_security_events_user_created ON security_events(user_id, created_at);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id, created_at);
