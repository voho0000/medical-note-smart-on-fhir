/**
 * An open card is its section while it is open. A card left open in a section
 * the clinician then left must not come back as that section when they
 * return by its name in the column or by the way back an answer opened — the section, and
 * the questions the press was for, must show (#194 review, head 539e71de:
 * DP-24 → 02 → 01 showed only DP-24's card).
 *
 * Runs on the dev-only scenario harness, at a wide panel.
 */
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

async function openScenario(page: Page, id: string, width: number) {
  await page.goto('/dev/cdss-scenarios')
  await page.locator(`button[data-scenario="${id}"]`).click()
  await page.waitForURL('**/cdss-scenarios/view')
  await page.goto(`/dev/cdss-scenarios/view?w=${width}&scroll=panel`)
  await expect(page.getByTestId('cdss-visit-map')).toBeVisible({ timeout: 90_000 })
}

test.describe('CDSS decision map: coming back to a section', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('by its name in the column, the section shows — not the card left open there', async ({ page }) => {
    await openScenario(page, 'p5-titrating-af', 1400)
    await page.locator('[data-testid="cdss-visit-overview"] button[data-dp="DP-24"]').first().click()
    await expect(page.getByTestId('cdss-visit-detail-slot')).toHaveAttribute('data-dp', 'DP-24')
    await page.getByTestId('cdss-visit-section-toggle-treatment').click()
    await page.getByTestId('cdss-visit-section-toggle-status').click()
    await expect(page.getByTestId('cdss-visit-detail-slot')).toHaveCount(0)
    await expect(page.getByTestId('cdss-visit-column-status-body')).toBeVisible()
  })

  test('by the way back an answer in 02 opened, the questions it points to show', async ({ page }) => {
    await openScenario(page, 'p5-titrating-af', 1400)
    await page.locator('[data-testid="cdss-visit-overview"] button[data-dp="DP-24"]').first().click()
    await page.getByTestId('cdss-visit-section-toggle-treatment').click()
    const carried = page.getByTestId('cdss-visit-pending-asks-treatment')
    await carried.getByRole('button', { name: '變差' }).click()
    await carried.getByRole('button', { name: '增加' }).click()
    await page.getByTestId('cdss-visit-pending-asks-to-status-treatment').click()
    await expect(page.getByTestId('cdss-visit-detail-slot')).toHaveCount(0)
    await expect(page.getByTestId('cdss-visit-column-status-body')).toBeVisible()
    // The fuller questions 喘變差 opened are open, and on the page.
    await expect(page.getByTestId('cdss-visit-asks-detail')).toBeVisible()
  })
})
