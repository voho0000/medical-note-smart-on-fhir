import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel, SYNTHETIC_BUNDLE } from '../fixtures/import'

// Run only with playwright.fhir.config.ts against the real local FHIR stack.
test('App saves and retrieves a synthetic snapshot through the independent FHIR API without a Gateway', async ({ page, context }, info) => {
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
  if (process.env.FHIR_E2E_AUTH_MODE === 'firebase') {
    if (!process.env.FHIR_E2E_FIREBASE_STATE) throw new Error('Private synthetic Firebase test state required')
    const credential = JSON.parse(readFileSync(process.env.FHIR_E2E_FIREBASE_STATE, 'utf8'))
    await context.route('**/identitytoolkit.googleapis.com/**', async route => {
      const url = route.request().url()
      if (url.includes('accounts:signInWithPassword')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        localId: credential.uid, email: 'collaborator@synthetic.invalid', displayName: 'Synthetic CDSS',
        idToken: credential.token, refreshToken: 'synthetic-refresh-token', expiresIn: '3600', registered: true,
      }) })
      if (url.includes('accounts:lookup') && route.request().postDataJSON()?.idToken === credential.token)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ users: [{ localId: credential.uid,
          email: 'collaborator@synthetic.invalid', emailVerified: true, displayName: 'Synthetic CDSS',
          providerUserInfo: [{ providerId: 'password', email: 'collaborator@synthetic.invalid' }], validSince: '0' }] }) })
      await route.fallback() // Existing anonymous/offline fixtures block all production calls.
    })
  }
  await importBundle(page, { bundlePath: path })
  if (process.env.FHIR_E2E_AUTH_MODE === 'firebase') {
    await page.getByRole('button', { name: '訪客', exact: true }).click()
    await page.getByRole('menuitem', { name: '登入解鎖更多免費額度' }).click()
    const login = page.getByRole('dialog', { name: '登入', exact: true })
    await expect(login).toBeVisible()
    await login.locator('#email').fill('collaborator@synthetic.invalid')
    await login.locator('#password').fill('synthetic-test-password')
    await login.getByRole('button', { name: '登入', exact: true }).click()
    await expect(login).not.toBeVisible()
  }
  await page.evaluate(() => window.history.replaceState({}, '', '/?site=vghtpe'))
  await openFeaturePanel(page)
  await page.getByRole('tab', { name: '設定', exact: true }).click()
  await page.getByRole('tab', { name: '顯示與關於', exact: true }).click()
  const beta = page.getByRole('switch', { name: '開啟 Beta 功能', exact: true })
  if (!(await beta.isChecked())) await beta.click()
  await page.getByRole('tab', { name: /個人化照護指引/ }).click()
  const save = page.getByTestId('cdss-save-record')
  await expect(save).toBeVisible()
  if (process.env.FHIR_E2E_AUTH_MODE === 'firebase') await expect(page.getByTestId('cdss-fhir-authorize')).toHaveCount(0)
  expect(writes).toHaveLength(0)
  if (process.env.FHIR_E2E_AUTH_MODE === 'oauth2') {
    const secretsPath = process.env.FHIR_E2E_SECRETS_FILE
    if (!secretsPath) throw new Error('Private local OAuth test configuration required')
    const credentials = JSON.parse(readFileSync(secretsPath, 'utf8'))
    const popupEvent = page.waitForEvent('popup')
    await page.getByTestId('cdss-fhir-authorize').click()
    const popup = await popupEvent
    await popup.locator('#username').fill('fhir-test-user')
    await popup.locator('#password').fill(credentials.testUser)
    await popup.locator('#kc-login').click()
    await expect(page.getByTestId('cdss-fhir-authorize')).toHaveText('斷開 FHIR 授權')
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 })
      await openFeaturePanel(page)
      await page.getByRole('tab', { name: /個人化照護指引/ }).click()
      const control = page.getByTestId('cdss-fhir-authorize')
      await expect(control).toBeVisible()
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: info.outputPath(`fhir-authorized-${width}.png`) })
    }
  }
  const stored = page.waitForResponse(response => response.url().endsWith('/cdss/v1/saves') && response.request().method() === 'POST')
  await save.click()
  const saveResponse = await stored
  expect(saveResponse.status()).toBe(201)
  expect(new URL(saveResponse.url()).port).toBe(process.env.FHIR_E2E_AUTH_MODE === 'firebase' ? '28096' : process.env.FHIR_E2E_AUTH_MODE === 'oauth2' ? '8098' : '28098')
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
  if (process.env.FHIR_E2E_AUTH_MODE === 'oauth2') {
    await openFeaturePanel(page)
    await page.getByRole('tab', { name: /個人化照護指引/ }).click()
    await page.getByTestId('cdss-fhir-authorize').click()
    await expect(page.getByTestId('cdss-fhir-authorize')).toHaveText('登入 FHIR 授權')
    await save.click()
    await expect(page.getByText('紀錄未儲存，請稍後重試。')).toBeVisible()
    expect(writes).toHaveLength(1)
  }
})
