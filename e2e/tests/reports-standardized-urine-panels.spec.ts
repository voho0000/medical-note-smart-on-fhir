import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '../fixtures/test'
import { importBundle, SYNTHETIC_BUNDLE } from '../fixtures/import'

test('shares standardized names and splits the stacked urine report at every workspace width', async ({ page }, testInfo) => {
  test.slow()
  const directory = mkdtempSync(path.join(tmpdir(), 'mediprisma-urine-panels-'))
  const bundlePath = path.join(directory, 'synthetic-bundle.json')
  const bundle = JSON.parse(readFileSync(SYNTHETIC_BUNDLE, 'utf8'))
  const patient = bundle.entry.find((entry: any) => entry.resource?.resourceType === 'Patient').resource
  const tests = [
    { id: 'mg', text: '鎂', loinc: '2601-3', unit: 'mEq/L', specimen: 'Blood' },
    { id: 'finger', text: 'FINGER SUGAR', loinc: '1558-6', unit: 'mg/dL', specimen: 'Blood' },
    { id: 'color', text: '顏色', loinc: '5778-6', value: 'Yellow', specimen: 'Urine' },
    { id: 'protein', text: '尿蛋白', loinc: '20454-5', value: 'Negative', specimen: 'Urine' },
    { id: 'rbc', text: '尿紅血球', loinc: '5808-1', unit: '/HPF', specimen: 'Urine' },
    { id: 'acr', text: '白蛋白肌酸酐比', loinc: '14959-1', unit: 'mg/g', specimen: 'Urine' },
    { id: 'other', text: '其他尿液項目（測試）', value: 'Trace', specimen: 'Urine' },
  ]
  for (const entry of tests) {
    const observation = {
      resourceType: 'Observation', id: `panel-test-${entry.id}`, status: 'final',
      subject: { reference: `Patient/${patient.id}` },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { text: entry.text, coding: entry.loinc ? [{ system: 'http://loinc.org', code: entry.loinc }] : [] },
      effectiveDateTime: '2026-09-01T08:00:00+08:00',
      specimen: { display: entry.specimen },
      ...(entry.value ? { valueString: entry.value } : { valueQuantity: { value: 2, unit: entry.unit } }),
    }
    bundle.entry.push({ resource: observation })
    bundle.entry.push({ resource: {
      resourceType: 'DiagnosticReport', id: `panel-report-${entry.id}`, status: 'final',
      subject: observation.subject,
      category: [{ coding: [{ code: 'LAB' }] }],
      code: observation.code,
      effectiveDateTime: observation.effectiveDateTime,
      result: [{ reference: `Observation/${observation.id}` }],
    } })
  }
  writeFileSync(bundlePath, JSON.stringify(bundle))
  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await importBundle(page, { bundlePath })
    await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
    await page.getByRole('tab').filter({ hasText: /^檢驗/ }).first().click()
    const reportContent = page.getByTestId('clinical-tab-content-reports')
    // Search expands matching day groups so their individual result labels
    // can be compared with the cumulative column headers below.
    const search = page.getByPlaceholder(/搜尋檢驗/)
    await search.fill('鎂')
    await expect(reportContent.getByText('Mg', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await search.fill('FINGER')
    await expect(reportContent.getByText('Finger sugar', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await search.fill('')
    await page.getByRole('tab', { name: '累積報告', exact: true }).click()
    await expect(reportContent.locator('[data-lab-test-key="MG"]').first()).toContainText('Mg')
    await expect(reportContent.locator('[data-lab-test-key="GLUCOSE-FS"]').first()).toContainText('Finger sugar')
    const urine = reportContent.locator('[data-cumulative-section="urine"]')
    const tables = urine.locator('table')
    await expect(tables).toHaveCount(2)
    await expect(tables.nth(0)).toContainText('物理性狀')
    await expect(tables.nth(0)).toContainText('化學分析')
    await expect(tables.nth(1)).toContainText('顯微鏡')
    await expect(tables.nth(1)).toContainText('蛋白/肌酸酐比值')
    await expect(tables.nth(1)).toContainText('其他尿液項目（測試）')
    await expect(tables.nth(0).locator('[data-lab-test-key="RBC/HPF"]')).toHaveCount(0)
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
      await urine.scrollIntoViewIfNeeded()
      await expect(tables).toHaveCount(2)
      await expect(tables.nth(0)).toBeVisible()
      await expect(tables.nth(1)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`urine-panels-${width}.png`) })
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
