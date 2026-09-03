import { defineConfig } from '@playwright/test'

// Opt-in local review: requires the generated >1M-token synthetic fixture and
// an already-running localhost:3001. Not part of the default E2E/deploy suite.
export default defineConfig({
  testDir: './e2e/local-review',
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    channel: 'chrome',
    headless: true,
    locale: 'zh-TW',
  },
})
