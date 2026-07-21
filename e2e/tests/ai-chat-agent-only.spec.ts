import { test, expect } from '@playwright/test'
import { chatPanel, importBundle, openChatInput } from '../fixtures/import'

test.describe('AI chat agent-only UI', () => {
  test('does not expose mode or clinical-context injection controls', async ({ page }) => {
    await importBundle(page)
    await openChatInput(page)

    const panel = chatPanel(page)
    await expect(panel.getByText('深入', { exact: true })).toHaveCount(0)
    await expect(panel.getByText('一般', { exact: true })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: '病歷', exact: true })).toHaveCount(0)
    await expect(panel.getByText('自動帶入', { exact: true })).toHaveCount(0)
    await expect(panel.getByTestId('chat-template-insert')).toBeVisible()
    await expect(panel.getByTestId('chat-template-menu')).toBeVisible()
    await expect(panel.getByTestId('chat-template-gallery')).toBeVisible()
    await expect(panel.getByTestId('chat-template-manage')).toBeVisible()
    await expect(panel.getByTestId('chat-ai-settings')).toHaveCount(0)
    await expect(panel.getByText('直接提問即可，AI 會依問題自行查詢目前病人的 FHIR 醫療資料')).toBeVisible()
    await expect(panel.getByText('不需要貼上或手動帶入系統內已有的病歷；只有系統外的新資訊，才需要直接補充在對話中。')).toBeVisible()
    await expect(panel.getByRole('button', { name: '傳送' })).toBeVisible()
  })

  test('routes locked personal-key models to AI settings', async ({ page }) => {
    await importBundle(page)
    await openChatInput(page)

    const panel = chatPanel(page)
    await panel.getByTestId('model-picker-trigger').click()
    const keyLink = page.getByTestId('model-picker-key-link-gpt-5.6-luna')
    await expect(keyLink).toContainText('設定金鑰')
    await expect(keyLink).toHaveAccessibleName('GPT-5.6 Luna，設定金鑰')
    await expect(page.getByTestId('model-picker-key-lock-gpt-5.6-luna')).toBeVisible()
    await keyLink.click()

    await expect(page.getByRole('tab', { name: '設定' })).toHaveAttribute('data-state', 'active')
  })
})
