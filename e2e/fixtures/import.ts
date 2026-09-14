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
  // The header file input exists in the server-rendered loading shell, before
  // its change handler is ready. A clean page resolves to Welcome, while a
  // re-import resolves straight back to the persisted patient workspace. Wait
  // for either client-only result before selecting the file so the change
  // cannot be lost during hydration. Loading goes through `loadApp` so a dev
  // server caught mid-recompile gets one more chance (see there).
  await loadApp(page, () => page.goto('/'), async () => (
    await page.getByTestId('welcome-demo-card').isVisible()
      || await page.locator('[data-slot="clinical-patient-context"]').count() > 0
  ))
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
 * Navigate (goto / reload) and wait for the app to actually mount.
 *
 * `next dev --webpack` — what the emulator suites run against — re-reads its
 * build manifests on every request and rewrites them whenever it recompiles.
 * A request that lands mid-rewrite renders "SyntaxError: Unexpected end of
 * JSON input" for `/` and the browser shows the dev overlay instead of the
 * app; the very next load is fine. CI hit this between tests and on in-spec
 * reloads (#96/#97/#104 gallery-regression), never locally. So: bounded
 * retries of the navigation, judged by whether the app mounted. A page that
 * fails every time still fails the test — this covers the transient only.
 */
export async function loadApp(
  page: Page,
  navigate: () => Promise<unknown>,
  mounted: () => Promise<boolean>,
) {
  await expect(async () => {
    await navigate()
    await expect.poll(mounted, { timeout: 15_000 }).toBe(true)
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000] })
}

/**
 * `page.reload()` for a workspace that already has a patient: waits for the
 * patient context to come back, retrying the reload on the dev-server race
 * described on `loadApp`.
 */
export async function reloadApp(page: Page) {
  await loadApp(page, () => page.reload(), async () => (
    await page.locator('[data-slot="clinical-patient-context"]').count() > 0
  ))
}

/**
 * Activate a left-panel tab and wait for its panel.
 *
 * The workspace opens on 總覽 since the one-page overview landed (#72), so a
 * spec that asserts on 病人資訊, 就診紀錄, 報告, 用藥 or 文件 content has to say
 * so. Import used to leave 病人資訊 showing, which is why so many specs simply
 * asserted on its cards after `importBundle`.
 *
 * Panels for inactive tabs may be unmounted, so this waits for the tabpanel
 * rather than assuming a hidden one is merely invisible.
 */
export async function openLeftTab(page: Page, name: RegExp) {
  const tab = page.getByRole('tab', { name }).first()
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  return page.getByRole('tabpanel', { name })
}

/** The 病人資訊 tab, where the patient cards live. */
export async function openPatientTab(page: Page) {
  return openLeftTab(page, /病人資訊|Patient/)
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
 * Make sure the right-hand 功能 panel is showing.
 *
 * The responsive workspace (#72) starts it collapsed to a rail, so the panel's
 * tabs — 醫療摘要, 臨床對話 — are not in the DOM at all until it is expanded.
 * Specs used to find them straight after import because the panel was open by
 * default.
 *
 * The collapse is decided one measurement AFTER first paint: the workspace
 * mounts with the panel open (`preferredWidthReachable` still null), then the
 * container is measured and, on a display too narrow for 總覽's 2×2, the
 * panel folds into the rail. A helper that returned the moment it saw the tab
 * therefore handed callers a tab that could vanish before their click landed —
 * the CI signature was "visible → outside of the viewport → not visible",
 * forever, because nothing ever clicked the rail. Clicking the rail is what
 * makes the choice stick (`setCollapsedByUser`), so this retries: open when a
 * rail is showing, then require the tab to still be there after the measure
 * has had time to run.
 *
 * The rail carries its own label (it reports a finished summary, or a running
 * one) so this matches on `data-slot` rather than on text that changes with
 * state.
 */
export async function openFeaturePanel(page: Page) {
  // `header.medicalSummary` is 醫療摘要 in zh-TW and plain "Summary" in en.
  const summaryTab = page.getByRole('tab', { name: /醫療摘要|^Summary$/ }).first()
  // Phone widths have no rail — the panels are swapped by the bottom switcher,
  // and a spec that drives that switcher itself must not be pre-empted here.
  // Returning keeps this callable from every layout.
  if ((page.viewportSize()?.width ?? 0) < 768) return summaryTab

  const rail = page.locator('[data-slot="clinical-workspace-rail"]').first()
  await expect(async () => {
    // Straight after a reload neither is mounted yet; a failed attempt here
    // just comes round again.
    if (!(await summaryTab.isVisible().catch(() => false))) {
      await expect(rail).toBeVisible({ timeout: 2_000 })
      await rail.click({ timeout: 2_000 })
    }
    await expect(summaryTab).toBeVisible({ timeout: 2_000 })
    // Survive the post-mount measurement. If the panel folds now, the next
    // attempt sees the rail and clicks it, which pins the panel open.
    await page.waitForTimeout(300)
    await expect(summaryTab).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] })
  return summaryTab
}

/**
 * Activate the 臨床對話 (chat) tab and return its input. Since v0.26 the right
 * panel DEFAULTS to 醫療摘要 (medical summary), so the chat input renders in an
 * inactive tab (mounted-but-hidden) until this tab is selected — and since #72
 * the panel itself starts collapsed, so it has to be opened first.
 *
 * Opening, selecting and reading the input are retried as one unit: the
 * auto-collapse described on `openFeaturePanel` can land between any two of
 * these steps, and only a fresh pass (which re-clicks the rail) recovers.
 */
export async function openChatInput(page: Page) {
  const textarea = page.getByPlaceholder(/輸入|Type your/).first()
  await expect(async () => {
    await openFeaturePanel(page)
    await page.getByRole('tab', { name: /臨床對話|Clinical Chat/ }).click({ timeout: 2_000 })
    await expect(textarea).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 45_000, intervals: [250, 500, 1_000] })
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
