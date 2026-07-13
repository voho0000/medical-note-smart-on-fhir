import { test, expect, type Page } from '@playwright/test'
import { importBundle } from '../fixtures/import'
import { mockAiStream, getChatCallCount } from '../fixtures/mock-stream'

// The Medical Summary action launches two independently validated pipelines in
// one batch. Route each request to a valid deterministic payload so these tests
// exercise the current unified UI without a real model or network.
const TEST_MODEL_ID = 'gpt-5.4-nano'

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

const SUMMARY_JSON = JSON.stringify({
  headline: '跨院病歷測試摘要',
  summary: [{ text: '已完成測試資料彙整。', emphasis: false, sources: [] }],
  investigations: [],
  medicationEducation: [],
  medicationReview: { regimen: [], changes: [], reconciliation: [] },
  problems: [],
  decisions: [],
  timeline: [],
})

async function mockUnifiedSummary(page: Page, autoGenerate = false) {
  await page.addInitScript(
    ({ modelId, autoGenerate }) => {
      localStorage.setItem('medical-summary-prefs', JSON.stringify({
        state: { autoGenerate, modelId },
        version: 0,
      }))
      localStorage.setItem('safety-alerts-prefs', JSON.stringify({
        state: { autoScan: autoGenerate, modelId },
        version: 0,
      }))
    },
    { modelId: TEST_MODEL_ID, autoGenerate },
  )
  await mockAiStream(page, {
    model: TEST_MODEL_ID,
    markdown: SUMMARY_JSON,
    replies: [
      { includes: 'clinical medication-safety reviewer', markdown: SAFETY_JSON },
      { includes: 'structured cross-hospital patient summary', markdown: SUMMARY_JSON },
    ],
  })
}

test.describe('safety alerts (mocked)', () => {
  test('manual summary generation renders the integrated safety card', async ({ page }) => {
    await mockUnifiedSummary(page)
    await importBundle(page)

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    await summaryPanel.getByRole('button', { name: '產生摘要' }).click()

    await expect(summaryPanel.getByRole('heading', { name: '安全提醒與待處置事項' })).toBeVisible({ timeout: 20_000 })
    await expect(summaryPanel.getByText('藥物過敏衝突')).toBeVisible()
    await expect(summaryPanel.getByText('重複用藥')).toBeVisible()
    await expect(summaryPanel.getByText('高危', { exact: true })).toBeVisible()
    await expect(summaryPanel.getByText('中危', { exact: true })).toBeVisible()
    await expect(summaryPanel.getByText(/僅供臨床參考/)).toBeVisible()
    await expect(summaryPanel.getByRole('button', { name: '重新產生' })).toBeVisible()
  })

  test('model picker lists gated models and syncs the unified summary choice', async ({ page }) => {
    await importBundle(page)
    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })

    // The picker shows the default model; open it.
    await summaryPanel.getByTestId('model-picker-trigger').click()

    // Free models are selectable; premium models route to key setup.
    await expect(page.getByRole('menuitem', { name: /Claude Haiku 4\.5/ })).toBeVisible()
    const opusKeyLink = page.getByTestId('model-picker-key-link-claude-opus-4-8')
    await expect(opusKeyLink).toBeVisible()
    await expect(opusKeyLink).toHaveAccessibleName('Claude Opus 4.8，設定金鑰')

    // Pick a free model → label updates.
    await page.getByRole('menuitem', { name: /Claude Haiku 4\.5/ }).click()
    await expect(summaryPanel.getByTestId('model-picker-trigger')).toContainText('Claude Haiku 4.5')

    // One user-facing model choice is persisted to both underlying pipelines,
    // while the independent chat model remains untouched.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('medical-summary-prefs') || ''))
      .toContain('claude-haiku-4-5')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('safety-alerts-prefs') || ''))
      .toContain('claude-haiku-4-5')
    const chatPrefs = await page.evaluate(() => localStorage.getItem('ai-config-storage') || '')
    expect(chatPrefs).not.toContain('claude-haiku-4-5')
  })

  test('auto-generation runs the integrated safety analysis', async ({ page }) => {
    await mockUnifiedSummary(page, true)
    await importBundle(page)

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    await expect(summaryPanel.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    await expect(summaryPanel.getByText('重複用藥')).toBeVisible()
    await expect(summaryPanel.getByRole('button', { name: '重新產生' })).toBeVisible()
  })

  test('a cached unified summary is reused after a page reload — no re-bill', async ({ page }) => {
    await mockUnifiedSummary(page, true)
    await importBundle(page)

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    await expect(summaryPanel.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    expect(await getChatCallCount(page)).toBeGreaterThanOrEqual(2)

    // Both results come back from encrypted cache. The mock counter resets per
    // navigation, so 0 proves neither pipeline was billed again.
    await page.reload()
    await expect(summaryPanel.getByText('藥物過敏衝突')).toBeVisible({ timeout: 20_000 })
    await expect(summaryPanel.getByText('重複用藥')).toBeVisible()
    expect(await getChatCallCount(page)).toBe(0)
  })
})
