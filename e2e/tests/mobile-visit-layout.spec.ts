import { expect, test } from '../fixtures/test'

test.describe('mobile visit row layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps four visit statistics visible without overlap or scrolling', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('medical-note-locale', 'zh-TW')
      localStorage.setItem('medical-note-audience', 'medical')
      localStorage.setItem('medical-note-audience-selected', '1')
      localStorage.setItem('medical-note-onboarding-v1', '1')
      localStorage.setItem('medical-note-left-browser-tour-v1', '1')
    })

    await page.goto('/')
    await page.getByTestId('welcome-demo-card').click()
    await expect(page.locator('span:visible').filter({ hasText: '陳○明' }).first())
      .toBeVisible({ timeout: 30_000 })
    await page.locator('[role="tab"]:visible').filter({ hasText: '就診紀錄' }).first().click()

    const crowdedStats = page
      .locator('[data-testid="visit-stat-strip"]')
      .filter({ has: page.locator('[data-visit-stat="abnormal"]') })
      .first()
    await expect(crowdedStats).toBeAttached()

    const geometry = await crowdedStats.evaluate((stats) => {
      const grid = stats.closest('[data-testid="visit-row-grid"]')
      const primary = grid?.querySelector('[data-testid="visit-primary-metadata"]')
      const context = grid?.querySelector('[data-testid="visit-context-row"]')
      const arrow = grid?.querySelector('[data-testid="visit-expand-action"]')
      if (!grid || !primary || !context || !arrow) throw new Error('visit row layout is incomplete')

      const primaryRect = primary.getBoundingClientRect()
      const statsRect = stats.getBoundingClientRect()
      const contextRect = context.getBoundingClientRect()
      const arrowRect = arrow.getBoundingClientRect()
      const visibleStatistics = [...stats.querySelectorAll('[data-visit-stat]')]
        .filter((item) => getComputedStyle(item).display !== 'none')
      // Stress the compact number cells with the widest expected routine case.
      // This catches a future padding/font regression that only clips when all
      // four values contain two digits.
      for (const statistic of visibleStatistics) {
        const value = statistic.querySelector('.tabular-nums')
        if (value) value.textContent = '88'
      }
      return {
        primaryBottom: primaryRect.bottom,
        primaryRight: primaryRect.right,
        statsTop: statsRect.top,
        statsLeft: statsRect.left,
        contextRight: contextRect.right,
        arrowLeft: arrowRect.left,
        visibleStatisticCount: visibleStatistics.length,
        statsClientWidth: stats.clientWidth,
        statsScrollWidth: stats.scrollWidth,
        overflowX: getComputedStyle(stats).overflowX,
        statisticBorders: [...stats.querySelectorAll('[data-visit-stat]')]
          .map((item) => getComputedStyle(item).borderLeftWidth),
        pageScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    // Row one owns the primary metadata and arrow. Statistics move to row two
    // and never overlap the ICD/context column, even when four badges exist.
    expect(geometry.primaryRight).toBeLessThanOrEqual(geometry.arrowLeft)
    expect(geometry.statsTop).toBeGreaterThanOrEqual(geometry.primaryBottom - 1)
    expect(geometry.contextRight).toBeLessThanOrEqual(geometry.statsLeft)
    expect(geometry.visibleStatisticCount).toBe(4)
    expect(geometry.overflowX).toBe('hidden')
    expect(geometry.statsScrollWidth).toBeLessThanOrEqual(geometry.statsClientWidth)
    expect(geometry.statisticBorders.every((width) => width === '0px')).toBe(true)
    expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)

    const row = crowdedStats.locator('xpath=..')
    await expect(row.getByTestId('visit-channel-label')).toBeHidden()
    await expect(row.getByTestId('visit-icd-field-label')).toBeHidden()
  })
})

test.describe('desktop visit row layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('keeps every statistic at its intrinsic width', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('medical-note-locale', 'zh-TW')
      localStorage.setItem('medical-note-audience', 'medical')
      localStorage.setItem('medical-note-audience-selected', '1')
      localStorage.setItem('medical-note-onboarding-v1', '1')
      localStorage.setItem('medical-note-left-browser-tour-v1', '1')
    })

    await page.goto('/')
    await page.getByTestId('welcome-demo-card').click()
    await expect(page.locator('span:visible').filter({ hasText: '陳○明' }).first())
      .toBeVisible({ timeout: 30_000 })
    await page.locator('[role="tab"]:visible').filter({ hasText: '就診紀錄' }).first().click()

    const crowdedStats = page
      .locator('[data-testid="visit-stat-strip"]')
      .filter({ has: page.locator('[data-visit-stat="abnormal"]') })
      .first()
    await expect(crowdedStats).toBeAttached()

    const layout = await crowdedStats.evaluate((stats) => {
      const items = [...stats.querySelectorAll('[data-visit-stat]')]
        .filter((item) => getComputedStyle(item).display !== 'none')
        .map((item) => {
          const rect = item.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        })
      return {
        itemCount: items.length,
        overlap: items.slice(1).some((item, index) => item.left < items[index].right),
        overflowX: getComputedStyle(stats).overflowX,
        pageScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    expect(layout.itemCount).toBeGreaterThanOrEqual(4)
    expect(layout.overlap).toBe(false)
    expect(layout.overflowX).toBe('visible')
    expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewportWidth)
  })
})
