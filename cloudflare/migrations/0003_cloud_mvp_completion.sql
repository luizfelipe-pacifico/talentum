PRAGMA foreign_keys = ON;

-- Conclusão da trilha de nuvem: consentimento no cadastro, papéis de
-- moderação, idempotência de escritas, comunidade, notícias e resumos,
-- verificação em duas etapas (TOTP) e login do app desktop (RFC 8252).
-- Nenhuma coluna guarda dado financeiro, token em texto puro ou IP.

-- Aceite dos documentos vigente no início do login; gravado em `consents`
-- quando o callback identifica a pessoa.
ALTER TABLE auth_transactions ADD COLUMN consent_terms_version TEXT;
ALTER TABLE auth_transactions ADD COLUMN consent_privacy_version TEXT;
ALTER TABLE auth_transactions ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'WEB' CHECK (client_kind IN ('WEB', 'DESKTOP'));
ALTER TABLE auth_transactions ADD COLUMN desktop_request_id TEXT;

ALTER TABLE auth_sessions ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'WEB' CHECK (client_kind IN ('WEB', 'DESKTOP'));

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('MODERATOR')),
  granted_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, role)
);

-- Resposta guardada por chave de idempotência: a mesma chave com o mesmo corpo
-- devolve a mesma resposta; com outro corpo é recusada.
CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, key_hash)
);

-- Uma denúncia aberta por pessoa e conteúdo.
CREATE UNIQUE INDEX idx_feedback_reports_unique_post ON feedback_reports(reporter_user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX idx_feedback_reports_unique_comment ON feedback_reports(reporter_user_id, comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_feedback_posts_author_created ON feedback_posts(author_user_id, created_at);
CREATE INDEX idx_feedback_comments_author ON feedback_comments(author_user_id);
CREATE INDEX idx_feedback_comment_votes_comment ON feedback_comment_votes(comment_id);
CREATE INDEX idx_moderation_actions_created ON moderation_actions(created_at);

-- Notícias públicas: título, link, fonte, data e trecho curto. Nunca o texto
-- integral e nada que identifique quem leu.
CREATE TABLE news_items (
  id TEXT PRIMARY KEY NOT NULL,
  source_key TEXT NOT NULL,
  guid_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_key, guid_hash)
);

CREATE INDEX idx_news_items_published ON news_items(published_at);

CREATE TABLE news_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  news_item_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('AI', 'EXTRACT')),
  model TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE
);

-- Verificação em duas etapas. O segredo TOTP é cifrado com AES-GCM (chave do
-- Worker Secret MFA_ENCRYPTION_KEY); `last_used_step` impede reutilizar um
-- código no mesmo intervalo; falhas consecutivas abrem um bloqueio crescente.
CREATE TABLE mfa_totp (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  secret_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACTIVE')),
  last_used_step INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE mfa_recovery_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id);

-- Códigos de recuperação recém-gerados, cifrados, para uma única exibição.
CREATE TABLE mfa_recovery_reveals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  codes_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Estado "verificação pendente" entre o callback do Google e o código TOTP.
-- A sessão só nasce depois do código.
CREATE TABLE mfa_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  client_kind TEXT NOT NULL CHECK (client_kind IN ('WEB', 'DESKTOP')),
  desktop_request_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_mfa_challenges_expiry ON mfa_challenges(expires_at);

-- Login do app desktop (cliente público, RFC 8252): PKCE do próprio app e
-- redirecionamento de loopback. O código entregue ao app é de uso único.
CREATE TABLE desktop_auth_requests (
  id TEXT PRIMARY KEY NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  desktop_state TEXT NOT NULL,
  -- O navegador do sistema começa pelo BFF (para o cookie que amarra o
  -- `state` ao navegador); este valor de uso único leva a ele.
  handoff_hash TEXT NOT NULL UNIQUE,
  handoff_consumed_at TEXT,
  user_id TEXT,
  code_hash TEXT UNIQUE,
  code_expires_at TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_desktop_auth_requests_expiry ON desktop_auth_requests(expires_at);
CREATE INDEX idx_download_grants_expiry ON download_grants(expires_at);
CREATE INDEX idx_security_events_created ON security_events(created_at);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);
CREATE INDEX idx_idempotency_keys_created ON idempotency_keys(created_at);
