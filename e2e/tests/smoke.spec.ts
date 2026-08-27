import { test, expect } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

// Phase 0 smoke: proves the whole harness works end-to-end — the dev server
// boots, the synthetic bundle imports through the real file input, and the
// patient renders from the local-bundle path (no SMART auth / Firebase).
test.describe('import → render (smoke)', () => {
  test('imports the synthetic bundle and shows the patient', async ({ page }) => {
    await importBundle(page)
    await expect(page.getByText('王小明').first()).toBeVisible()
  })

  test('ignores the retired auto preference and makes no AI request on re-import', async ({ page }) => {
    let aiRequests = 0
    page.on('request', (request) => {
      if (request.url().startsWith('https://e2e-proxy.test/')) aiRequests += 1
    })

    await importBundle(page)
    await page.evaluate(() => {
      // This key belonged to the removed post-import AI decision dialog. A
      // stale "auto" receipt must not opt the user into the replacement
      // auto-generate switch.
      localStorage.setItem('mediprisma:auto-ai-real-data-decision-v1', 'auto')
    })

    // Same file, same patient, retired global auto preference: importing is
    // still silent because the current per-module switch remains off.
    await importBundle(page)

    expect(aiRequests).toBe(0)
    await expect(page.getByText('王小明').first()).toBeVisible()
  })
})
