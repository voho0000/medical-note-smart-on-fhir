import { expect, test } from '@playwright/test'
import { importBundle } from '../fixtures/import'

/**
 * Android's hardware back and iOS' edge swipe both arrive as a session-history
 * pop, which is exactly what `page.goBack()` produces. Before the workspace
 * claimed those entries, either gesture left the app — and since the bundle,
 * the AI output and the chat all live in memory, leaving discarded the whole
 * session. These tests hold that door shut.
 *
 * The hook's own mechanics are unit-tested; what matters here is the wiring:
 * that the phone layers actually register, and that a pop lands the reader
 * back in the clinical browser rather than on the welcome screen.
 */
test.describe('phone back gesture', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('closes an open detail instead of leaving the app', async ({ page }) => {
    await importBundle(page)
    await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
    await page.getByRole('tab', { name: /^生化 \(/ }).click()

    await page.getByRole('button', { name: /^查看 .+ 趨勢$/ }).first().click()
    await expect(page.getByRole('button', { name: '功能' })).toHaveAttribute('aria-pressed', 'true')
    const detailPanel = page.getByRole('region', { name: '功能' })
    await expect(detailPanel.getByTestId('cumulative-trend-detail')).toBeVisible()

    await page.goBack()

    // Back into the clinical browser, on the sub-tab the trend was opened from.
    await expect(page.getByRole('button', { name: '臨床摘要' }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('tab').filter({ hasText: '報告' }).first())
      .toHaveAttribute('data-state', 'active')
    await expect(detailPanel.getByTestId('cumulative-trend-detail')).toBeHidden()
    // Still the same session: the imported patient was not thrown away.
    await expect(page.getByText('王小明').first()).toBeAttached()
  })

  test('returns from the 功能 panel to 臨床摘要', async ({ page }) => {
    await importBundle(page)
    await page.getByRole('button', { name: '功能' }).click()
    await expect(page.getByRole('button', { name: '功能' })).toHaveAttribute('aria-pressed', 'true')

    await page.goBack()

    await expect(page.getByRole('button', { name: '臨床摘要' }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('王小明').first()).toBeAttached()
  })

  test('does not pile up dead entries across repeated open/close cycles', async ({ page }) => {
    await importBundle(page)
    const features = page.getByRole('button', { name: '功能' })
    const clinical = page.getByRole('button', { name: '臨床摘要' })

    // Three round trips driven by the in-app switcher, which must rewind the
    // entry it pushed. If it did not, the back below would walk through stale
    // entries instead of reaching the pre-switch state in one step.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await features.click()
      await expect(features).toHaveAttribute('aria-pressed', 'true')
      await clinical.click()
      await expect(clinical).toHaveAttribute('aria-pressed', 'true')
    }

    await features.click()
    await expect(features).toHaveAttribute('aria-pressed', 'true')
    await page.goBack()
    await expect(clinical).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('王小明').first()).toBeAttached()
  })
})
