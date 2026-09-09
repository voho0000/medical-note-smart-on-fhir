import { preferredSplitPercent } from '@/src/shared/hooks/layout/use-resizable-layout.hook'

// 1016px is OVERVIEW_WIDE_PANEL_PX — the left panel width at which 總覽
// renders its 2×2 grid.
const TARGET = 1016

describe('preferredSplitPercent', () => {
  it('widens a 1600px display just enough for the grid', () => {
    // 1600 viewport − 16px of workspace padding.
    expect(preferredSplitPercent(1584, TARGET, 50, 70)).toBeCloseTo(64.14, 1)
  })

  it('keeps the even split when the cap cannot reach the target', () => {
    // A 1280px laptop would need 80% — more than the 70% cap allows.
    expect(preferredSplitPercent(1264, TARGET, 50, 70)).toBeNull()
  })

  it('never narrows a split that is already wider than needed', () => {
    expect(preferredSplitPercent(2544, TARGET, 50, 70)).toBe(50)
  })

  it('returns null for a container it cannot measure yet', () => {
    expect(preferredSplitPercent(0, TARGET, 50, 70)).toBeNull()
    expect(preferredSplitPercent(1584, 0, 50, 70)).toBeNull()
  })
})
