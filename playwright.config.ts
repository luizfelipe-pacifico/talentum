import { defineConfig, devices } from '@playwright/test';

/* Testes ponta a ponta do app local. Rodam contra um servidor isolado
   (scripts/e2e-server.mjs): porta 3210 (ou TALENTUM_E2E_PORT), banco SQLite
   novo e cifrado, build em .next-e2e. As doze classes de viewport são as de
   docs/DESIGN-SYSTEM.md. tests/e2e/global-setup.ts desbloqueia o cofre com a
   senha sintética e guarda o cookie de sessão em temp/e2e/storage-state.json,
   usado por todos os testes; os que verificam a tela de bloqueio começam sem ele. */

const PORT = Number(process.env.TALENTUM_E2E_PORT) || 3210;

type ViewportClass = { name: string; width: number; height: number; touch: boolean };

export const VIEWPORT_CLASSES: ViewportClass[] = [
  { name: 'Mobile S', width: 320, height: 568, touch: true },
  { name: 'Mobile M', width: 390, height: 844, touch: true },
  { name: 'Mobile L', width: 414, height: 896, touch: true },
  { name: 'Tablet S', width: 600, height: 960, touch: true },
  { name: 'Tablet M', width: 768, height: 1024, touch: true },
  { name: 'Tablet L', width: 1180, height: 820, touch: true },
  { name: 'Desktop S', width: 1024, height: 700, touch: false },
  { name: 'Desktop M', width: 1536, height: 864, touch: false },
  { name: 'Desktop L', width: 1920, height: 1080, touch: false },
  { name: 'TV S', width: 960, height: 540, touch: false },
  { name: 'TV M', width: 1280, height: 720, touch: false },
  { name: 'TV L', width: 1920, height: 1080, touch: false },
];

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    storageState: 'temp/e2e/storage-state.json',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: /(smoke|vault)\.spec\.ts/, use: { viewport: { width: 1536, height: 864 } } },
    ...VIEWPORT_CLASSES.map((viewport) => ({
      name: viewport.name,
      testMatch: 'viewports.spec.ts',
      use: {
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.touch,
        isMobile: viewport.touch && viewport.width < 1000,
      },
    })),
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${PORT}/api/health/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
