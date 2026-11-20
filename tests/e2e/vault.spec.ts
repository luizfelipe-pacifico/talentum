import { expect, test } from '@playwright/test';
import { E2E_VAULT_PASSWORD } from '../../scripts/e2e-vault.mjs';

/* Cofre local na interface. Estes testes começam SEM o cookie de sessão do
   global-setup: são uma janela nova, como depois de reiniciar o app. Nenhum
   deles usa "Bloquear agora", que fecharia o cofre para os testes paralelos. */

test.use({ storageState: { cookies: [], origins: [] } });

test('sem sessão, só a tela de desbloqueio aparece e nada do aplicativo é montado', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Desbloquear o Talentum' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('R$');
  await expect(page.getByRole('button', { name: 'Esqueci a senha' })).toBeVisible();
});

test('a API recusa código de ação sem sessão', async ({ request }) => {
  const issued = await request.post('/api/action-codes', { data: { method: 'GET', path: '/api/dashboard' } });
  expect(issued.status()).toBe(401);
  expect((await issued.json()).error.code).toBe('VAULT_LOCKED');
  const status = await request.post('/api/action-codes', { data: { method: 'GET', path: '/api/vault/status' } });
  expect(status.status()).toBe(200);
});

test('senha errada mostra o erro sem dizer o motivo; a certa abre o aplicativo', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Senha', { exact: true }).fill('senha errada sintetica');
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.locator('.vault-error')).toContainText('Os dados informados não conferem');
  await page.getByLabel('Senha', { exact: true }).fill(E2E_VAULT_PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bloquear agora' })).toBeVisible();
  await page.goto('/configuracoes/seguranca');
  await expect(page.getByRole('heading', { name: 'Aplicativo autenticador' })).toBeVisible();
  await expect(page.getByText('Disponível no aplicativo para computador.')).toBeVisible();
});
