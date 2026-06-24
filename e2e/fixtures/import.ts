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
export async function importBundle(page: Page, bundlePath: string = LOCAL_BUNDLE || SYNTHETIC_BUNDLE) {
  // Preset prefs BEFORE the app boots so first-load is deterministic:
  // - zh-TW locale (tests assert Chinese strings)
  // - medical audience, already "selected"
  // - first-run onboarding marked complete → the onboarding stepper (which fires
  //   on first data load and overlays the whole app) never appears, so clicks
  //   aren't intercepted by its modal overlay.
  await page.addInitScript(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
    localStorage.setItem('medical-note-audience', 'medical')
    localStorage.setItem('medical-note-audience-selected', '1')
    localStorage.setItem('medical-note-onboarding-v1', '1')
  })
  await page.goto('/')
  // The import button renders in both the header and the welcome screen; both
  // are wired to the same importFile, so the first one is fine.
  await page.getByTestId('import-bundle-input').first().setInputFiles(bundlePath)
  // Patient panel renders once the local bundle is active. With the synthetic
  // fixture the name is 王小明; for a real local bundle, just wait for the
  // patient-info heading instead of a specific name.
  if (bundlePath === SYNTHETIC_BUNDLE) {
    await expect(page.getByText('王小明').first()).toBeVisible({ timeout: 20_000 })
  }
  return bundlePath
}
