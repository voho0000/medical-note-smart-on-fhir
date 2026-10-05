import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel, SYNTHETIC_BUNDLE } from '../fixtures/import'

// Use a server built with NEXT_PUBLIC_CDSS_ADMISSION=intranet-pilot.
// Responses are intercepted locally; no FHIR server or real patient data is used.
for (const [entry, width] of [
  ['expanded', 1440], ['url', 320], ['url', 390], ['url', 430],
  ['url', 1440],
] as const) {
  test(`CDSS saves from the ${entry} full-window header at ${width}px`, async ({ page }, info) => {
    test.skip(!['intranet', 'intranet-pilot'].includes(process.env.NEXT_PUBLIC_CDSS_ADMISSION ?? ''), 'Requires the explicit intranet admission test profile')
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 })
    const fixture = JSON.parse(readFileSync(SYNTHETIC_BUNDLE, 'utf8'))
    const patient = fixture.entry.find((entry: { resource: { resourceType: string } }) => entry.resource.resourceType === 'Patient').resource
    patient.identifier = [{ system: 'https://synthetic.invalid/national-id', value: 'A123XXXXXX' }]
    const bundlePath = info.outputPath('synthetic-bundle.json')
    writeFileSync(bundlePath, JSON.stringify(fixture))
    await importBundle(page, { bundlePath })
    await openFeaturePanel(page)
    await page.getByRole('tab', { name: '設定', exact: true }).click()
    await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
    const beta = page.getByRole('switch', { name: '開啟 Beta 功能', exact: true })
    if (!(await beta.isChecked())) await beta.click()
    if (entry === 'url') {
      await page.goto('/?site=vghtpe&visit=book')
      await openFeaturePanel(page)
    } else {
      await page.evaluate(() => {
        window.history.replaceState({}, '', '/?site=vghtpe')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
    }
    if (!(await page.getByTestId('cdss-visit-book').isVisible())) {
      await page.getByRole('tab', { name: /個人化照護指引/ }).click()
    }
    if (entry === 'expanded') {
      await expect(page.getByTestId('cdss-save-record')).toBeVisible()
      await page.getByRole('button', { name: '決策地圖 v2', exact: true }).click()
      await page.getByTestId('cdss-book-expand').click()
    }
    const book = page.getByTestId('cdss-visit-book')
    const save = book.getByTestId('cdss-save-record')
    await expect(save).toBeVisible()
    await expect(save).toHaveText('儲存 CDSS 紀錄')
    await expect(page.getByTestId('cdss-save-record')).toHaveCount(1)
    expect(await save.evaluate(button => {
      const rect = button.getBoundingClientRect()
      return !button.closest('[inert]') && rect.left >= 0 && rect.right <= window.innerWidth && rect.height >= 44
        && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button
    })).toBe(true)
    await page.screenshot({ path: info.outputPath('cdss-save.png') })
    let saveCount = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/cdss/v1/saves', async route => {
      const body = route.request().postDataJSON() as { save_id: string; result: { packId: string } }
      expect(body.result.packId).toBeTruthy()
      saveCount += 1
      await pending
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'stored', save_id: body.save_id }) })
    })
    expect(saveCount).toBe(0)
    await save.click()
    await expect.poll(() => saveCount).toBe(1)
    await expect(save).toBeDisabled()
    await expect(save).toHaveAttribute('aria-busy', 'true')
    await expect(save).toHaveText('儲存中…')
    if (entry === 'expanded') {
      await book.getByTestId('cdss-book-collapse').click()
      await expect(page.getByTestId('cdss-save-record')).toBeVisible()
      await expect(page.getByTestId('cdss-save-record')).toBeDisabled()
    }
    release()
    await expect(page.getByText('CDSS 紀錄已儲存。')).toBeVisible()
    await expect(page.getByTestId('cdss-save-record')).toBeEnabled()
    expect(saveCount).toBe(1)
  })
}
