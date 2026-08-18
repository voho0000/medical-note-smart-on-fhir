import { expect, test, type Locator, type Page } from '@playwright/test'

declare global {
  interface Window {
    __mediprismaLongTasks?: number[]
  }
}

const LEFT_TABS = ['病人資訊', '就診紀錄', '報告', '用藥', '文件'] as const
const LEFT_TAB_CONTENT_IDS = ['patient', 'visits', 'reports', 'meds', 'documents'] as const

async function afterTwoPaints(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function afterPaint(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  }))
}

async function switchLeftTab(page: Page, name: string) {
  const tab = page.getByRole('tab').filter({ hasText: name }).first()
  const startedAt = await page.evaluate(() => performance.now())
  await tab.click()
  await expect(tab).toHaveAttribute('data-state', 'active')
  await afterTwoPaints(page)
  return page.evaluate((start) => performance.now() - start, startedAt)
}

async function activeLeftViewport(page: Page): Promise<Locator> {
  const viewport = page
    .locator('[role="tabpanel"][data-state="active"] [data-slot="scroll-area-viewport"]')
    .first()
  await expect(viewport).toBeVisible()
  return viewport
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

test.describe('clinical workspace performance contract', () => {
  test('keeps warm tab switches, scrolling, and retained DOM bounded', async ({ page }, testInfo) => {
    test.slow()
    await page.addInitScript(() => {
      localStorage.setItem('medical-note-locale', 'zh-TW')
      localStorage.setItem('medical-note-audience', 'medical')
      localStorage.setItem('medical-note-audience-selected', '1')
      localStorage.setItem('medical-note-onboarding-v1', '1')
      localStorage.setItem('medical-note-left-browser-tour-v1', '1')
      window.__mediprismaLongTasks = []
      if ('PerformanceObserver' in window) {
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__mediprismaLongTasks?.push(entry.duration)
            }
          }).observe({ type: 'longtask', buffered: true })
        } catch {
          // Older Chromium builds may omit the Long Tasks API. Frame timing
          // and DOM bounds below still exercise the regression contract.
        }
      }
    })

    await page.goto('/')
    await page.getByTestId('welcome-demo-card').click()
    const visitsTabDuringLoad = page.getByRole('tab').filter({ hasText: '就診紀錄' }).first()
    await expect(visitsTabDuringLoad).toBeVisible({ timeout: 30_000 })
    const loadingTabSwitchStartedAt = await page.evaluate(() => performance.now())
    await visitsTabDuringLoad.click()
    await expect(visitsTabDuringLoad).toHaveAttribute('data-state', 'active')
    // The interaction contract is the first visible response: selected tab +
    // lightweight loading frame. The tab's heavy workspace intentionally
    // starts mounting on the following frame and is measured separately by
    // warm-switch/scroll/trend budgets below.
    await afterPaint(page)
    const loadingTabSwitchMs = await page.evaluate(
      (start) => performance.now() - start,
      loadingTabSwitchStartedAt,
    )
    expect(loadingTabSwitchMs).toBeLessThan(500)

    await expect(page.getByText('陳○明').first()).toBeVisible({ timeout: 30_000 })

    // Warm each lazily mounted workspace and any dev-server module compile.
    for (let index = 0; index < LEFT_TABS.length; index += 1) {
      await switchLeftTab(page, LEFT_TABS[index])
      await expect(page.getByTestId(`clinical-tab-content-${LEFT_TAB_CONTENT_IDS[index]}`))
        .toBeAttached()
    }
    await expect(page.getByText('完整文件', { exact: true }).first()).toBeVisible()

    const nodeCountAfterWarmup = await page.locator('*').count()
    await page.evaluate(() => { window.__mediprismaLongTasks = [] })

    const switchDurations: number[] = []
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const name of LEFT_TABS) {
        switchDurations.push(await switchLeftTab(page, name))
      }
    }

    // A warm switch should feel immediate. The high ceiling deliberately
    // tolerates shared CI runners while still catching second-long regressions.
    const warmTabSwitchP95Ms = percentile(switchDurations, 0.95)
    expect(warmTabSwitchP95Ms).toBeLessThan(500)

    const nodeCountAfterCycles = await page.locator('*').count()
    // First visit may retain a tab, but repeated switching must not append a
    // fresh copy of its clinical DOM on every cycle.
    expect(nodeCountAfterCycles).toBeLessThanOrEqual(nodeCountAfterWarmup + 150)

    await switchLeftTab(page, '報告')
    const trendOpenDurations: number[] = []
    const trendCloseDurations: number[] = []
    for (const analyte of ['WBC', 'RBC', 'HB', 'PLT', 'NEU']) {
      const trendButton = page.getByRole('button', { name: `查看 ${analyte} 趨勢`, exact: true })
      await expect(trendButton).toBeVisible()
      const startedAt = await page.evaluate(() => performance.now())
      await trendButton.click()
      await expect(page.getByTestId('cumulative-trend-detail')).toBeVisible()
      await afterTwoPaints(page)
      trendOpenDurations.push(await page.evaluate((start) => performance.now() - start, startedAt))
      const closeStartedAt = await page.evaluate(() => performance.now())
      await page.getByRole('button', { name: '關閉', exact: true }).click()
      await expect(page.getByTestId('cumulative-trend-detail')).toBeHidden()
      await afterTwoPaints(page)
      trendCloseDurations.push(await page.evaluate((start) => performance.now() - start, closeStartedAt))
    }
    const cumulativeTrendOpenP95Ms = percentile(trendOpenDurations, 0.95)
    expect(cumulativeTrendOpenP95Ms).toBeLessThan(500)
    const cumulativeTrendCloseP95Ms = percentile(trendCloseDurations, 0.95)
    expect(cumulativeTrendCloseP95Ms).toBeLessThan(350)

    await switchLeftTab(page, '用藥')
    const viewport = await activeLeftViewport(page)
    const frameIntervals = await viewport.evaluate(async (element) => {
      const intervals: number[] = []
      let previous = performance.now()
      for (let frame = 0; frame < 30; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const now = performance.now()
        intervals.push(now - previous)
        previous = now
        element.scrollTop += 120
      }
      return intervals
    })
    const medicationScrollFrameP95Ms = percentile(frameIntervals, 0.95)
    expect(medicationScrollFrameP95Ms).toBeLessThan(80)

    const longTasks = await page.evaluate(() => window.__mediprismaLongTasks ?? [])
    const longestMainThreadTaskMs = Math.max(0, ...longTasks)
    expect(longestMainThreadTaskMs).toBeLessThan(300)

    const metrics = {
      loadingTabSwitchMs,
      warmTabSwitchP95Ms,
      cumulativeTrendOpenP95Ms,
      cumulativeTrendCloseP95Ms,
      medicationScrollFrameP95Ms,
      longestMainThreadTaskMs,
      retainedDomGrowth: nodeCountAfterCycles - nodeCountAfterWarmup,
      samples: {
        warmTabSwitches: switchDurations.length,
        cumulativeTrendOpens: trendOpenDurations.length,
        cumulativeTrendCloses: trendCloseDurations.length,
        medicationScrollFrames: frameIntervals.length,
        longTasks: longTasks.length,
      },
      distributions: {
        cumulativeTrendOpenMs: trendOpenDurations,
        cumulativeTrendCloseMs: trendCloseDurations,
      },
    }

    await testInfo.attach('performance-metrics', {
      body: Buffer.from(`${JSON.stringify(metrics, null, 2)}\n`),
      contentType: 'application/json',
    })
    console.log(`[performance-metrics] ${JSON.stringify(metrics)}`)
  })
})
