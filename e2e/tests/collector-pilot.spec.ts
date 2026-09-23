import { test, expect } from '../fixtures/test'
import { importBundle, openChatInput, chatPanel, SYNTHETIC_BUNDLE } from '../fixtures/import'
import { mockAiStream, STREAM_PROBE_MARKER } from '../fixtures/mock-stream'
import { collectorEventV5Schema } from '../../src/shared/contracts/collector-event'

// Real browser/app, synthetic chart and AI; collector HTTP is intercepted.
// This is not a claim that the hospital TLS/private-network path is validated.
test('site gate and offline collector leave chat operational, with no clinical text in telemetry', async ({ page }) => {
  test.setTimeout(90_000)
  const payloads: unknown[] = []
  let offline = false
  await page.route('**/collector/v1/events', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': 'http://localhost:3001',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      } })
      return
    }
    payloads.push(route.request().postDataJSON())
    if (offline) await route.abort('connectionrefused')
    else await route.fulfill({ status: 201, contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:3001' }, body: '{}' })
  })
  await mockAiStream(page, { model: 'gpt-5.4-nano', markdown: 'SYNTHETIC-COLLECTOR-ANSWER', delayMs: 2,
    replies: [
      { includes: 'OTHER-SITE', markdown: 'SYNTHETIC-OTHER-SITE-ANSWER' },
      { includes: 'SECOND-PRIVATE-PROMPT', markdown: 'SYNTHETIC-OFFLINE-ANSWER' },
    ],
  })
  await importBundle(page, { bundlePath: SYNTHETIC_BUNDLE })
  const textarea = await openChatInput(page)
  await page.waitForFunction(() => Boolean(window.mediprismaCollector))
  expect(await page.evaluate(() => window.mediprismaCollector!.status().enabled)).toBe(false)

  await page.evaluate(() => history.replaceState({}, '', '/?site=vghtpe'))
  expect(await page.evaluate(() => window.mediprismaCollector!.status().enabled)).toBe(true)
  await textarea.fill(`SYNTHETIC-PRIVATE-PROMPT ${STREAM_PROBE_MARKER}`)
  await page.getByRole('button', { name: '傳送', exact: true }).click()
  await expect(chatPanel(page).locator('.prose').last()).toContainText('SYNTHETIC-COLLECTOR-ANSWER', { timeout: 25_000 })
  await expect.poll(() => payloads.length).toBeGreaterThan(0)
  for (const payload of payloads) {
    expect(collectorEventV5Schema.safeParse(payload).success).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/SYNTHETIC-PRIVATE-PROMPT|SYNTHETIC-COLLECTOR-ANSWER|王小明|patientId|operationKey/)
  }

  offline = true
  const beforeOffline = payloads.length
  await textarea.fill(`SECOND-PRIVATE-PROMPT ${STREAM_PROBE_MARKER}`)
  await page.getByRole('button', { name: '傳送', exact: true }).click()
  await expect.poll(() => payloads.length).toBeGreaterThan(beforeOffline)
  await expect(chatPanel(page).locator('.prose').last()).toContainText('SYNTHETIC-OFFLINE-ANSWER')
  await expect(page.getByRole('button', { name: '傳送', exact: true })).toBeVisible()

  await page.evaluate(() => history.replaceState({}, '', '/?site=hmc'))
  const beforeOtherSite = payloads.length
  await textarea.fill(`OTHER-SITE ${STREAM_PROBE_MARKER}`)
  await page.getByRole('button', { name: '傳送', exact: true }).click()
  await expect(chatPanel(page).locator('.prose').last()).toContainText('SYNTHETIC-OTHER-SITE-ANSWER')
  await expect(page.getByRole('button', { name: '傳送', exact: true })).toBeVisible()
  expect(payloads.length).toBe(beforeOtherSite)
  expect(await page.evaluate(() => window.mediprismaCollector!.status().enabled)).toBe(false)
})
