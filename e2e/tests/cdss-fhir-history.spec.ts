import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel, SYNTHETIC_BUNDLE } from '../fixtures/import'

// Run only with playwright.fhir.config.ts against the real local FHIR stack.
test('App saves and retrieves a synthetic historical snapshot through the real Gateway and FHIR', async ({ page }, info) => {
  test.skip(info.project.name !== 'fhir-local', 'Requires the explicit local FHIR integration profile')
  test.setTimeout(180_000)
  const fixture = JSON.parse(readFileSync(SYNTHETIC_BUNDLE, 'utf8'))
  const patient = fixture.entry.find((entry: { resource: { resourceType: string } }) => entry.resource.resourceType === 'Patient').resource
  patient.name = [{ text: `王小明測試${randomUUID().slice(0, 8)}` }]
  patient.identifier = [{ system: 'https://synthetic.invalid/national-id', value: 'A123XXXXXX' }]
  const path = info.outputPath('synthetic-bundle.json')
  writeFileSync(path, JSON.stringify(fixture))
  await page.setViewportSize({ width: 1440, height: 900 })
  const writes: object[] = []
  page.on('request', request => { if (request.url().endsWith('/cdss/v1/saves')) writes.push(request.postDataJSON()) })
  await importBundle(page, { bundlePath: path })
  await page.evaluate(() => window.history.replaceState({}, '', '/?site=vghtpe'))
  await openFeaturePanel(page)
  await page.getByRole('tab', { name: '設定', exact: true }).click()
  await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
  const beta = page.getByRole('switch', { name: '開啟 Beta 功能', exact: true })
  if (!(await beta.isChecked())) await beta.click()
  await page.getByRole('tab', { name: /個人化照護指引/ }).click()
  const save = page.getByTestId('cdss-save-record')
  await expect(save).toBeVisible()
  expect(writes).toHaveLength(0)
  const stored = page.waitForResponse(response => response.url().endsWith('/cdss/v1/saves') && response.request().method() === 'POST')
  await save.click()
  expect((await stored).status()).toBe(201)
  await expect(page.getByText('CDSS 紀錄已儲存。')).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(JSON.stringify(writes[0])).not.toContain(patient.name[0].text)
  const listResponse = page.waitForResponse(response => response.url().endsWith('/cdss/v1/history') && response.request().method() === 'POST')
  await page.getByTestId('cdss-history-records').click()
  const history = await (await listResponse).json()
  expect(history.records).toHaveLength(1)
  const dialog = page.getByRole('dialog', { name: 'CDSS 歷史紀錄' })
  const detailResponse = page.waitForResponse(response => response.url().endsWith('/cdss/v1/history/read') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: new RegExp(history.records[0].packId) }).click()
  const detail = await (await detailResponse).json()
  expect(detail.save).toEqual(writes[0])
  expect(detail.versionId).toBe('1')
  await expect(dialog.getByText('歷史快照・醫師身分尚未驗證')).toBeVisible()
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`history-detail-${width}.png`) })
  }
  await page.setViewportSize({ width: 844, height: 390 })
  await page.screenshot({ path: info.outputPath('history-landscape.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(1)
})
