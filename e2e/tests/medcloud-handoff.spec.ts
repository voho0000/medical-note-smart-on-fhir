import { test, expect } from '../fixtures/test'
import {
  prepareMedcloudHandoffPage,
  readMedcloudHandoffProbe,
  startMedcloudHandoff,
} from '../fixtures/medcloud-handoff'

test('imports patient data when Cloud Wildcatch sends it at the first stable handoff input', async ({ page }) => {
  await prepareMedcloudHandoffPage(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await startMedcloudHandoff(page)

  await expect.poll(async () => (await readMedcloudHandoffProbe(page))?.settled, {
    timeout: 20_000,
  }).toBe(true)

  const probe = await readMedcloudHandoffProbe(page)
  expect(probe).toMatchObject({
    changeDispatched: true,
    error: null,
    inputStillConnectedAtSettle: true,
    inputWasPresentAtStart: false,
    settled: true,
  })
  expect(probe?.inputFoundAtMs).toBeGreaterThan(0)

  await expect(page.getByText('王小明').first()).toBeAttached({ timeout: 20_000 })
  await expect(page.locator('[data-slot="clinical-patient-context"]').first()).toContainText('王小明')
})
