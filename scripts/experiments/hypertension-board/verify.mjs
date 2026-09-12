import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const url = process.env.HTN_PREVIEW_URL ?? 'http://localhost:3018/dev-htn-preview'
const output = resolve(process.env.HTN_REVIEW_OUTPUT ?? 'scripts/experiments/hypertension-board/results')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const results = []
async function noOverflow(label) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(size.scroll <= size.width + 2, `${label}: ${JSON.stringify(size)}`)
}
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.getByTestId('cdss-htn-board').waitFor()
  for (const patient of ['resistant-osa', 'ckd-albuminuria']) {
    await page.getByLabel('合成病例').selectOption(patient)
    for (const width of [320, 390, 430, 640, 768, 880, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await noOverflow(`${patient}-${width}`)
      await page.screenshot({ animations: 'disabled', path: resolve(output, `${patient}-${width}.png`) })
      results.push({ patient, width, theme: 'light', overflow: false })
    }
    // Every consumed module opens its original decision detail.
    const rows = page.locator('[data-testid^="cdss-htn-module-"] > button')
    for (const row of await rows.all()) {
      await row.click()
      await expect(row).toHaveAttribute('aria-expanded', 'true')
      await noOverflow(`${patient}-detail`)
      await row.click()
    }
  }
  // The clinical state changes only after both BP numbers are applied.
  await page.getByRole('button', { name: '輸入門診血壓' }).click()
  await page.getByTestId('cdss-htn-clinic-vitals-systolic').fill('190')
  assert.equal(await page.getByTestId('cdss-htn-clinic-vitals-save').isDisabled(), true)
  await page.getByTestId('cdss-htn-clinic-vitals-diastolic').fill('124')
  await page.getByTestId('cdss-htn-clinic-vitals-save').click()
  await page.getByTestId('cdss-htn-module-hypertension-severe-safety').waitFor()
  assert.match(await page.getByTestId('cdss-htn-metric-bloodPressure').innerText(), /190\/124/)
  await page.getByRole('button', { name: '前往處理', exact: true }).click()
  await expect(page.locator('#cdss-trigger-hypertension-severe-safety')).toHaveAttribute('aria-expanded', 'true')
  await page.screenshot({ animations: 'disabled', path: resolve(output, 'severe-bp-detail.png') })
  await page.getByRole('button', { name: '輸入門診血壓' }).click()
  await page.getByTestId('cdss-htn-clinic-vitals-clear').click()
  await page.getByTestId('cdss-htn-module-hypertension-severe-safety').waitFor({ state: 'detached' })
  // Known evidence can be excluded; the rule's status/title must recompute.
  const threshold = page.getByTestId('cdss-recommendation-trigger-hypertension-treatment-threshold')
  const before = await threshold.innerText()
  await threshold.click()
  await page.getByTestId('cdss-evidence-switch-htn-threshold:ckd').click()
  await expect(threshold).not.toHaveText(before)
  await page.getByTestId('cdss-evidence-switch-htn-threshold:ckd').click()
  await threshold.click()
  // Both the standalone calculator and this embedded panel use one definition.
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.getByTestId('htn-open-prevent-cvd').click()
  const riskInputs = { age:'65', sex:'male', sbp:'134', tc:'200', hdl:'40', egfr:'75', bmi:'28', smoking:'yes', diabetes:'no', cvd:'no', bpTreatment:'no', statin:'no' }
  for (const [key,value] of Object.entries(riskInputs)) {
    const input=page.getByTestId(`risk-input-${key}`)
    if (['sex','smoking','diabetes','cvd','bpTreatment','statin'].includes(key)) await input.selectOption(value)
    else await input.fill(value)
  }
  await expect(page.getByTestId('risk-apply')).toBeDisabled()
  await page.getByTestId('risk-confirm').check()
  await page.getByTestId('risk-apply').click()
  await expect(page.getByRole('status')).toContainText('已引用')
  await noOverflow('calculator-390')
  await page.getByTestId('cvd-risk-calculator').screenshot({animations:'disabled',path:resolve(output,'calculator-390.png')})
  await page.getByTestId('cvd-risk-calculator').getByRole('button',{name:'返回',exact:true}).click()
  await expect(page.getByTestId('htn-risk-prevent-cvd')).toContainText('%')
  await page.getByLabel('合成病例').selectOption('resistant-osa')
  await expect(page.getByTestId('htn-risk-prevent-cvd')).toContainText('尚未引用')
  await page.getByLabel('合成病例').selectOption('ckd-albuminuria')
  await expect(page.getByTestId('htn-risk-prevent-cvd')).toContainText('%')
  await page.getByRole('button', {name:'輸入門診血壓'}).click()
  await page.getByTestId('cdss-htn-clinic-vitals-systolic').fill('135')
  await page.getByTestId('cdss-htn-clinic-vitals-diastolic').fill('85')
  await page.getByTestId('cdss-htn-clinic-vitals-save').click()
  await expect(page.getByTestId('htn-risk-prevent-cvd')).toContainText('需重新引用')
  await page.getByTestId('htn-risk-prevent-cvd').getByRole('button',{name:'取消引用'}).click()
  await page.getByRole('button', { name: '中文 / English' }).click()
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow('english-390')
  await page.screenshot({ animations: 'disabled', path: resolve(output, 'english-390.png') })
  await page.getByRole('button', { name: '明／暗' }).click()
  await expect.poll(() => page.locator('[data-testid^="cdss-htn-module-"] > button').first().evaluate(el => getComputedStyle(el).color === getComputedStyle(el.parentElement).color)).toBe(true)
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    await noOverflow(`dark-${width}`)
    await page.screenshot({ animations: 'disabled', path: resolve(output, `dark-${width}.png`) })
  }
  assert.deepEqual(errors, [])
  writeFileSync(resolve(output, 'checks.json'), JSON.stringify({ url, results, interactionChecks: ['BP pair validation', 'severe safety first', 'clear BP', 'evidence recomputation', 'all board disclosures', 'English', 'dark theme', 'calculator confirmation and apply', 'calculator patient isolation', 'calculator invalidation after BP change'], pageErrors: errors }, null, 2))
  console.log(`Verified ${results.length} case/width combinations and 10 interaction checks. ${output}`)
} finally {
  await browser.close()
}
