/* Aviso de nova versão (docs/PRODUCT.md, "New-version notice and application update").

   O backend local consulta a API pública de releases do repositório oficial,
   fixo em código; o renderer nunca fala com o GitHub e nunca escolhe URL. Só
   conta release estável (nem `draft`, nem `prerelease`) com tag SemVer válida
   maior que a versão em execução.

   Defesas, todas aqui:

   - tempo-limite na consulta e teto no tamanho da resposta;
   - validação estrita do JSON (zod) e de cada URL devolvida, que precisa
     apontar para o próprio repositório oficial no github.com;
   - notas sanitizadas: sem HTML, sem link, sem caractere de controle, curtas;
   - cache: resultado válido por 6 horas e falha por 30 minutos, dentro do
     limite da API pública; sem rede, a resposta é "indisponível", sem erro;
   - a consulta é anônima: nenhum dado da pessoa, nenhum identificador.

   O `fetch` é injetado: os testes nunca tocam a rede. Puro o bastante para o
   teste do Node importar direto. */

import { z } from 'zod';

/** Repositório oficial. Fixo na compilação; não vem da interface nem do ambiente. */
export const OFFICIAL_REPOSITORY = 'luizfelipe-pacifico/talentum';
export const RELEASES_API = `https://api.github.com/repos/${OFFICIAL_REPOSITORY}/releases?per_page=20`;

export const CHECK_TIMEOUT_MS = 5_000;
export const MAX_RESPONSE_BYTES = 1_000_000;
export const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
export const FAILURE_TTL_MS = 30 * 60 * 1000;
export const POSTPONE_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTES_CHARS = 600;

/**
 * Nome do instalador desta plataforma, igual ao `artifactName` de package.json:
 * `.exe` (NSIS) no Windows x64, `.dmg` no macOS (arm64 ou x64) e `.AppImage` no
 * Linux x64. `null` para combinação que o projeto não publica. O mesmo cálculo
 * existe em electron/update-verify.cjs (conferido em teste).
 */
export function installerAssetName(version: string, platform: string, arch: string): string | null {
  if (platform === 'win32' && arch === 'x64') return `Talentum-${version}-Windows-x64.exe`;
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) return `Talentum-${version}-macOS-${arch}.dmg`;
  if (platform === 'linux' && arch === 'x64') return `Talentum-${version}-Linux-x64.AppImage`;
  return null;
}

export type Semver = readonly [number, number, number];

/** `1.2.3` ou `v1.2.3`, exatamente. Pré-release e metadados de build não contam. */
export function parseSemver(value: string): Semver | null {
  const match = /^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareSemver(left: Semver, right: Semver): number {
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  return 0;
}

const githubUrl = (prefix: string) =>
  z.string().max(500).url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(prefix);
    } catch {
      return false;
    }
  });

const assetSchema = z.object({
  name: z.string().max(200),
  size: z.number().int().nonnegative(),
  digest: z.string().max(100).nullable().optional(),
  browser_download_url: githubUrl(`/${OFFICIAL_REPOSITORY}/releases/download/`),
});

const releaseSchema = z.object({
  tag_name: z.string().max(64),
  body: z.string().max(100_000).nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  html_url: githubUrl(`/${OFFICIAL_REPOSITORY}/releases/`),
  published_at: z.string().max(40).nullable().optional(),
  assets: z.array(assetSchema).max(100),
});

const releasesSchema = z.array(z.unknown()).max(100);

export type UpdateRelease = {
  version: string;
  notes: string;
  publishedAt: string | null;
  releaseUrl: string;
  /** Instalador desta plataforma, com o SHA-256 publicado pelo GitHub quando existe. */
  asset: { name: string; size: number; sha256: string | null } | null;
};

/**
 * Notas de versão seguras para exibir como texto puro.
 *
 * Remove HTML, imagens e links de Markdown (fica o texto do link), cercas de
 * código, marcação de título e ênfase, e caracteres de controle e de inversão
 * de direção; colapsa linhas em branco e corta no limite.
 */
export function sanitizeNotes(body: string | null | undefined): string {
  if (!body) return '';
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_NOTES_CHARS ? `${text.slice(0, MAX_NOTES_CHARS - 1).trimEnd()}…` : text;
}

/**
 * A release estável mais nova acima da versão em execução, ou `null`.
 *
 * Entrada inválida é ignorada item a item: uma release malformada não esconde
 * as outras, e nada fora do esquema chega à resposta.
 */
export function latestStableRelease(
  payload: unknown,
  currentVersion: string,
  target: { platform: string; arch: string } = { platform: 'win32', arch: 'x64' },
): UpdateRelease | null {
  const current = parseSemver(currentVersion);
  const list = releasesSchema.safeParse(payload);
  if (!current || !list.success) return null;

  let best: { semver: Semver; release: z.infer<typeof releaseSchema> } | null = null;
  for (const raw of list.data) {
    const parsed = releaseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.draft || parsed.data.prerelease) continue;
    const semver = parseSemver(parsed.data.tag_name);
    if (!semver || compareSemver(semver, current) <= 0) continue;
    if (!best || compareSemver(semver, best.semver) > 0) best = { semver, release: parsed.data };
  }
  if (!best) return null;

  const version = best.semver.join('.');
  const name = installerAssetName(version, target.platform, target.arch);
  const asset = name ? best.release.assets.find((candidate) => candidate.name === name) : undefined;
  const digest = asset?.digest && /^sha256:[a-f0-9]{64}$/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : null;
  return {
    version,
    notes: sanitizeNotes(best.release.body),
    publishedAt: best.release.published_at ?? null,
    releaseUrl: best.release.html_url,
    asset: asset ? { name: asset.name, size: asset.size, sha256: digest } : null,
  };
}

export type UpdateCheck =
  | { status: 'update-available'; currentVersion: string; release: UpdateRelease }
  | { status: 'up-to-date'; currentVersion: string }
  | { status: 'unavailable'; currentVersion: string };

type CacheEntry = { at: number; result: UpdateCheck };
const store = globalThis as typeof globalThis & { talentumUpdateCache?: CacheEntry };

export function clearUpdateCache() {
  store.talentumUpdateCache = undefined;
}

/**
 * Consulta as releases, com cache e falha silenciosa.
 *
 * `fetchImpl` é obrigatório de propósito: a rota passa o `fetch` global, e o
 * teste passa um falso. Nenhum cabeçalho identifica a pessoa.
 */
export async function checkForUpdate(options: {
  fetchImpl: typeof fetch;
  currentVersion: string;
  /** Plataforma e arquitetura deste processo; o backend roda na mesma máquina da janela. */
  target?: { platform: string; arch: string };
  now?: number;
}): Promise<UpdateCheck> {
  const now = options.now ?? Date.now();
  const cached = store.talentumUpdateCache;
  if (cached) {
    const ttl = cached.result.status === 'unavailable' ? FAILURE_TTL_MS : SUCCESS_TTL_MS;
    if (now - cached.at < ttl && cached.result.currentVersion === options.currentVersion) return cached.result;
  }

  let result: UpdateCheck = { status: 'unavailable', currentVersion: options.currentVersion };
  try {
    const response = await options.fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Talentum-update-check' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const declared = Number(response.headers.get('content-length') ?? '0');
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.includes('json') && declared <= MAX_RESPONSE_BYTES) {
      const text = await response.text();
      if (text.length <= MAX_RESPONSE_BYTES) {
        const release = latestStableRelease(JSON.parse(text), options.currentVersion, options.target);
        result = release
          ? { status: 'update-available', currentVersion: options.currentVersion, release }
          : { status: 'up-to-date', currentVersion: options.currentVersion };
      }
    }
  } catch {
    // Sem rede, tempo esgotado, JSON inválido: nada aparece para a pessoa.
  }
  store.talentumUpdateCache = { at: now, result };
  return result;
}

/** Preferência local de adiamento: `{ version, until }` em `UserPreference`. */
export const POSTPONE_PREFERENCE_KEY = 'updates.postponed';

export function isPostponed(raw: string | null | undefined, version: string, now: number): boolean {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as { version?: unknown; until?: unknown };
    return value.version === version && typeof value.until === 'number' && value.until > now;
  } catch {
    return false;
  }
}
