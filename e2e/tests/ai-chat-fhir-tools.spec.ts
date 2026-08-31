import { test, expect } from '../fixtures/test'
import { chatPanel, importBundle, openChatInput } from '../fixtures/import'
import {
  AGENT_TOOL_E2E_MARKER,
  agentToolRequestBodies,
  agentToolRequestCount,
  mockAgentToolFlow,
  wasAgentToolResultVerified,
} from '../fixtures/mock-agent-tool-flow'

test.describe('AI chat FHIR tool loop', () => {
  test('queries real imported imaging data and returns it to the answer round', async ({ page }) => {
    await mockAgentToolFlow(page, {
      toolName: 'queryImagingRecords',
      input: { query: 'Chest X-ray' },
      expectedResultIncludes: [
        'Chest X-ray',
        'Mild cardiomegaly noted',
        'imageAttachmentCount',
      ],
      finalMarkdown: 'E2E_IMAGE_TOOL_OK：已取得胸部 X 光報告。',
    })
    await importBundle(page)

    const textarea = await openChatInput(page)
    await textarea.fill(`這位病人有 Chest X-ray 嗎？ ${AGENT_TOOL_E2E_MARKER}`)
    await page.getByRole('button', { name: '傳送' }).click()

    const reply = chatPanel(page).locator('.prose').last()
    await expect(reply).toContainText('E2E_IMAGE_TOOL_OK', { timeout: 30_000 })
    await expect.poll(() => agentToolRequestCount(page)).toBeGreaterThanOrEqual(2)
    expect(await wasAgentToolResultVerified(page)).toBe(true)
  })

  test('queries the complete tumor-marker category instead of one analyte', async ({ page }) => {
    await mockAgentToolFlow(page, {
      toolName: 'queryLabResultsByCategory',
      input: { category: 'tumor' },
      expectedResultIncludes: [
        'availableAnalytes',
        'AFP',
        'CEA',
        'CA-199',
        'PSA',
        '31.83',
      ],
      finalMarkdown: 'E2E_TUMOR_TOOL_OK：已取得完整腫瘤標記分類。',
    })
    await importBundle(page)

    const textarea = await openChatInput(page)
    await textarea.fill(`請列出所有腫瘤標記，不要只查單一項目。 ${AGENT_TOOL_E2E_MARKER}`)
    await page.getByRole('button', { name: '傳送' }).click()

    const reply = chatPanel(page).locator('.prose').last()
    await expect(reply).toContainText('E2E_TUMOR_TOOL_OK', { timeout: 30_000 })
    await expect.poll(() => agentToolRequestCount(page)).toBeGreaterThanOrEqual(2)
    expect(await wasAgentToolResultVerified(page)).toBe(true)
  })

  test('sends an English output contract when the UI locale is English', async ({ page }) => {
    await mockAgentToolFlow(page, {
      toolName: 'queryImagingRecords',
      input: { query: 'Chest X-ray' },
      expectedResultIncludes: ['Chest X-ray', 'Mild cardiomegaly noted'],
      finalMarkdown: 'E2E_ENGLISH_AGENT_OK: The chest X-ray report was retrieved.',
    })
    await importBundle(page, { locale: 'en' })

    const textarea = await openChatInput(page)
    await textarea.fill(`Does this patient have a Chest X-ray report? ${AGENT_TOOL_E2E_MARKER}`)
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const reply = chatPanel(page).locator('.prose').last()
    await expect(reply).toContainText('E2E_ENGLISH_AGENT_OK', { timeout: 30_000 })
    const requestBodies = await agentToolRequestBodies(page)
    expect(requestBodies[0]).toContain(
      'all explanatory prose, headings, table labels, and safety wording in English',
    )
    expect(requestBodies[0]).not.toContain('Taiwanese Traditional Chinese')
    expect(requestBodies[0]).not.toContain('資料未提供正常／異常判定')
  })
})
