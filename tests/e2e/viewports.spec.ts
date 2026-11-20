import { expect, test } from '@playwright/test';

/* Checagens automáticas das doze classes de viewport, nos dois temas
   (docs/DESIGN-SYSTEM.md, "Test procedure"): sem rolagem horizontal e sem
   texto abaixo de 12 px. Não substituem a revisão visual, só pegam regressões. */

const ROUTES = ['/', '/dashboard', '/extratos', '/configuracoes'];
const THEMES = [
  { name: 'claro', stored: 'Claro', dark: false },
  { name: 'escuro', stored: 'Escuro', dark: true },
] as const;

for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`${route} no tema ${theme.name}`, async ({ page }) => {
      await page.addInitScript((stored) => {
        try {
          localStorage.setItem('talentum:tema', stored);
        } catch {}
      }, theme.stored);
      await page.goto(route);
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
    });
  }
}
