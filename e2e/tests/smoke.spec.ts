import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'

// Phase 0 smoke: proves the whole harness works end-to-end — the dev server
// boots, the synthetic bundle imports through the real file input, and the
// patient renders from the local-bundle path (no SMART auth / Firebase).
test.describe('import → render (smoke)', () => {
  test('imports the synthetic bundle and shows the patient', async ({ page }) => {
    await importBundle(page)
    await expect(page.getByText('王小明').first()).toBeVisible()
  })
})
