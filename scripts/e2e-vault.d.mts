export const E2E_PORT: number;
export const E2E_VAULT_PASSWORD: string;
export function vaultCall(
  base: string,
  method: string,
  path: string,
  json?: unknown,
  cookie?: string,
): Promise<{ status: number; payload: unknown; cookie: string }>;
export function unlockSession(base: string, password?: string): Promise<string>;
export function setUpVault(base: string, password?: string): Promise<boolean>;
