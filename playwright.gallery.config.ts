import { defineConfig } from '@playwright/test'
import config from './playwright.emulated.config'
const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer

export default defineConfig({
  ...config,
  testMatch: ['prompt-gallery.spec.ts', 'gallery-import.spec.ts'],
  testIgnore: [],
  timeout: 90_000,
  use: {
    ...config.use,
    baseURL: 'http://localhost:3017',
    // This suite has no retries, so on-first-retry would never produce the
    // trace needed to diagnose a CI-only emulator/browser failure.
    trace: 'retain-on-failure',
  },
  webServer: {
    ...server,
    // Gallery scenarios repeatedly reload the same account workspace. Running
    // them against `next dev` can hit Next's concurrent development-manifest
    // write race and leave every later request returning a JSON parse 500.
    // E2E should exercise the immutable production output, not hot-reload state.
    command: 'npm run build && next start -p 3017',
    url: 'http://localhost:3017',
    reuseExistingServer: false,
    env: {
      ...server?.env,
      NEXT_PUBLIC_AUTH_EMULATOR_PORT: '9198',
      NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: '8188',
    },
  },
})
