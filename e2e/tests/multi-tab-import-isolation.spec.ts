import { test, expect } from '@playwright/test'
import path from 'node:path'
import { importBundle, SYNTHETIC_BUNDLE } from '../fixtures/import'

const SYNTHETIC_BUNDLE_B = path.join(__dirname, '../fixtures/synthetic-bundle-b.json')

test('keeps Bundle and AI-cache ownership isolated across MediPrisma tabs', async ({ page }) => {
  const pageA = page
  const pageB = await page.context().newPage()

  await importBundle(pageA, { bundlePath: SYNTHETIC_BUNDLE })
  const scopeA = await pageA.evaluate(() => (
    sessionStorage.getItem('fhir_bundle_override')?.replace(/^import:/, '') ?? ''
  ))
  expect(scopeA).not.toBe('')

  // Stand in for a completed A-patient AI result. Importing B must not perform
  // the old origin-wide purge that erased another open tab's work.
  const aCacheKey = `mediprisma:ai-result:import-${encodeURIComponent(scopeA)}:e2e:result`
  const aCacheRecord = JSON.stringify({ v: 1, iv: 'a', data: 'ciphertext', savedAt: Date.now() })
  await pageA.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [aCacheKey, aCacheRecord],
  )

  await importBundle(pageB, { bundlePath: SYNTHETIC_BUNDLE_B })
  const scopeB = await pageB.evaluate(() => (
    sessionStorage.getItem('fhir_bundle_override')?.replace(/^import:/, '') ?? ''
  ))

  expect(scopeB).not.toBe('')
  expect(scopeB).not.toBe(scopeA)
  await expect(pageA.getByText('王小明').first()).toBeVisible()
  await expect(pageB.getByText('李小華').first()).toBeVisible()
  expect(await pageB.evaluate(([key]) => localStorage.getItem(key), [aCacheKey])).toBe(aCacheRecord)

  // Each tab keeps its own session pointer and encryption key, while the two
  // IndexedDB records coexist. Both charts must survive an independent reload.
  await pageA.reload()
  await pageB.reload()
  await expect(pageA.getByText('王小明').first()).toBeVisible({ timeout: 20_000 })
  await expect(pageB.getByText('李小華').first()).toBeVisible({ timeout: 20_000 })

  // Clearing B deletes only B's IndexedDB/image/cache scope. A must remain
  // reloadable rather than losing the old origin-wide `current` record.
  await pageB.getByRole('button', { name: '清除本地資料', exact: true }).first().click()
  await pageB.getByRole('button', { name: '清除本地資料', exact: true }).last().click()
  await pageA.reload()
  await expect(pageA.getByText('王小明').first()).toBeVisible({ timeout: 20_000 })
})
