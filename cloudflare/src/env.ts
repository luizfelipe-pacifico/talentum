import type { D1Database } from '@cloudflare/workers-types';

/** Binding do Workers AI: só a chamada que o Worker usa. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/* Variáveis e bindings do Worker. Nomes e locais: docs/ARCHITECTURE.md §3.7.
   Os opcionais desligam uma capacidade quando ausentes, nunca a segurança:
   sem TURNSTILE_SECRET_KEY o desafio só é dispensado fora de produção; sem
   MFA_ENCRYPTION_KEY a verificação em duas etapas responde 503; sem AI o
   resumo usa o trecho inicial da notícia. */
export interface Env {
  DB: D1Database;
  APP_ENV: string;
  ALLOWED_ORIGIN: string;
  PUBLIC_WEB_URL: string;
  SESSION_SIGNING_SECRET: string;
  TOKEN_HASH_PEPPER: string;
  BFF_SHARED_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SECRET_KEY?: string;
  MFA_ENCRYPTION_KEY?: string;
  AI?: AiBinding;
  AI_SUMMARY_MODEL?: string;
}

/** Versões de Termos e Privacidade aceitas no cadastro. Iguais a apps/web/src/server/legal.ts. */
export const LEGAL_VERSIONS = { terms: '2026-11-20', privacy: '2026-11-20' } as const;

export const ACCESS_TTL_SECONDS = 900;
export const REFRESH_TTL_SECONDS = 2_592_000;
export const DOWNLOAD_GRANT_TTL_SECONDS = 120;
export const MFA_CHALLENGE_TTL_SECONDS = 300;
export const DESKTOP_REQUEST_TTL_SECONDS = 600;
export const DESKTOP_CODE_TTL_SECONDS = 60;

export const isProduction = (env: Env) => env.APP_ENV === 'production';
