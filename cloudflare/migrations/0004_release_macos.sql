-- macOS entre as plataformas de release.
--
-- O SQLite não altera um CHECK existente: a tabela é recriada com o mesmo
-- esquema e a nova plataforma. `defer_foreign_keys` é a forma recomendada pelo
-- D1 para migrations que recriam tabelas referenciadas. Ao apagar a tabela
-- antiga, as concessões de download (vida de 2 minutos) saem em cascata; os
-- eventos de auditoria ficam, porque não referenciam o artefato por FK.
PRAGMA defer_foreign_keys = true;

CREATE TABLE release_artifacts_new (
  id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('WINDOWS', 'LINUX', 'MACOS')),
  architecture TEXT NOT NULL,
  download_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  signature TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  UNIQUE (release_id, platform, architecture)
);

INSERT INTO release_artifacts_new(id,release_id,platform,architecture,download_url,sha256,signature,created_at)
  SELECT id,release_id,platform,architecture,download_url,sha256,signature,created_at FROM release_artifacts;

DROP TABLE release_artifacts;
ALTER TABLE release_artifacts_new RENAME TO release_artifacts;
CREATE INDEX idx_release_artifacts_release_id ON release_artifacts(release_id);

PRAGMA defer_foreign_keys = false;
