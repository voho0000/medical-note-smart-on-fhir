import path from 'node:path'
import fs from 'node:fs'
import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel } from '../fixtures/import'

const bundlePath = path.join(__dirname, '../fixtures/hospital-cdss-bundle.json')

async function openCdss(page: import('@playwright/test').Page) {
  await openFeaturePanel(page)
  await page.getByRole('tab', { name: '設定', exact: true }).click()
  await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
  const beta = page.getByRole('switch', { name: '開啟 Beta 功能', exact: true })
  if (!(await beta.isChecked())) await beta.click()
  await page.getByRole('tab', { name: /個人化照護指引/ }).click()
  await expect(page.getByTestId('cdss-disease-switch')).toBeVisible()
  await page.getByRole('button', { name: '三區塊', exact: true }).click()
}

async function openMedicationSafety(page: import('@playwright/test').Page) {
  await page.locator('summary').filter({ has: page.getByRole('heading', { name: /^治療/ }) }).click()
  await page.getByTestId('cdss-section-module-heart-failure-medication-safety').locator('summary').first().click()
}

test('hospital ingredients reach CDSS with provenance and unknown use instead of a false negative', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T04:00:00Z'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await importBundle(page, { bundlePath })
  await openCdss(page)
  const review = page.getByTestId('cdss-hospital-medication-review')
  await expect(review).toContainText('3 筆院內處方，目前使用待確認')
  await review.getByText('查看成分與原始處方', { exact: true }).click()
  await expect(review.getByText('Diclofenac sodium', { exact: true })).toBeVisible()
  await expect(review.getByText('Furosemide', { exact: true })).toBeVisible()
  await expect(review.getByText('成分未確認', { exact: true })).toBeVisible()
  await expect(review.getByRole('link', { name: '對照來源' })).toHaveAttribute('href', /licId=01044041/)
  await expect(review.getByTestId('cdss-hospital-medication-evidence')).toHaveCount(3)
  await openMedicationSafety(page)
  const row = page.getByTestId('cdss-evidence-row-hf-harm:nsaid')
  await expect(row).toContainText('目前使用待確認：Diclofenac sodium')
  await expect(row).not.toContainText('目前處方未見')
  await expect(page.getByTestId('cdss-section-module-heart-failure-medication-safety')).toContainText('需先補資料')
  await page.screenshot({ path: test.info().outputPath('hospital-cdss-pending.png') })
})

test('a confirmed medication statement activates the existing ingredient rule after re-import; pending sources reflow', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T04:00:00Z'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await importBundle(page, { bundlePath })
  await openCdss(page)
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
  const resource = bundle.entry.find((entry: { resource: { id: string } }) => entry.resource.id === 'fictional-meitifen').resource
  resource.resourceType = 'MedicationStatement'
  resource.effectiveDateTime = '2026-09-30'
  delete resource.dispenseRequest
  delete resource.authoredOn
  await page.getByTestId('import-bundle-input').first().setInputFiles({ name: 'fictional-confirmed-medication.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
  const review = page.getByTestId('cdss-hospital-medication-review')
  await expect(review).toContainText('2 筆院內處方，目前使用待確認')
  await openMedicationSafety(page)
  await expect(page.getByTestId('cdss-evidence-row-hf-harm:nsaid')).toContainText('Diclofenac sodium')
  await expect(page.getByTestId('cdss-evidence-row-hf-harm:nsaid')).not.toContainText('目前使用待確認')
  await expect(page.getByTestId('cdss-section-module-heart-failure-medication-safety')).toContainText('優先安全處理')
  await review.getByText('查看成分與原始處方', { exact: true }).click()
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openFeaturePanel(page)
    await page.getByRole('tab', { name: /個人化照護指引/ }).click()
    await expect(review).toBeVisible()
    expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`hospital-cdss-${width}.png`) })
  }
})
