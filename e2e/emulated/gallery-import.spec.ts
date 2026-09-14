import { test, expect, type Page } from '@playwright/test'
import { importBundle, openChatInput, openFeaturePanel, reloadApp } from '../fixtures/import'

const firestore = 'http://127.0.0.1:8188/v1/projects/demo-mediprisma/databases/mediprisma/documents'
const title = 'E2E 範本重複匯入'
const prompt = 'E2E 原始範本內容，不要呼叫 AI。'

async function selectGalleryPrompt(page: Page, preview: boolean) {
  const gallery = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: '所有範本', exact: true }) })
  if (preview) {
    await gallery.getByRole('button', { name: title, exact: true }).click()
    await page.getByRole('button', { name: /^(加入對話範本|加入自訂摘要)$/ }).click()
  } else {
    await gallery.getByRole('button', { name: `帶入: ${title}`, exact: true }).click()
  }
}

for (const entry of ['chat', 'chat-manager', 'summary-manager'] as const) {
  test(`${entry}: repeat import, preserve edits and reuse after account reload`, async ({ page, request }, testInfo) => {
    // Use a separate emulator port; preserve the app's existing emulator defaults.
    await page.route('http://127.0.0.1:8080/**', route => route.continue({ url: route.request().url().replace(':8080', ':8188') }))
    await page.route(/https:\/\/.*(?:googleapis\.com|cloudfunctions\.net|run\.app)\//, route => route.abort())
    const email = `${entry}-${Date.now()}@example.test`
    const password = 'E2E-password-1234'
    const signup = await request.post('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', {
      data: { email, password, returnSecureToken: true },
    })
    expect(signup.ok()).toBe(true)
    const { localId } = await signup.json()
    const seed = await request.patch(`${firestore}/sharedPrompts/gallery-import-regression`, {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: {
        title: { stringValue: title }, prompt: { stringValue: prompt }, isPublic: { booleanValue: true },
        usageCount: { integerValue: '0' }, authorId: { stringValue: 'synthetic-author' },
        types: { arrayValue: { values: [{ stringValue: 'chat' }, { stringValue: 'summary' }] } },
        audience: { arrayValue: { values: [{ stringValue: 'medical' }] } },
        category: { stringValue: 'summary' }, outputFormat: { stringValue: 'markdown' },
        languagePolicy: { stringValue: 'interface-language' },
      } },
    })
    expect(seed.ok()).toBe(true)
    await importBundle(page)
    await openFeaturePanel(page)
    await page.getByRole('button', { name: '訪客', exact: true }).click()
    await page.getByRole('menuitem', { name: /登入/ }).click()
    const login = page.getByRole('dialog')
    await login.locator('input[type="email"]').fill(email)
    await login.locator('input[type="password"]').fill(password)
    await login.getByRole('button', { name: '登入', exact: true }).click()
    await expect(login).toBeHidden()

    const collection = entry === 'summary-manager' ? 'clinicalInsightPanels' : 'chatTemplates'
    const imported = async () => {
      const response = await request.get(`${firestore}/users/${localId}/${collection}`, { headers: { Authorization: 'Bearer owner' } })
      expect(response.ok()).toBe(true)
      const body = await response.json()
      return (body.documents ?? []).filter((d: { fields: Record<string, { stringValue?: string }> }) => d.fields.label?.stringValue === title || d.fields.title?.stringValue === title)
    }
    const openManager = async () => {
      await openFeaturePanel(page)
      if (entry === 'summary-manager') {
        // Account layout preferences may hydrate after the first render.
        await expect(async () => {
          await openFeaturePanel(page)
          await page.getByRole('tab', { name: '醫療摘要', exact: true }).click({ timeout: 1500 })
        }).toPass({ timeout: 20000 })
        await page.getByRole('tab', { name: '自訂摘要', exact: true }).click()
        await page.getByRole('button', { name: '管理模組', exact: true }).click()
      } else {
        await openChatInput(page)
        await page.getByRole('button', { name: '管理範本', exact: true }).click()
      }
      return page.getByRole('dialog').filter({ has: page.locator('textarea') })
    }
    const doImport = async (preview = false) => {
      if (entry === 'chat') {
        await openChatInput(page)
        await page.getByRole('button', { name: '瀏覽範本庫', exact: true }).click()
      } else {
        const manager = await openManager()
        await manager.getByRole('button', { name: '瀏覽範本庫', exact: true }).filter({ visible: true }).click()
      }
      await selectGalleryPrompt(page, preview)
    }
    const closeDialogs = async () => {
      const openDialogs = page.locator('[role="dialog"][data-state="open"]')
      for (let i = 0; i < 4 && await openDialogs.count(); i++) {
        const id = await openDialogs.last().getAttribute('id')
        expect(id).toBeTruthy()
        const dialog = page.locator(`[id="${id}"]`)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(dialog).toBeHidden()
      }
    }
    const usageCount = async () => {
      const response = await request.get(`${firestore}/sharedPrompts/gallery-import-regression`, { headers: { Authorization: 'Bearer owner' } })
      expect(response.ok()).toBe(true)
      return Number((await response.json()).fields.usageCount.integerValue)
    }
    await doImport()
    await expect.poll(usageCount).toBe(1)
    await expect.poll(async () => (await imported()).length).toBe(1)
    const savedName = (await imported())[0].name
    await closeDialogs()
    if (entry === 'chat') {
      const input = await openChatInput(page)
      await page.getByTestId('chat-template-menu').click()
      await page.getByRole('menuitemradio', { name: title, exact: true }).click()
      await input.fill('')
      await page.getByTestId('chat-template-insert').click()
      await page.getByTestId('chat-template-insert').click()
      await expect(input).toHaveValue(`${prompt}\n\n${prompt}`)
      expect((await imported()).length).toBe(1)
    }
    await doImport(true)
    const duplicateNotice = page.getByRole('dialog', { name: '你已經有這份範本', exact: true })
    await expect(duplicateNotice).toBeVisible()
    await duplicateNotice.getByRole('button', { name: '知道了', exact: true }).click()
    expect(await usageCount()).toBe(1)
    if (entry === 'chat') {
      await expect(await openChatInput(page)).toHaveValue(`${prompt}\n\n${prompt}`)
    }
    await expect.poll(async () => (await imported()).length).toBe(1)
    await closeDialogs()
    const manager = await openManager()
    await manager.getByRole('button').filter({ hasText: title }).first().click()
    await manager.locator('textarea').first().fill('E2E 保留我的編輯內容')
    if (entry !== 'summary-manager') await manager.getByRole('button', { name: '儲存模板', exact: true }).click()
    const contentKey = entry === 'summary-manager' ? 'prompt' : 'content'
    await expect.poll(async () => (await imported())[0].fields[contentKey].stringValue).toBe('E2E 保留我的編輯內容')
    await reloadApp(page)
    await doImport()
    await expect.poll(async () => (await imported()).length).toBe(1)
    expect((await imported())[0].name).toBe(savedName)
    expect((await imported())[0].fields[contentKey].stringValue).toBe('E2E 保留我的編輯內容')
    await closeDialogs()
    const reloaded = await openManager()
    await reloaded.getByRole('button').filter({ hasText: title }).first().click()
    await expect(reloaded.locator('textarea').first()).toHaveValue('E2E 保留我的編輯內容')
    await reloaded.screenshot({ path: testInfo.outputPath(`${entry}-preserved.png`) })
    await closeDialogs()
    // Change the remote source after a local edit: only an explicit choice can replace it.
    const changeSource = async (text: string) => {
      const response = await request.patch(`${firestore}/sharedPrompts/gallery-import-regression?updateMask.fieldPaths=prompt`, {
        headers: { Authorization: 'Bearer owner' }, data: { fields: { prompt: { stringValue: text } } },
      })
      expect(response.ok()).toBe(true)
    }
    await changeSource('E2E 來源更新版本二')
    await doImport()
    const choice = page.getByRole('dialog', { name: '來源範本有新內容' })
    await expect(choice).toBeVisible()
    expect((await imported())[0].fields[contentKey].stringValue).toBe('E2E 保留我的編輯內容')
    if (entry === 'chat') {
      for (const [width, height] of [[320,900],[390,900],[430,900],[768,900],[1024,900],[1440,1000],[844,390]]) {
        await page.setViewportSize({ width, height })
        expect(await choice.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
        await choice.screenshot({ path: testInfo.outputPath(`source-choice-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    await choice.getByRole('button', { name: '保留我的版本', exact: true }).click()
    await expect(choice).toBeHidden()
    await closeDialogs()
    await doImport()
    await expect(choice).toBeHidden()
    const reusedToast = (entry === 'chat' ? page.locator('[data-sonner-toast]') : page.getByRole('status')).filter({ hasText: '已在你的範本中' }).last()
    await expect(reusedToast).toBeVisible()
    await reusedToast.getByRole('button', { name: '另存副本', exact: true }).click()
    await expect.poll(async () => {
      const response = await request.get(`${firestore}/users/${localId}/${collection}`, { headers: { Authorization: 'Bearer owner' } })
      const { documents = [] } = await response.json()
      return documents.filter((d: { fields: Record<string, { stringValue?: string }> }) =>
        (d.fields.label?.stringValue ?? d.fields.title?.stringValue) === `${title}（副本）`).length
    }).toBe(1)
    expect((await imported())[0].fields[contentKey].stringValue).toBe('E2E 保留我的編輯內容')
    await closeDialogs()
    await changeSource('E2E 來源更新版本三')
    await doImport()
    await choice.getByRole('button', { name: '更新這份範本', exact: true }).click()
    await expect.poll(async () => (await imported())[0].fields[contentKey].stringValue).toBe('E2E 來源更新版本三')
    expect((await imported())[0].name).toBe(savedName)
    await reloadApp(page)
    await doImport()
    await expect(choice).toBeHidden()
    expect((await imported()).length).toBe(1)

  })
}
