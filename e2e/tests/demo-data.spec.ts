import { test, expect } from '../fixtures/test'

// The "試用資料 / 示範病人" welcome option loads the committed, de-identified
// demo bundle (public/demo/demo-bundle.json) through the normal import path.
// These tests prove it loads, is flagged as demo, exits cleanly — and, as
// defense-in-depth on top of the build script's leak gate, that none of the
// original PII tokens reach the rendered page.
test.describe('demo data (試用資料)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('medical-note-locale', 'zh-TW')
      localStorage.setItem('medical-note-audience', 'medical')
      localStorage.setItem('medical-note-audience-selected', '1')
      // Skip the first-run onboarding stepper (overlays the app on first load).
      localStorage.setItem('medical-note-onboarding-v1', '1')
      localStorage.setItem('medical-note-left-browser-tour-v1', '1')
    })
    await page.goto('/')
  })

  test('loads the anonymised demo patient, shows the demo badge, exits', async ({ page }) => {
    await page.getByTestId('welcome-demo-card').click()

    // Anonymised patient renders (陳○明, with the NHI full-width 〇 mask).
    await expect(page.getByText('陳○明').first()).toBeVisible({ timeout: 30_000 })
    // Header badge reads 示範資料 (the demo variant of the 本地資料 badge).
    await expect(page.getByText('示範資料').first()).toBeVisible()

    // Defense-in-depth: no original PII on the page (surname / real institutions).
    const body = (await page.locator('body').textContent()) || ''
    // '1140010510' = the real NHI institution code (publicly maps back to the
    // hospital) — must be scrubbed along with the names.
    for (const leaked of ['孫', '長庚', '榮總', '嘉基', '1140010510']) {
      expect(body, `original PII token "${leaked}" must not appear`).not.toContain(leaked)
    }
    // ...and the anonymised institution IS present, proving real data flowed through.
    expect(body).toContain('示範')

    // Exit demo by clicking the badge (instant, no confirm) → back to welcome.
    await page.getByRole('button', { name: /結束示範/ }).click()
    await expect(page.getByTestId('welcome-demo-card')).toBeVisible({ timeout: 20_000 })
  })

  test('labels the bundled custom summary with honest pre-generated model provenance', async ({ page }) => {
    await page.getByTestId('welcome-demo-card').click()
    await expect(page.getByText('陳○明').first()).toBeVisible({ timeout: 30_000 })

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    await summaryPanel.getByRole('tab', { name: '自訂摘要' }).click()
    const summaryModule = summaryPanel.locator('article').filter({
      has: page.getByRole('heading', { name: '變化摘要' }),
    })
    const meta = summaryModule.getByTestId('custom-insight-generation-meta')

    await expect(meta).toHaveText('預產生·Gemini 3 Flash Preview', { timeout: 20_000 })
    await expect(meta).toHaveAttribute(
      'aria-label',
      '預產生摘要，由 Gemini 3 Flash Preview 建立',
    )
    await expect(meta.locator('time')).toHaveCount(0)
  })

  test('seeds the English medical summary immediately after switching locale', async ({ page }) => {
    await page.getByTestId('welcome-demo-card').click()
    await expect(page.getByText('陳○明').first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '繁體中文' }).click()
    await page.getByRole('menuitemradio', { name: 'English' }).click()

    await expect(page.getByText('○-Ming Chen').first()).toBeVisible()

    const summaryPanel = page.getByRole('tabpanel', { name: 'Summary', exact: true })
    await expect(summaryPanel.getByText(
      '94yo Male: Stage 3b CKD and Multi-morbidity Care',
      { exact: true },
    )).toBeVisible({ timeout: 20_000 })

    const meta = summaryPanel.getByTestId('medical-summary-generation-meta')
    await expect(meta).toHaveText('Pre-generated·Gemini 3 Flash Preview')
    await expect(meta).toHaveAttribute(
      'aria-label',
      'Pre-generated summary created with Gemini 3 Flash Preview',
    )

    await summaryPanel.getByRole('tab', { name: 'Custom summaries' }).click()
    const customModule = summaryPanel.locator('article').filter({
      has: page.getByRole('heading', { name: "What's Changed" }),
    })
    await expect(customModule).toContainText('August 27 records show', { timeout: 20_000 })
    await expect(customModule.getByTestId('custom-insight-generation-meta'))
      .toHaveAttribute(
        'aria-label',
        'Pre-generated summary created with Gemini 3 Flash Preview',
      )
  })
})
