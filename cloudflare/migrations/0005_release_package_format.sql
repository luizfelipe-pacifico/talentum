-- Formato do pacote de cada artefato de release.
--
-- O Linux publica dois pacotes para a mesma arquitetura: o .deb (Ubuntu e
-- Debian, cujo pós-instalação configura o sandbox do Chromium e o perfil do
-- AppArmor do Ubuntu 24.04) e o AppImage (outras distribuições). A chave única
-- passa a incluir o formato. O formato é gerado da extensão do arquivo
-- publicado, então nunca diverge dele. Um arquivo de tipo desconhecido fica
-- 'UNKNOWN' e não é listado (GET /api/releases); o resgate continua recusando
-- endereço fora do GitHub. Mesmo procedimento de recriação da 0004.
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
  package_format TEXT GENERATED ALWAYS AS (
    CASE
      WHEN lower(download_url) LIKE '%.exe' THEN 'NSIS'
      WHEN lower(download_url) LIKE '%.dmg' THEN 'DMG'
      WHEN lower(download_url) LIKE '%.zip' THEN 'ZIP'
      WHEN lower(download_url) LIKE '%.appimage' THEN 'APPIMAGE'
      WHEN lower(download_url) LIKE '%.deb' THEN 'DEB'
      ELSE 'UNKNOWN'
    END
  ) STORED,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  UNIQUE (release_id, platform, architecture, package_format)
);

INSERT INTO release_artifacts_new(id,release_id,platform,architecture,download_url,sha256,signature,created_at)
  SELECT id,release_id,platform,architecture,download_url,sha256,signature,created_at FROM release_artifacts;

DROP TABLE release_artifacts;
ALTER TABLE release_artifacts_new RENAME TO release_artifacts;
CREATE INDEX idx_release_artifacts_release_id ON release_artifacts(release_id);

PRAGMA defer_foreign_keys = false;
