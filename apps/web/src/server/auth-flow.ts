/* Decisões puras do fluxo de login no BFF, sem Next: testáveis direto.

   O Worker responde ao callback (e à verificação em duas etapas) de três
   formas: tokens da sessão web, um desafio de verificação pendente, ou o
   endereço de loopback do app desktop com o código de uso único. */

export type LoginOutcome =
  | { kind: 'session'; accessToken: string; accessExpiresInSeconds: number; refreshToken: string; refreshExpiresInSeconds: number }
  | { kind: 'mfa'; mfaToken: string; expiresInSeconds: number }
  | { kind: 'desktop'; url: string }
  | { kind: 'invalid' };

/**
 * Loopback do app desktop: `http`, IP literal, porta explícita e caminho
 * `/callback` (RFC 8252 §7.3). Igual a `isLoopbackRedirect` do Worker; o BFF
 * confere de novo antes de redirecionar o navegador, para nunca virar open
 * redirect.
 */
export function isDesktopLoopback(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const port = Number(url.port);
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535 &&
    url.pathname === '/callback' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '' &&
    [...url.searchParams.keys()].sort().join(',') === 'code,state'
  );
}

const text = (value: unknown, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max;
const seconds = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 31_536_000;

export function loginOutcome(body: unknown): LoginOutcome {
  const x = (body ?? {}) as Record<string, unknown>;
  if (x.mfaRequired === true && text(x.mfaToken) && seconds(x.expiresInSeconds)) {
    return { kind: 'mfa', mfaToken: x.mfaToken as string, expiresInSeconds: x.expiresInSeconds as number };
  }
  if (typeof x.desktopRedirect === 'string') {
    return isDesktopLoopback(x.desktopRedirect) ? { kind: 'desktop', url: x.desktopRedirect } : { kind: 'invalid' };
  }
  if (text(x.accessToken) && text(x.refreshToken) && seconds(x.accessExpiresInSeconds) && seconds(x.refreshExpiresInSeconds)) {
    return {
      kind: 'session',
      accessToken: x.accessToken as string,
      accessExpiresInSeconds: x.accessExpiresInSeconds as number,
      refreshToken: x.refreshToken as string,
      refreshExpiresInSeconds: x.refreshExpiresInSeconds as number,
    };
  }
  return { kind: 'invalid' };
}

/** Código de erro do Worker no início do login → aviso da página /entrar. */
export function startErrorNotice(status: number, code: string | null): 'desafio' | 'limite' | 'indisponivel' {
  if (code === 'CHALLENGE_FAILED') return 'desafio';
  if (status === 429) return 'limite';
  return 'indisponivel';
}

/** Código de erro da verificação → aviso da página /entrar/verificacao. */
export function mfaErrorNotice(code: string | null): 'codigo' | 'bloqueado' | 'expirado' {
  if (code === 'MFA_LOCKED' || code === 'RATE_LIMITED') return 'bloqueado';
  if (code === 'INVALID_MFA_CODE') return 'codigo';
  return 'expirado';
}

/** Endereço de artefato aceito para o redirecionamento final do download. */
export function isArtifactUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(url.hostname) &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}
