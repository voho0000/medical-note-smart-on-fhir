import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/coronary',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:3015', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:coronary',
    url: 'http://127.0.0.1:3015/dev/coronary-cdss',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
