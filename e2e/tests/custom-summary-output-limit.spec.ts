import { readFileSync } from 'node:fs'
import { test, expect } from '../fixtures/test'
import { importBundle, openFeaturePanel } from '../fixtures/import'

test('custom summary retains partial text with a persistent output-limit warning', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const profileId = 'e2e-output-limit'
    localStorage.setItem('openai_compatible_connections_v2', JSON.stringify({
      version: 2,
      profiles: [{
        profileId,
        profile: {
          enabled: true,
          baseUrl: 'https://e2e-local-model.test/v1',
          modelId: 'tvghbrain-3.5-fixture',
          contextWindowTokens: 262_144,
          contextWindowSource: 'manual',
          transport: 'direct',
          agentMode: 'standard',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      }],
    }))
    localStorage.setItem('model-prefs', JSON.stringify({
      state: { prefs: { chat: 'gemini-3-flash', insights: `openai-compatible-custom:${profileId}` } },
      version: 0,
    }))
  })

  let requestedMaxTokens: number | null = null
  await page.route('https://e2e-local-model.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': '*',
        },
      })
      return
    }
    const body = route.request().postDataJSON() as { max_tokens?: number }
    requestedMaxTokens = body.max_tokens ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        model: 'tvghbrain-3.5-fixture',
        choices: [{
          message: { content: 'A:診斷\n重複的未完成內容' },
          finish_reason: 'length',
        }],
        usage: { prompt_tokens: 800, completion_tokens: 4096, total_tokens: 4896 },
      }),
    })
  })

  await importBundle(page)
  await openFeaturePanel(page)
  const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
  await summaryPanel.getByRole('tab', { name: '自訂摘要' }).click()
  const summaryModule = summaryPanel.locator('article').filter({
    has: page.getByRole('heading', { name: '變化摘要' }),
  })
  const generate = summaryModule.getByRole('button', { name: '產生摘要', exact: true })
  await expect(generate).toBeEnabled({ timeout: 20_000 })
  const beforePath = testInfo.outputPath('before-output-limit.png')
  await summaryModule.screenshot({ path: beforePath, animations: 'disabled' })

  await generate.click()
  const alert = summaryModule.getByRole('alert')
  await expect(alert).toContainText('輸出已截斷：以下為部分內容')
  await expect(alert).toContainText('4,096 個 tokens')
  await expect(summaryModule.getByText('重複的未完成內容')).toBeVisible()
  await expect(summaryModule.getByRole('button', { name: '重新產生摘要' })).toBeEnabled()
  expect(requestedMaxTokens).toBe(4096)
  const afterPath = testInfo.outputPath('after-output-limit.png')
  await summaryModule.screenshot({ path: afterPath, animations: 'disabled' })

  const artifactPath = process.env.BA_ARTIFACT_PATH
  if (artifactPath) {
    const before = readFileSync(beforePath).toString('base64')
    const after = readFileSync(afterPath).toString('base64')
    const preview = await page.context().newPage()
    await preview.setViewportSize({ width: 1320, height: 460 })
    await preview.setContent(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; font-family: Arial, "Noto Sans TC", sans-serif; color: #19212b; background: #f6f7f8; }
      h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
      p { margin: 0; color: #5b6572; font-size: 13px; }
      main { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 22px; }
      section { min-width: 0; }
      h2 { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
      img { display: block; width: 100%; height: auto; border: 1px solid #dce1e6; border-radius: 8px; background: white; }
      footer { margin-top: 16px; color: #5b6572; font-size: 12px; }
    </style><h1>自訂摘要輸出上限提醒</h1><p>使用合成 FHIR 測試資料與模擬地端模型回應</p>
    <main><section><h2>觸發前</h2><img src="data:image/png;base64,${before}"></section>
    <section><h2>觸發後：標示部分內容並保留文字</h2><img src="data:image/png;base64,${after}"></section></main>
    <footer>保留已產生內容，同時提醒後續段落可能缺漏。</footer></html>`)
    await preview.screenshot({ path: artifactPath, fullPage: true, animations: 'disabled' })
    await preview.close()
  }

  await summaryModule.getByRole('button', { name: '放大閱讀「變化摘要」摘要結果' }).click()
  const dialog = page.getByRole('dialog', { name: '變化摘要' })
  await expect(dialog.getByRole('alert')).toContainText('輸出已截斷：以下為部分內容')
  await expect(dialog).toContainText('重複的未完成內容')
  await dialog.getByRole('button', { name: 'Close' }).click()

  for (const width of [1440, 1024, 768, 430, 390, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await openFeaturePanel(page)
    await expect(alert).toBeVisible()
    expect(await summaryModule.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(alert).toBeVisible()
  await summaryModule.screenshot({ path: testInfo.outputPath('after-output-limit-dark-phone.png'), animations: 'disabled' })

  // A cached partial response must keep its warning after the view reloads.
  await page.reload()
  await openFeaturePanel(page)
  const restoredPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
  await restoredPanel.getByRole('tab', { name: '自訂摘要' }).click()
  const restoredModule = restoredPanel.locator('article').filter({
    has: page.getByRole('heading', { name: '變化摘要' }),
  })
  await expect(restoredModule.getByRole('alert')).toContainText('輸出已截斷：以下為部分內容')
  await expect(restoredModule.getByText('重複的未完成內容')).toBeVisible()
})
