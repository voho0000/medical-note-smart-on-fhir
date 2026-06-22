import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'

// FHIR-generic regression: the 問題清單 card must show conditions regardless of
// FHIR category. The synthetic bundle's Hypertension is `encounter-diagnosis`
// (NOT `problem-list-item`) — the case that used to render an empty card for
// SMART / general-FHIR servers even though the condition was fetched.
test.describe('problem list (FHIR-generic)', () => {
  test('shows an encounter-diagnosis condition, not just problem-list-item', async ({ page }) => {
    await importBundle(page)

    // The card lives in the default 病人資訊 (patient) left-panel tab.
    await expect(page.getByText('Hypertension').first()).toBeVisible({ timeout: 20_000 })
    // ...and the problem-list card is NOT in its empty state (that message is
    // unique to this card), proving it rendered the non-problem-list-item item.
    await expect(page.getByText(/無問題清單/)).toHaveCount(0)
  })

  // clinicalStatus filter: default = Active. The card scopes assertions to its
  // own testid because the IPS export panel also renders every condition.
  test('status filter: default hides resolved, 全部 reveals it', async ({ page }) => {
    await importBundle(page)

    const card = page.getByTestId('problem-list-card')
    // Default (active): the active Hypertension shows, resolved sinusitis hidden.
    await expect(card.getByText('Hypertension')).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText(/Viral sinusitis/)).toHaveCount(0)

    // Switching to 全部 reveals the resolved condition.
    await card.getByRole('button', { name: '全部' }).click()
    await expect(card.getByText(/Viral sinusitis/)).toBeVisible()

    // ...and 已解決 shows the resolved one but not the active Hypertension.
    await card.getByRole('button', { name: '已解決' }).click()
    await expect(card.getByText(/Viral sinusitis/)).toBeVisible()
    await expect(card.getByText('Hypertension')).toHaveCount(0)
  })
})
