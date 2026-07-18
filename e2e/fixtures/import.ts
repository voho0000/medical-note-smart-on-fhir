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
    aiDecision?: 'manual' | 'auto'
  } = {},
) {
  const bundlePath = options.bundlePath || LOCAL_BUNDLE || SYNTHETIC_BUNDLE
  const aiDecision = options.aiDecision ?? 'manual'
  // Preset prefs BEFORE the app boots so first-load is deterministic:
  // - zh-TW locale (tests assert Chinese strings)
  // - medical audience, already "selected"
  // - first-run onboarding marked complete → the onboarding stepper (which fires
  //   on first data load) reopens only the one-step, import-scoped AI question.
  await page.addInitScript(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
    localStorage.setItem('medical-note-audience', 'medical')
    localStorage.setItem('medical-note-audience-selected', '1')
    localStorage.setItem('medical-note-onboarding-v1', '1')
  })
  await page.goto('/')
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
  // Every real local import has its own decision. Keep general E2E fixtures
  // deterministic and free of background AI by choosing the safe default.
  if (aiDecision === 'auto') {
    const auto = page.getByRole('button', { name: /^自動產生/ })
    await expect(auto).toBeVisible({ timeout: 20_000 })
    await auto.click()
    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: '確認並啟用', exact: true }).click()
  } else {
    const importOnly = page.getByRole('button', { name: '只匯入並查看', exact: true })
    await expect(importOnly).toBeVisible({ timeout: 20_000 })
    await importOnly.click()
  }
  // Patient panel renders once the local bundle is active. With the synthetic
  // fixture the name is 王小明; for a real local bundle, just wait for the
  // patient-info heading instead of a specific name.
  if (bundlePath === SYNTHETIC_BUNDLE) {
    await expect(page.getByText('王小明').first()).toBeVisible({ timeout: 20_000 })
  }
  return bundlePath
}

/**
 * Activate the 臨床對話 (chat) tab and return its input. Since v0.26 the right
 * panel DEFAULTS to 醫療摘要 (medical summary), so the chat input renders in an
 * inactive tab (mounted-but-hidden) until this tab is selected.
 */
export async function openChatInput(page: Page) {
  await page.getByRole('tab', { name: '臨床對話' }).click()
  const textarea = page.getByPlaceholder(/輸入/).first()
  await expect(textarea).toBeVisible()
  return textarea
}

/**
 * The 臨床對話 chat tabpanel. Scope reply/message locators to this — the page
 * now renders several `.prose` blocks (medical summary, IPS export…), so a bare
 * page.locator('.prose') no longer means "the chat reply".
 */
export function chatPanel(page: Page) {
  return page.getByRole('tabpanel', { name: '臨床對話' })
}
