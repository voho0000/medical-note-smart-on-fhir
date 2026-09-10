import { defineConfig } from '@playwright/test'
import config from './playwright.emulated.config'
const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer

export default defineConfig({
  ...config,
  testMatch: 'prompt-gallery.spec.ts',
  testIgnore: [],
  timeout: 90_000,
  use: { ...config.use, baseURL: 'http://localhost:3017' },
  webServer: {
    ...server,
    command: 'next dev --webpack -p 3017',
    url: 'http://localhost:3017',
    reuseExistingServer: false,
    env: {
      ...server?.env,
      NEXT_PUBLIC_AUTH_EMULATOR_PORT: '9198',
      NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: '8188',
    },
  },
})
