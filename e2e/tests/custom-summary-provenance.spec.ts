import { test, expect } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

test.describe('custom summary generation provenance', () => {
  test('shows per-module model, completion time and duration with responsive wrapping', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('api_key_storage_type', 'sessionStorage')
      sessionStorage.setItem('gemini_api_key', 'e2e-gemini-key')
    })
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: '### 重要變化摘要\n\n- **2018/02/12：**肌酸酐 1.6 mg/dL\n- 已完成自訂摘要測試。' }],
            },
          }],
        }),
      })
    })
    await importBundle(page)

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    const customTab = summaryPanel.getByRole('tab', { name: '自訂摘要' })
    await customTab.click()
    const summaryModule = summaryPanel.locator('article').filter({
      has: page.getByRole('heading', { name: '變化摘要' }),
    })
    const generate = summaryModule.getByRole('button', { name: '產生', exact: true })
    await expect(generate).toBeEnabled({ timeout: 20_000 })
    await generate.click()

    const meta = summaryModule.getByTestId('custom-insight-generation-meta')
    await expect(meta).toContainText('產生中')
    await expect(customTab.locator('.animate-spin')).toHaveCount(0)
    await expect(summaryModule.locator('.animate-spin')).toHaveCount(1)
    await expect(summaryModule.locator('.animate-pulse')).toHaveCount(0)
    await expect(summaryModule.getByRole('button', { name: '重跑', exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(meta).toContainText('Gemini 3 Flash Preview')
    await expect(meta).toContainText(/\d{4}.+\d{2}:\d{2}/)
    await expect(meta).not.toContainText('產生於')
    await expect(meta).toContainText('耗時 00:01')
    await expect(summaryModule.locator('strong')).toContainText('2018/02/12')
    await expect(summaryModule).not.toContainText('**2018/02/12')
    await expect(meta).toHaveAttribute(
      'aria-label',
      /由 Gemini 3 Flash Preview 於 .+產生，總耗時 00:01/,
    )

    // The picker controls only the next generation. The current artifact and
    // its immutable provenance stay visible across a model round trip.
    const modelPicker = summaryPanel.getByTestId('model-picker-trigger')
    await modelPicker.click()
    await page.getByRole('menuitem', { name: /Gemini 3\.1 Flash-Lite/ }).click()
    await expect(modelPicker).toContainText('Gemini 3.1 Flash-Lite')
    await expect(summaryModule).toContainText('已完成自訂摘要測試。')
    await expect(meta).toContainText('Gemini 3 Flash Preview')

    const collapseResult = summaryModule.getByRole('button', { name: '收合「變化摘要」摘要結果' })
    await expect(collapseResult).toHaveAttribute('aria-expanded', 'true')
    const headerToggleBox = await collapseResult.boundingBox()
    const moduleBox = await summaryModule.boundingBox()
    const headerBackground = await collapseResult.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor,
    )
    expect(headerToggleBox).not.toBeNull()
    expect(moduleBox).not.toBeNull()
    expect(headerBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(headerToggleBox!.width).toBeGreaterThan(moduleBox!.width * 0.8)
    await collapseResult.click({ position: { x: 12, y: 12 } })
    const expandResult = summaryModule.getByRole('button', { name: '展開「變化摘要」摘要結果' })
    const collapsedPreview = summaryModule.getByTestId('custom-insight-preview-changes')
    await expect(expandResult).toHaveAttribute('aria-expanded', 'false')
    await expect(collapsedPreview).toBeVisible()
    await expect(collapsedPreview).toContainText('已完成自訂摘要測試。')
    await expect(collapsedPreview).not.toContainText('**')
    await expect(collapsedPreview).toHaveCSS('-webkit-line-clamp', '3')
    await expect(summaryModule.getByRole('heading', { name: '重要變化摘要', exact: true })).toBeHidden()
    await expect(meta).toBeVisible()
    await expect(summaryModule.getByRole('button', { name: '編輯模板' })).toBeVisible()
    await expandResult.click({ position: { x: 12, y: 12 } })
    await expect(collapsedPreview).toBeHidden()
    await expect(summaryModule.getByText('已完成自訂摘要測試。')).toBeVisible()

    await modelPicker.click()
    await page.getByRole('menuitem', { name: /Gemini 3 Flash Preview/ }).click()
    await expect(modelPicker).toContainText('Gemini 3 Flash Preview')
    await expect(summaryModule).toContainText('已完成自訂摘要測試。')
    await expect(meta).toContainText('Gemini 3 Flash Preview')

    await page.setViewportSize({ width: 1440, height: 900 })
    const wideMetaBox = await meta.boundingBox()
    const wideEditBox = await summaryModule.getByRole('button', { name: '編輯模板' }).boundingBox()
    expect(wideMetaBox).not.toBeNull()
    expect(wideEditBox).not.toBeNull()
    expect(Math.abs(wideMetaBox!.y - wideEditBox!.y)).toBeLessThan(8)
    expect(await summaryModule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(meta).toBeVisible()
      const narrowDesktopMetaBox = await meta.boundingBox()
      const narrowDesktopEditBox = await summaryModule.getByRole('button', { name: '編輯模板' }).boundingBox()
      expect(narrowDesktopMetaBox).not.toBeNull()
      expect(narrowDesktopEditBox).not.toBeNull()
      expect(narrowDesktopMetaBox!.y).toBeGreaterThan(narrowDesktopEditBox!.y)
      expect(await summaryModule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }

    await page.setViewportSize({ width: 430, height: 844 })
    await page.getByRole('button', { name: '功能', exact: true }).click()
    await expect(meta).toBeVisible()
    for (const width of [430, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const mobileMetaBox = await meta.boundingBox()
      const mobileEditBox = await summaryModule.getByRole('button', { name: '編輯模板' }).boundingBox()
      expect(mobileMetaBox).not.toBeNull()
      expect(mobileEditBox).not.toBeNull()
      expect(mobileMetaBox!.y).toBeGreaterThan(mobileEditBox!.y)
      expect(await summaryModule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }

    await page.setViewportSize({ width: 320, height: 760 })
    await expect(meta).toBeVisible()
    const mobileCollapse = summaryModule.getByRole('button', { name: '收合「變化摘要」摘要結果' })
    const mobileCollapseBox = await mobileCollapse.boundingBox()
    expect(mobileCollapseBox).not.toBeNull()
    expect(mobileCollapseBox!.width).toBeGreaterThanOrEqual(43)
    expect(mobileCollapseBox!.height).toBeGreaterThanOrEqual(43)
    await mobileCollapse.click({ position: { x: 12, y: 12 } })
    await expect(collapsedPreview).toBeVisible()
    await expect(collapsedPreview).toHaveCSS('-webkit-line-clamp', '3')
    await expect(meta).toBeVisible()
    await summaryModule
      .getByRole('button', { name: '展開「變化摘要」摘要結果' })
      .click({ position: { x: 12, y: 12 } })
    await expect(summaryModule.getByText('已完成自訂摘要測試。')).toBeVisible()
    const modelBox = await meta.getByText('Gemini 3 Flash Preview').boundingBox()
    const timeBox = await meta.locator('time').boundingBox()
    const durationBox = await meta.getByText('耗時 00:01').boundingBox()
    expect(modelBox).not.toBeNull()
    expect(timeBox).not.toBeNull()
    expect(durationBox).not.toBeNull()
    expect(timeBox!.y).toBeGreaterThan(modelBox!.y)
    expect(Math.abs(durationBox!.y - timeBox!.y)).toBeLessThan(8)
    expect(await meta.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
})
