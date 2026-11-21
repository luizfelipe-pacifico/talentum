import { expect, test } from '@playwright/test';

/* Checagens automáticas das doze classes de viewport, nos dois temas
   (docs/DESIGN-SYSTEM.md, "Test procedure"): sem rolagem horizontal e sem
   texto abaixo de 12 px. Não substituem a revisão visual, só pegam regressões. */

const ROUTES = [
  '/', '/dashboard', '/extratos', '/extratos/importar', '/extratos/recorrencias', '/extratos/cartoes',
  '/conciliacao', '/conciliacao/faturas', '/contas', '/contas/nova', '/configuracoes', '/configuracoes/categorias', '/configuracoes/seguranca',
  '/planejamento/orcamento', '/planejamento/dividas', '/planejamento/sobrevivencia', '/planejamento/rendas',
  '/patrimonio', '/patrimonio/aportes', '/patrimonio/metas', '/invest', '/historico', '/notificacoes',
  '/perfil', '/perfil/privacidade', '/onboarding/perfil',
];
const THEMES = [
  { name: 'claro', stored: 'Claro', dark: false },
  { name: 'escuro', stored: 'Escuro', dark: true },
] as const;

for (const theme of THEMES) {
  for (const route of [...ROUTES, 'bloqueio']) {
    test(`${route} no tema ${theme.name}`, async ({ page, browser }) => {
      // "bloqueio": a tela de desbloqueio, numa janela sem sessão.
      if (route === 'bloqueio') {
        const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() });
        page = await context.newPage();
      }
      await page.addInitScript((stored) => {
        try {
          localStorage.setItem('talentum:tema', stored);
        } catch {}
      }, theme.stored);
      await page.goto(route === 'bloqueio' ? '/' : route);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html')).toHaveClass(theme.dark ? /\bdark\b/ : /^(?!.*\bdark\b)/);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'a página rola na horizontal').toBeLessThanOrEqual(0);

      const smallText = await page.evaluate(() => {
        const found: string[] = [];
        for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
          if (element.closest('[aria-hidden="true"], .bi, svg, script, style')) continue;
          const ownText = [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim() ?? '')
            .join('');
          if (!ownText) continue;
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const style = getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (Number.parseFloat(style.fontSize) < 12) found.push(`${element.tagName.toLowerCase()} ${style.fontSize}: ${ownText.slice(0, 40)}`);
        }
        return found;
      });
      expect(smallText, 'texto abaixo de 12 px').toEqual([]);

      // Menu lateral fixo (fora do celular, onde vira gaveta): todas as áreas
      // aparecem inteiras, sem rolar. tests/regression/sidebar-cut-on-short-tv.test.mjs
      if (route === '/dashboard' && (page.viewportSize()?.width ?? 0) > 600) {
        const cut = await page.evaluate(() => {
          const nav = document.querySelector('.sidebar-nav');
          if (!nav || getComputedStyle(nav).visibility === 'hidden') return [];
          const box = nav.getBoundingClientRect();
          if (box.right <= 0) return [];
          return [...nav.querySelectorAll<HTMLElement>('.nav-item')]
            .filter((item) => {
              const rect = item.getBoundingClientRect();
              return rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5;
            })
            .map((item) => item.getAttribute('aria-label'));
        });
        expect(cut, 'áreas cortadas no menu lateral').toEqual([]);
      }
    });
  }
}
