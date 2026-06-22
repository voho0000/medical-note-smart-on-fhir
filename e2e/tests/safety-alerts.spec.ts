import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'
import { mockAiStream } from '../fixtures/mock-stream'

// Proactive Safety Alerts — structured scan, mocked end to end (no real model).
// The scan is pinned to Gemini in prod; here we override it to an OpenAI model
// (window.__safetyModelId) so the OpenAI mock-stream fixture applies, and we feed
// back a fixed JSON payload that the panel must parse into fixed alert cards.
const SAFETY_JSON = JSON.stringify({
  scannedCount: 12,
  alerts: [
    {
      severity: 'high',
      title: '藥物過敏衝突',
      detail: '對 Penicillin 嚴重過敏，但處方含 Amoxicillin。',
      evidence: ['Penicillin（嚴重）', 'Amoxicillin 500mg'],
      category: 'allergy',
    },
    {
      severity: 'medium',
      title: '重複用藥',
      detail: 'Metformin 同時開立兩種劑量。',
      evidence: ['Metformin 1000mg', 'Metformin 500mg'],
      category: 'duplicate',
    },
  ],
})

test.describe('safety alerts (mocked)', () => {
  test('manual scan renders structured cards in the locked sub-tab', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __safetyModelId?: string }).__safetyModelId = 'gpt-5.4-nano'
    })
    await mockAiStream(page, { model: 'gpt-5.4-nano', markdown: SAFETY_JSON })
    await importBundle(page)

    // Open Clinical Insights — Safety Alerts is the pinned first / default sub-tab.
    await page.getByRole('tab', { name: /臨床洞察/ }).click()
    await expect(page.getByRole('heading', { name: '主動安全警示' })).toBeVisible()

    // Scan (button sits top-right of the panel header).
    await page.getByRole('button', { name: '掃描安全風險' }).click()

    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('重複用藥')).toBeVisible()
    await expect(page.getByText(/發現\s*2\s*項/)).toBeVisible()
    await expect(page.getByText('高危').first()).toBeVisible()
    await expect(page.getByText('中危').first()).toBeVisible()
    await expect(page.getByText(/僅供臨床參考/)).toBeVisible()
    await expect(page.getByRole('button', { name: '重新掃描' })).toBeVisible()
  })

  test('auto-scan runs automatically when the preference is on', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __safetyModelId?: string }).__safetyModelId = 'gpt-5.4-nano'
      // persisted "auto-scan" preference (zustand persist shape)
      localStorage.setItem('safety-alerts-prefs', JSON.stringify({ state: { autoScan: true }, version: 0 }))
    })
    await mockAiStream(page, { model: 'gpt-5.4-nano', markdown: SAFETY_JSON })
    await importBundle(page)

    await page.getByRole('tab', { name: /臨床洞察/ }).click()

    // No click on the scan button — the cards appear on their own.
    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('重複用藥')).toBeVisible()
    await expect(page.getByRole('button', { name: '重新掃描' })).toBeVisible()
  })
})
