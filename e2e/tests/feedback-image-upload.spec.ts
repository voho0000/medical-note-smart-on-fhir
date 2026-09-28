import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel } from '../fixtures/import'

test('previews and removes a feedback screenshot across supported widths', async ({ page }, testInfo) => {
  // Load at the narrowest supported width so the app's compact root font and
  // touch-target rules are exercised from first render, not only after resize.
  await page.setViewportSize({ width: 320, height: 900 })
  await importBundle(page)
  const toastClose = page.locator('[data-sonner-toast] button').first()
  if (await toastClose.isVisible().catch(() => false)) await toastClose.click()
  await openFeaturePanel(page)
  await page.getByRole('tab', { name: '設定', exact: true }).click()
  await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
  const validScreenshot = await page.screenshot()
  await page.getByRole('button', { name: '開啟回報表單', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: '問題回報' })
  const email = dialog.getByLabel('您的電子郵件')
  await email.fill('codex-e2e-test@example.com')
  await expect(email).toHaveValue('codex-e2e-test@example.com')
  await dialog.getByRole('combobox', { name: '問題類型' }).click()
  await page.getByRole('option', { name: 'AI 回答或臨床解讀問題' }).click()
  await expect(dialog.getByRole('combobox', { name: '問題類型' }))
    .toContainText('AI 回答或臨床解讀問題')
  await expect(dialog.getByPlaceholder(
    '請指出哪一段回答有問題、原本預期的內容；如有參考依據也請一併提供…',
  )).toBeVisible()
  await expect(dialog.getByText(/可說明內容錯誤、遺漏、與原始資料不一致或引用依據有誤/))
    .toBeVisible()
  await dialog.getByRole('combobox', { name: '影響程度' }).click()
  await page.getByRole('option', { name: '疑似病安或隱私事件' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByText(/院內正式通報|緊急處理流程/)).toHaveCount(0)
  const imageInput = dialog.locator('input[type="file"]')
  const chooseImages = dialog.getByRole('button', { name: '選擇圖片', exact: true })
  await chooseImages.scrollIntoViewIfNeeded()
  await imageInput.setInputFiles({
    name: 'feedback-sample.png',
    mimeType: 'image/png',
    buffer: validScreenshot,
  })

  await expect(dialog.getByText('已選 1 / 3 張')).toBeVisible()
  const preview = dialog.getByRole('img', { name: '附加圖片 1' })
  await preview.scrollIntoViewIfNeeded()
  await expect(preview).toBeInViewport()
  await expect(dialog.getByText('feedback-sample.png')).toBeVisible()
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await page.waitForTimeout(250)

  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(50)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '傳送', exact: true })).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: '問題類型' }))
      .toContainText('AI 回答或臨床解讀問題')

    if (width <= 430) {
      const sendBox = await dialog.getByRole('button', { name: '傳送', exact: true }).boundingBox()
      const closeBox = await dialog.getByRole('button', { name: '關閉問題回報' }).boundingBox()
      expect(sendBox?.height).toBeGreaterThanOrEqual(44)
      expect(closeBox?.height).toBeGreaterThanOrEqual(44)
    }

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width)

    await page.screenshot({ path: testInfo.outputPath(`feedback-image-${width}.png`) })
  }

  await dialog.getByRole('button', { name: '移除圖片 1' }).click()
  await expect(dialog.getByText('已選 0 / 3 張')).toBeVisible()
  await expect(dialog.getByText('feedback-sample.png')).toHaveCount(0)

  await dialog.getByRole('button', { name: '關閉問題回報' }).click()
  await page.getByRole('button', { name: '暗色', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: '開啟回報表單', exact: true }).click()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'feedback-sample.png',
    mimeType: 'image/png',
    buffer: validScreenshot,
  })
  await expect(dialog.getByText('已選 1 / 3 張')).toBeVisible()
  await page.waitForTimeout(250)

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(50)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '傳送', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`feedback-image-dark-${width}.png`) })
  }

})
