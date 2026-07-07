import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'
import { mockAiStream, getChatCallCount } from '../fixtures/mock-stream'

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
    await page.getByRole('tab', { name: '醫療摘要' }).click()
    await expect(page.getByRole('heading', { name: '主動安全警示' })).toBeVisible()

    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('重複用藥')).toBeVisible()
    await expect(page.getByText(/發現\s*2\s*項/)).toBeVisible()
    await expect(page.getByText('高危').first()).toBeVisible()
    await expect(page.getByText('中危').first()).toBeVisible()
    await expect(page.getByText(/僅供臨床參考/)).toBeVisible()
    await expect(page.getByRole('button', { name: '重新產生' })).toBeVisible()
  })

  test('model picker lists gated models and persists the choice independently', async ({ page }) => {
    await importBundle(page)
    await page.getByRole('tab', { name: '醫療摘要' }).click()
    await expect(page.getByRole('heading', { name: '主動安全警示' })).toBeVisible()

    // The picker shows the default model; open it.
    await page.getByRole('button', { name: /模型：.*Flash-Lite/ }).click()

    // Free models are selectable; premium models are locked (no user key).
    await expect(page.getByRole('menuitem', { name: /Claude Haiku 4\.5/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Claude Opus 4\.8/ })).toHaveAttribute('aria-disabled', 'true')

    // Pick a free model → label updates.
    await page.getByRole('menuitem', { name: /Claude Haiku 4\.5/ }).click()
    await expect(page.getByRole('button', { name: /模型：.*Claude Haiku 4\.5/ })).toBeVisible()

    // Persisted to the safety-specific store (NOT the chat model store).
    const safetyPrefs = await page.evaluate(() => localStorage.getItem('safety-alerts-prefs'))
    expect(safetyPrefs).toContain('claude-haiku-4-5')
    const chatPrefs = await page.evaluate(() => localStorage.getItem('ai-config-storage') || '')
    expect(chatPrefs).not.toContain('claude-haiku-4-5')
  })

  test('auto-scan runs automatically when the preference is on', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __safetyModelId?: string }).__safetyModelId = 'gpt-5.4-nano'
      // persisted "auto-scan" preference (zustand persist shape)
      localStorage.setItem('safety-alerts-prefs', JSON.stringify({ state: { autoScan: true }, version: 0 }))
      // Isolate the safety-scan call count from the summary auto-generate.
      localStorage.setItem('medical-summary-prefs', JSON.stringify({ state: { autoGenerate: false }, version: 0 }))
    })
    await mockAiStream(page, { model: 'gpt-5.4-nano', markdown: SAFETY_JSON })
    await importBundle(page)

    await page.getByRole('tab', { name: '醫療摘要' }).click()

    // No click on the scan button — the cards appear on their own.
    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('重複用藥')).toBeVisible()
    await expect(page.getByRole('button', { name: '重新產生' })).toBeVisible()
  })

  test('a cached scan is reused after a page reload — no re-bill', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __safetyModelId?: string }).__safetyModelId = 'gpt-5.4-nano'
      localStorage.setItem('safety-alerts-prefs', JSON.stringify({ state: { autoScan: true }, version: 0 }))
      // Isolate the safety-scan call count from the summary auto-generate.
      localStorage.setItem('medical-summary-prefs', JSON.stringify({ state: { autoGenerate: false }, version: 0 }))
    })
    await mockAiStream(page, { model: 'gpt-5.4-nano', markdown: SAFETY_JSON })
    await importBundle(page)

    await page.getByRole('tab', { name: '醫療摘要' }).click()
    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    expect(await getChatCallCount(page)).toBeGreaterThanOrEqual(1) // scanned at least once

    // Reload. The result must come back from the encrypted cache (it survives in
    // localStorage; the session key survives in sessionStorage) WITHOUT a fresh
    // AI call — the counter resets per navigation, so 0 proves no re-scan.
    await page.reload()
    await page.getByRole('tab', { name: '醫療摘要' }).click()
    await expect(page.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('重複用藥')).toBeVisible()
    expect(await getChatCallCount(page)).toBe(0) // reused — no re-bill
  })
})
