import { defineConfig, devices } from '@playwright/test'

// E2E config. Drives the app headless in Chromium against `next dev` on :3001.
// Tests live in e2e/tests and exercise CLIENT-ONLY flows by importing a
// synthetic FHIR bundle through the real file input — no SMART OAuth, no live
// FHIR server, no Firebase/AI needed. See e2e/README.md.
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    locale: 'zh-TW',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    // First Turbopack compile can be slow on a cold CI runner.
    timeout: 180_000,
  },
})
