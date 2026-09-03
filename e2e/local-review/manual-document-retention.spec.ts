import { test, expect } from '../fixtures/test'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION, STORAGE_KEYS } from '../../src/shared/constants/data-selection.constants'
import path from 'node:path'

test('large synthetic chart keeps manual document picks through fitting and reopening', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = route.request().url()
    if (/^https?:/.test(url) && !url.startsWith('http://localhost:3001')) return route.abort()
    return route.continue()
  })
  await page.addInitScript(({ key, selection, filters }) => {
    const profile = { selection, filters, documentMode: 'all', documentIds: [] }
    localStorage.setItem(key, JSON.stringify({ insights: profile, chat: profile, ips: profile, aiExport: profile }))
    localStorage.setItem('medical-note-locale', 'zh-TW')
    localStorage.setItem('medical-note-audience', 'medical')
    localStorage.setItem('medical-note-audience-selected', '1')
    localStorage.setItem('medical-note-onboarding-v1', '1')
    localStorage.setItem('medical-note-left-browser-tour-v1', '1')
  }, { key: STORAGE_KEYS.DATA_PROFILES, selection: ALL_DATA_SELECTION, filters: ALL_DATA_FILTERS })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  // Exercise a visible control before selecting the file. A pre-hydration
  // file selection can be lost when the existing login mismatch replaces DOM.
  await expect(async () => {
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to MediPrisma', exact: true })).toBeVisible()
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: /Traditional Chinese|繁體中文/, exact: true }).click({ timeout: 5000 })
  await expect(page.getByRole('heading', { name: '歡迎使用 MediPrisma', exact: true })).toBeVisible()
  await page.getByTestId('import-bundle-input').first().setInputFiles(path.resolve('artifacts/synthetic-oncology/synthetic-cloud-oncology-v2-1100000-tokens.fhir.json'))
  await expect(page.getByRole('button', { name: '摘要設定', exact: true })).toBeVisible({ timeout: 60000 })
  console.info('Synthetic import ready')
  await page.getByRole('button', { name: '摘要設定', exact: true }).click()
  await page.getByTestId('medical-summary-data-scope-trigger').click()
  const drawer = page.getByRole('dialog', { name: 'AI 資料範圍' })
  await expect(drawer.getByRole('button', { name: '最近一次住院', exact: true })).toBeVisible({ timeout: 60000 })
  await drawer.getByRole('button', { name: '最近一次住院', exact: true }).click()
  const latest = drawer.locator('input[data-document-id="synthetic-discharge-95"]')
  const older = drawer.locator('input[data-document-id="synthetic-discharge-94"]')
  await expect(latest).toBeChecked({ timeout: 60000 })
  await expect(older).not.toBeChecked()
  await expect(drawer.getByText('正在重新計算本次模型範圍；你的選擇已保留…', { exact: true })).toHaveCount(0, { timeout: 60000 })
  await older.scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    const timings = { click: 0, nextFrame: 0 }
    Object.assign(window, { scopeTimings: timings })
    document.addEventListener('click', event => {
      if ((event.target as HTMLElement).getAttribute('data-document-id') !== 'synthetic-discharge-94') return
      timings.click = performance.now()
      requestAnimationFrame(() => { timings.nextFrame = performance.now() - timings.click })
    }, { capture: true })
  })
  const started = Date.now()
  await older.check({ timeout: 60000 })
  await expect(older).toBeChecked()
  console.info('Browser document check visible (ms)', Date.now() - started)
  console.info('Click to next animation frame', await page.evaluate(() => (window as unknown as { scopeTimings: unknown }).scopeTimings))
  await expect(drawer.getByText('正在重新計算本次模型範圍；你的選擇已保留…', { exact: true })).toHaveCount(0, { timeout: 60000 })
  await expect(latest).toBeChecked()
  await expect(older).toBeChecked()
  await expect(older.locator('..')).not.toContainText('未納入本次模型範圍')
  const another = drawer.locator('input[data-document-id="synthetic-discharge-93"]')
  await another.check()
  await expect(older).toBeChecked()
  await expect(another).toBeChecked()
  await page.keyboard.press('Escape')
  const picker = page.getByRole('tabpanel', { name: '醫療摘要' }).getByTestId('model-picker-trigger')
  await picker.click()
  const modelStarted = Date.now()
  await page.getByRole('menuitem', { name: /Claude Haiku 4\.5/ }).click()
  await expect(picker).toContainText('Claude Haiku 4.5')
  console.info('Browser model selection verified (ms)', Date.now() - modelStarted)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('medical-summary-prefs') || '')).toContain('claude-haiku-4-5')
  await page.getByRole('button', { name: '摘要設定', exact: true }).click()
  await page.getByTestId('medical-summary-data-scope-trigger').click()
  await expect(older).toBeChecked()
  await expect(another).toBeChecked()
  await drawer.getByRole('tab', { name: '預覽', exact: true }).click()
  await expect(drawer.getByTestId('clinical-context-preview')).toBeVisible({ timeout: 60000 })
  for (const id of [95, 94, 93]) {
    await expect(drawer.getByTestId('clinical-context-preview')).toContainText(`id="synthetic-discharge-${id}"`)
  }
  await drawer.getByRole('tab', { name: '資料選擇', exact: true }).click()
  for (const [width, height] of [[320, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await older.scrollIntoViewIfNeeded()
    await expect(older).toBeChecked()
    await page.screenshot({ path: `tmp/scope-check-${width}.png` })
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '摘要設定', exact: true }).click()
  await page.getByTestId('medical-summary-data-scope-trigger').click()
  await expect(older).toBeChecked({ timeout: 60000 })
  await expect(another).toBeChecked()
  console.info('Page errors', errors.map(error => error.slice(0, 250)))
  // Known pre-import login hydration mismatch on this existing experimental
  // branch is tracked separately; any interaction/runtime error still fails.
  expect(errors.filter(error => !error.includes('Hydration failed because the server rendered HTML'))).toEqual([])
})
