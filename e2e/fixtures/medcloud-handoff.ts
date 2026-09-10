import { type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { SYNTHETIC_BUNDLE } from './import'

export interface MedcloudHandoffProbe {
  changeDispatched: boolean
  error: string | null
  inputFoundAtMs: number | null
  inputStillConnectedAtSettle: boolean | null
  inputWasPresentAtStart: boolean
  settled: boolean
}

export async function prepareMedcloudHandoffPage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
    localStorage.setItem('medical-note-audience', 'medical')
    localStorage.setItem('medical-note-audience-selected', '1')
    localStorage.setItem('medical-note-onboarding-v1', '1')
    localStorage.setItem('medical-note-left-browser-tour-v1', '1')
  })
}

/**
 * Run the patient-data part of the Cloud Wildcatch content script in the page.
 * The extension starts this after opening the MediPrisma tab. It does not wait
 * for a visible app screen: it finds or observes the first handoff input,
 * assigns a File through DataTransfer, and immediately sends a bubbling change
 * event while already listening for the app's settled event.
 */
export async function startMedcloudHandoff(
  page: Page,
  bundlePath = SYNTHETIC_BUNDLE,
) {
  const json = await readFile(bundlePath, 'utf8')

  await page.evaluate(({ bundleJson }) => {
    const testWindow = window as Window & {
      __medcloudHandoffProbe?: MedcloudHandoffProbe
    }
    const selector = '[data-testid="import-bundle-input"]'
    const existing = document.querySelector<HTMLInputElement>(selector)
    const probe: MedcloudHandoffProbe = {
      changeDispatched: false,
      error: null,
      inputFoundAtMs: null,
      inputStillConnectedAtSettle: null,
      inputWasPresentAtStart: existing !== null,
      settled: false,
    }
    testWindow.__medcloudHandoffProbe = probe

    let delivered = false
    const deliver = (input: HTMLInputElement) => {
      if (delivered) return
      delivered = true
      probe.inputFoundAtMs = performance.now()

      window.addEventListener('mediprisma:local-bundle-change-settled', () => {
        probe.settled = true
        probe.inputStillConnectedAtSettle = input.isConnected
      }, { once: true })

      try {
        const file = new File([bundleJson], 'cloud-wildcatch-e2e.json', {
          type: 'application/fhir+json',
        })
        const transfer = new DataTransfer()
        transfer.items.add(file)
        input.files = transfer.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        probe.changeDispatched = true
      } catch (error) {
        probe.error = error instanceof Error ? error.message : String(error)
      }
    }

    if (existing) {
      deliver(existing)
      return
    }

    const observer = new MutationObserver(() => {
      const input = document.querySelector<HTMLInputElement>(selector)
      if (!input) return
      observer.disconnect()
      deliver(input)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }, { bundleJson: json })
}

export async function readMedcloudHandoffProbe(page: Page) {
  return page.evaluate(() => (
    window as Window & { __medcloudHandoffProbe?: MedcloudHandoffProbe }
  ).__medcloudHandoffProbe)
}
