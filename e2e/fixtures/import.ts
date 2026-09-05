import { type Page, expect } from '@playwright/test'
import path from 'node:path'

/** The committed, fully-fictional bundle used by CI and the default flow. */
export const SYNTHETIC_BUNDLE = path.join(__dirname, 'synthetic-bundle.json')

/**
 * Optional local-only real bundle. Point E2E_LOCAL_BUNDLE at a gitignored
 * file (e.g. one of your 50-case exports) to run the suite against real data
 * on your machine. Never committed; CI always uses the synthetic bundle.
 */
export const LOCAL_BUNDLE = process.env.E2E_LOCAL_BUNDLE

/**
 * Imports a FHIR bundle JSON through the header's file input and waits for the
 * patient to render. Exercises the real import → IndexedDB → render path with
 * no SMART auth / Firebase. Returns the bundle path actually used.
 */
export async function importBundle(
  page: Page,
  options: {
    bundlePath?: string
    locale?: 'en' | 'zh-TW'
  } = {},
) {
  const bundlePath = options.bundlePath || LOCAL_BUNDLE || SYNTHETIC_BUNDLE
  // Preset prefs BEFORE the app boots so first-load is deterministic:
  // - requested locale (zh-TW by default because most tests assert Chinese strings)
  // - medical audience, already "selected"
  // - first-run onboarding marked complete
  await page.addInitScript((locale) => {
    localStorage.setItem('medical-note-locale', locale)
    localStorage.setItem('medical-note-audience', 'medical')
    localStorage.setItem('medical-note-audience-selected', '1')
    localStorage.setItem('medical-note-onboarding-v1', '1')
    localStorage.setItem('medical-note-left-browser-tour-v1', '1')
  }, options.locale ?? 'zh-TW')
  await page.goto('/')
  // The header file input exists in the server-rendered loading shell, before
  // its change handler is ready. A clean page resolves to Welcome, while a
  // re-import resolves straight back to the persisted patient workspace. Wait
  // for either client-only result before selecting the file so the change
  // cannot be lost during hydration.
  await expect.poll(async () => {
    const welcomeReady = await page.getByTestId('welcome-demo-card').isVisible()
    const patientReady = await page.locator('[data-slot="clinical-patient-context"]').count() > 0
    return welcomeReady || patientReady
  }, { timeout: 20_000 }).toBe(true)
  // Register before choosing the file so a fast import cannot settle between
  // setInputFiles resolving and the next Playwright command.
  await page.evaluate(() => {
    const testWindow = window as Window & { __mediprismaBundleSettled?: boolean }
    testWindow.__mediprismaBundleSettled = false
    window.addEventListener('mediprisma:local-bundle-change-settled', () => {
      testWindow.__mediprismaBundleSettled = true
    }, { once: true })
  })
  // The import button renders in both the header and the welcome screen; both
  // are wired to the same importFile, so the first one is fine.
  await page.getByTestId('import-bundle-input').first().setInputFiles(bundlePath)
  await page.waitForFunction(() => (
    window as Window & { __mediprismaBundleSettled?: boolean }
  ).__mediprismaBundleSettled === true)
  // Import no longer asks anything. The post-import AI decision dialog (「只匯入
  // 並查看」/「自動產生」 plus its consent checkbox) was removed in v0.48 — auto
  // generation is now a plain switch in the 醫療摘要 header, off by default, so
  // import is silent and every spec starts free of background AI.
  // Patient panel renders once the local bundle is active. With the synthetic
  // fixture the name is 王小明; for a real local bundle, just wait for the
  // patient-info heading instead of a specific name.
  if (bundlePath === SYNTHETIC_BUNDLE) {
    // The phone workspace keeps both panels mounted and may restore the 功能
    // panel as active. The patient context is still loaded correctly even when
    // its left-panel copy is temporarily hidden, so wait for DOM attachment
    // rather than coupling data readiness to the current responsive panel.
    await expect(page.getByText('王小明').first()).toBeAttached({ timeout: 20_000 })
  }
  return bundlePath
}

/**
 * Turn on 醫療摘要 › 摘要設定 › 自動產生 through the real control.
 *
 * Specs that just need auto-run active across a reload should seed
 * `medical-summary-prefs` in an init script instead — an init script re-runs on
 * every navigation and would overwrite whatever this flipped. Use this when the
 * switch itself is what you are testing.
 */
export async function enableSummaryAutoGenerate(page: Page) {
  await page.getByRole('button', { name: '摘要設定', exact: true }).click()
  const toggle = page.getByRole('switch', { name: '自動產生', exact: true })
  await expect(toggle).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('data-state')) !== 'checked') {
    await toggle.click()
  }
  await expect(toggle).toHaveAttribute('data-state', 'checked')
  await page.keyboard.press('Escape')
}

/**
 * Activate the 臨床對話 (chat) tab and return its input. Since v0.26 the right
 * panel DEFAULTS to 醫療摘要 (medical summary), so the chat input renders in an
 * inactive tab (mounted-but-hidden) until this tab is selected.
 */
export async function openChatInput(page: Page) {
  await page.getByRole('tab', { name: /臨床對話|Clinical Chat/ }).click()
  const textarea = page.getByPlaceholder(/輸入|Type your/).first()
  await expect(textarea).toBeVisible()
  return textarea
}

/**
 * The 臨床對話 chat tabpanel. Scope reply/message locators to this — the page
 * now renders several `.prose` blocks (medical summary, IPS export…), so a bare
 * page.locator('.prose') no longer means "the chat reply".
 */
export function chatPanel(page: Page) {
  return page.getByRole('tabpanel', { name: /臨床對話|Clinical Chat/ })
}
