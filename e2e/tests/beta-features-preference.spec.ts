import { test, expect } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

test('Beta settings explain account persistence and retain guest choices across reloads', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await importBundle(page)
  const openSettings = async () => {
    await page.getByRole('tab', { name: '設定', exact: true }).click()
    await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
  }
  await openSettings()
  const toggle = page.getByRole('switch', { name: '開啟 Beta 功能', exact: true })
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('#beta-features-description')).toContainText('登入後設定隨帳號保存')
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.reload()
  await openSettings()
  await expect(toggle).toBeChecked()
  await toggle.click()
  await page.reload()
  await openSettings()
  await expect(toggle).not.toBeChecked()
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    if (width < 768) await page.getByRole('button', { name: '功能', exact: true }).click()
    await expect(toggle).toBeVisible()
    await expect(page.locator('#beta-features-description')).toBeVisible()
    await expect(toggle).not.toBeChecked()
    await page.screenshot({ path: testInfo.outputPath(`beta-settings-${width}.png`) })
  }
})
