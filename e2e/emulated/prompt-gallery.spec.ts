import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'

// Real SDK queries against the named Firestore emulator database. No gallery
// service mocks: missing public flags must actually exclude legacy documents.
const collection = 'http://127.0.0.1:8188/v1/projects/demo-mediprisma/databases/mediprisma/documents/sharedPrompts'
const text = (stringValue: string) => ({ stringValue })
const list = (...values: string[]) => ({ arrayValue: { values: values.map(text) } })
const content = 'Synthetic HMC prompt: preserve this entire imported template.'

test('summary entry can discover and import a public chat-only HMC template after clearing type', async ({ page, request }) => {
  const ids = ['e2e-hmc', 'e2e-summary', 'e2e-private', 'e2e-legacy', 'e2e-patient']
  const fixtures = [
    { id: ids[0], title: 'HMC SOAP DNA', type: 'chat', visibility: true, audience: 'medical' },
    { id: ids[1], title: 'E2E legacy summary', type: 'insight', visibility: true, audience: 'medical' },
    { id: ids[2], title: 'E2E private', type: 'chat', visibility: false, audience: 'medical' },
    { id: ids[3], title: 'E2E not migrated', type: 'chat', visibility: undefined, audience: 'medical' },
    { id: ids[4], title: 'E2E patient', type: 'chat', visibility: true, audience: 'patient' },
  ]
  const email = `gallery-${Date.now()}@example.test`
  const password = 'emulator-only-password'
  const account = await request.post('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', {
    data: { email, password, returnSecureToken: true },
  })
  expect(account.ok()).toBe(true)
  const { idToken } = await account.json()
  try {
    for (const fixture of fixtures) {
      const response = await request.patch(`${collection}/${fixture.id}`, {
        headers: { Authorization: 'Bearer owner' },
        data: { fields: {
          title: text(fixture.title), prompt: text(fixture.id === ids[0] ? content : 'Synthetic comparison template'), authorId: text('synthetic-author'),
          types: list(fixture.type), audience: list(fixture.audience), specialty: list('general'),
          tags: list(), category: text('other'),
          usageCount: { integerValue: '0' },
          createdAt: { timestampValue: '2026-01-01T00:00:00Z' },
          updatedAt: { timestampValue: '2026-01-01T00:00:00Z' },
          ...(fixture.visibility === undefined ? {} : { isPublic: { booleanValue: fixture.visibility } }),
        } },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }
    await importBundle(page)
    await page.getByRole('tab', { name: '自訂摘要', exact: true }).click()
    await page.getByRole('button', { name: '管理模組', exact: true }).click()
    const manager = page.getByRole('dialog', { name: '管理自訂摘要模組', exact: true })
    await manager.getByRole('button', { name: '登入以跨裝置保留', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('密碼', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await expect(manager.getByRole('status').filter({ hasText: '已同步至帳號' })).toBeVisible()
    await manager.getByRole('button', { name: '瀏覽範本庫', exact: true }).click()
    const gallery = page.getByRole('dialog', { name: 'Prompt 範本庫', exact: true })
    await expect(gallery.getByRole('button', { name: 'E2E legacy summary', exact: true })).toBeVisible()
    await expect(gallery.getByRole('button', { name: 'HMC SOAP DNA', exact: true })).toHaveCount(0)
    await gallery.getByRole('button', { name: '清除篩選: 摘要', exact: true }).click()
    await expect(gallery.getByRole('button', { name: 'HMC SOAP DNA', exact: true })).toBeVisible()
    for (const name of ['E2E private', 'E2E not migrated', 'E2E patient']) {
      await expect(gallery.getByRole('button', { name, exact: true })).toHaveCount(0)
    }
    await gallery.getByRole('searchbox').fill('HMC')
    await expect(gallery.getByText('1 筆', { exact: true })).toBeVisible()
    await expect(gallery.getByRole('button', { name: 'E2E legacy summary', exact: true })).toHaveCount(0)
    await gallery.getByRole('button', { name: 'HMC SOAP DNA', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'HMC SOAP DNA', exact: true })
    await expect(preview.getByRole('region', { name: 'Prompt 內容', exact: true })).toContainText(content)
    await preview.getByRole('button', { name: '加入自訂摘要', exact: true }).click()
    await expect(preview).toBeHidden()
    await gallery.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(gallery).toBeHidden()
    await expect(manager.getByRole('textbox', { name: '模組名稱', exact: true })).toHaveValue('HMC SOAP DNA')
    await expect(manager.locator('textarea')).toHaveValue(content)
  } finally {
    await request.post('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-api-key', { data: { idToken } })
    for (const id of ids) {
      const response = await request.delete(`${collection}/${id}`, { headers: { Authorization: 'Bearer owner' } })
      expect(response.ok()).toBe(true)
    }
  }
})
