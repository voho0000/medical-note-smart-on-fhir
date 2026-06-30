import { defineConfig, devices } from '@playwright/test'

// E2E for the Firebase-connected chain — anonymous sign-in -> ID token ->
// proxy-auth header — run against the Auth + Firestore EMULATORS.
//
// Orchestrated by the firebase repo's `npm run test:e2e:app`, which starts the
// emulators (auth 9099 / firestore 8080) and then invokes this config. Uses a
// DEDICATED dev server on :3002 with NEXT_PUBLIC_FIREBASE_EMULATOR=1 so it never
// collides with the normal :3001 dev server or the client-only e2e suite, and
// tests live in e2e/emulated so the main playwright.config.ts never runs them.
export default defineConfig({
  testDir: './e2e/emulated',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    locale: 'zh-TW',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'next dev --turbopack -p 3002',
    url: 'http://localhost:3002',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_FIREBASE_EMULATOR: '1',
      // Demo Firebase web config — the emulators ignore real credentials, but
      // the projectId must match the emulator project (demo-mediprisma).
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-mediprisma',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-mediprisma.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
      // Pin proxy URLs so a no-user-key model routes through the proxy and the
      // capture shim knows the host to intercept (same as the main e2e config).
      NEXT_PUBLIC_CHAT_URL: 'https://e2e-proxy.test/chat',
      NEXT_PUBLIC_GEMINI_URL: 'https://e2e-proxy.test/gemini',
      NEXT_PUBLIC_CLAUDE_URL: 'https://e2e-proxy.test/claude',
    },
  },
})
