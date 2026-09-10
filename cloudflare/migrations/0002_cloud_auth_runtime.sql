PRAGMA foreign_keys = ON;

CREATE TABLE action_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE auth_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  nonce_hash TEXT NOT NULL,
  code_verifier_ciphertext TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limit_windows (
  id TEXT PRIMARY KEY NOT NULL,
  bucket_hash TEXT NOT NULL UNIQUE,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_action_codes_expiry ON action_codes(expires_at);
CREATE INDEX idx_auth_transactions_expiry ON auth_transactions(expires_at);
CREATE INDEX idx_rate_limit_windows_started ON rate_limit_windows(window_started_at);
