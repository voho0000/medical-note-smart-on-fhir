/**
 * The suite's entry point instead of `@playwright/test` directly.
 *
 * Every spec gets the Firebase anonymous session served locally — see
 * fixtures/firebase-auth.ts for why. Applying it here rather than inside
 * `importBundle` means a spec cannot opt out by accident: the three specs that
 * drive the welcome screen without importing a bundle are covered too, and so
 * is any spec added later.
 */
import { test as base } from '@playwright/test'
import { stubFirebaseAnonymousAuth } from './firebase-auth'

export const test = base.extend({
  // The second argument is Playwright's "hand this to the test" callback. It is
  // conventionally named `use`, but positional — and that name trips
  // react-hooks/rules-of-hooks, which reads it as React's `use`.
  context: async ({ context }, runTest) => {
    await stubFirebaseAnonymousAuth(context)
    await runTest(context)
  },
})

export { expect } from '@playwright/test'
