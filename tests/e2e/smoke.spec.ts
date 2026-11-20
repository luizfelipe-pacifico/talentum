import { expect, type Page, test } from '@playwright/test';

/* Fluxos básicos do app local contra um banco vazio (scripts/e2e-server.mjs).
   Regras cobertas: R-29 de docs/PRODUCT.md (zero é afirmação), código de ação
   obrigatório na API local e páginas de erro com caminho de volta. */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('o Início abre sem nenhum valor financeiro', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('R$');
  expect(errors).toEqual([]);
});

test('com o banco vazio, o Dashboard mostra o estado vazio e nunca R$ 0,00', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Sua base financeira ainda está vazia' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('R$ 0,00');
  expect(errors).toEqual([]);
});

test('a API local recusa chamada sem código de ação', async ({ request }) => {
  const response = await request.get('/api/dashboard');
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('INVALID_ACTION_CODE');
});

test('o código de ação vale uma vez só', async ({ request }) => {
  const issued = await request.post('/api/action-codes', { data: { method: 'GET', path: '/api/system/status' } });
  expect(issued.ok()).toBe(true);
  const { actionCode } = await issued.json();
  const headers = { 'X-Action-Code': actionCode };
  expect((await request.get('/api/system/status', { headers })).status()).toBe(200);
  expect((await request.get('/api/system/status', { headers })).status()).toBe(403);
});

test('rota inexistente mostra a página própria com caminho de volta', async ({ page }) => {
  await page.goto('/rota-que-nao-existe');
  await expect(page.getByText('Este endereço não corresponde a nenhuma área do Talentum.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao Início' }).click();
  await expect(page).toHaveURL('/');
});
