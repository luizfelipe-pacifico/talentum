/* Verificação do instalador de atualização, no processo principal.

   Regra de docs/PRODUCT.md e docs/SECURITY.md: um instalador sem assinatura
   válida ou com checksum divergente nunca é executado. Este módulo é a decisão,
   pura e testável; o download e a execução ficam em main.cjs.

   Duas verificações, nesta ordem:

   1. **SHA-256** do arquivo baixado contra o digest que o GitHub publica para o
      asset da release. Pega corrupção e troca do arquivo em trânsito.
   2. **Assinatura Ed25519** de `talentum-update:v1:<nome do arquivo>:<sha256>`,
      feita com a chave de release do projeto. É o que impede um instalador
      publicado por quem não tem a chave. A mensagem amarra nome e hash, então
      uma assinatura válida de outro arquivo não serve.

   A chave pública ainda não existe (a assinatura de releases está planejada em
   docs/SECURITY.md). Enquanto `UPDATE_SIGNING_PUBLIC_KEY` for nula, a
   verificação recusa sempre: nada não assinado é executado. */

const { createHash, createPublicKey, timingSafeEqual, verify } = require('node:crypto');

/** Repositório oficial; o mesmo de src/server/updates.ts (conferido em teste). */
const OFFICIAL_REPOSITORY = 'luizfelipe-pacifico/talentum';

/** Chave pública Ed25519 em PEM das releases. Nula até a chave de release existir. */
const UPDATE_SIGNING_PUBLIC_KEY = null;

/** Hosts dos quais o processo principal aceita baixar: o GitHub e o CDN de assets dele. */
const DOWNLOAD_HOSTS = new Set(['github.com', 'api.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

function parseVersion(value) {
  const match = typeof value === 'string' ? SEMVER.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** A versão pedida pela janela é SemVer válido e maior que a instalada? */
function isNewerVersion(candidate, installed) {
  const next = parseVersion(candidate);
  const current = parseVersion(installed);
  if (!next || !current) return false;
  for (let index = 0; index < 3; index += 1) if (next[index] !== current[index]) return next[index] > current[index];
  return false;
}

/* Instalador de cada plataforma, igual ao `artifactName` de package.json e a
   `installerAssetName` de src/server/updates.ts. */
function installerAssetName(version, platform, arch) {
  if (platform === 'win32' && arch === 'x64') return `Talentum-${version}-Windows-x64.exe`;
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) return `Talentum-${version}-macOS-${arch}.dmg`;
  return null;
}

function allowedDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && DOWNLOAD_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const signedMessage = (fileName, sha256) => Buffer.from(`talentum-update:v1:${fileName}:${sha256}`, 'utf8');

function checksumMatches(actualHex, expectedHex) {
  if (!/^[a-f0-9]{64}$/.test(actualHex) || !/^[a-f0-9]{64}$/.test(expectedHex)) return false;
  return timingSafeEqual(Buffer.from(actualHex, 'hex'), Buffer.from(expectedHex, 'hex'));
}

/**
 * Decide se o instalador baixado pode ser executado.
 *
 * Devolve `{ ok: true }` só quando o checksum confere **e** a assinatura é
 * válida para a chave configurada. Qualquer outra situação devolve o motivo e
 * quem chama apaga o arquivo sem executá-lo.
 */
function verifyInstaller({ fileName, actualSha256, expectedSha256, signatureBase64, publicKeyPem = UPDATE_SIGNING_PUBLIC_KEY }) {
  if (typeof expectedSha256 !== 'string' || expectedSha256.length === 0) return { ok: false, reason: 'CHECKSUM_MISSING' };
  if (!checksumMatches(actualSha256, expectedSha256)) return { ok: false, reason: 'CHECKSUM_MISMATCH' };
  if (!publicKeyPem) return { ok: false, reason: 'SIGNING_KEY_MISSING' };
  if (typeof signatureBase64 !== 'string' || !/^[A-Za-z0-9+/=\s]{80,200}$/.test(signatureBase64)) return { ok: false, reason: 'SIGNATURE_MISSING' };
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'SIGNING_KEY_INVALID' };
    const valid = verify(null, signedMessage(fileName, actualSha256), key, Buffer.from(signatureBase64.trim(), 'base64'));
    return valid ? { ok: true } : { ok: false, reason: 'SIGNATURE_INVALID' };
  } catch {
    return { ok: false, reason: 'SIGNATURE_INVALID' };
  }
}

function sha256Stream() {
  return createHash('sha256');
}

module.exports = {
  OFFICIAL_REPOSITORY,
  UPDATE_SIGNING_PUBLIC_KEY,
  allowedDownloadUrl,
  checksumMatches,
  installerAssetName,
  isNewerVersion,
  sha256Stream,
  signedMessage,
  verifyInstaller,
};
