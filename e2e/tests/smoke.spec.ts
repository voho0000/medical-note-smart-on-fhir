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

  test('asks again on re-import and sends no AI request before the safe choice', async ({ page }) => {
    let aiRequests = 0
    page.on('request', (request) => {
      if (request.url().startsWith('https://e2e-proxy.test/')) aiRequests += 1
    })

    await importBundle(page)
    await page.evaluate(() => {
      localStorage.setItem('mediprisma:auto-ai-real-data-decision-v1', 'auto')
      localStorage.setItem('medical-summary-prefs', JSON.stringify({
        state: { autoGenerate: true, modelId: 'gemini-3.1-flash-lite' },
        version: 0,
      }))
      localStorage.setItem('safety-alerts-prefs', JSON.stringify({
        state: { autoScan: true, modelId: 'gemini-3.1-flash-lite' },
        version: 0,
      }))
    })

    // Same file, same patient, old global auto preference: the helper can only
    // finish if the new import asks again and accepts its own manual receipt.
    await importBundle(page)

    expect(aiRequests).toBe(0)
    await expect(page.getByText('王小明').first()).toBeVisible()
  })
})
