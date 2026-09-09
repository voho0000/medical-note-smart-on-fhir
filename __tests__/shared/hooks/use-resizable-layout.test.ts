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

// The divider's step-then-collapse rule, as the shell applies it (page.tsx).
// Extracted here as the plain predicate it is: "is there still centre to
// travel to in this direction?"
const EVEN = 50
const EPS = 1
const stepsToCentre = (leftWidth: number, direction: 'left' | 'right') => (
  direction === 'left' ? leftWidth > EVEN + EPS : leftWidth < EVEN - EPS
)

describe('divider step-then-collapse', () => {
  it('travels back to centre first from the overview default (~64%)', () => {
    expect(stepsToCentre(64.1, 'left')).toBe(true)
  })

  it('collapses on the click after, once centred', () => {
    expect(stepsToCentre(50, 'left')).toBe(false)
    expect(stepsToCentre(50, 'right')).toBe(false)
  })

  it('does not treat a hand-dragged near-centre split as off-centre', () => {
    expect(stepsToCentre(50.4, 'left')).toBe(false)
    expect(stepsToCentre(49.6, 'right')).toBe(false)
  })

  it('collapses at once when the centre is behind you', () => {
    // Already wide on the left: nothing to travel to on the way right.
    expect(stepsToCentre(64.1, 'right')).toBe(false)
    // Mirror image.
    expect(stepsToCentre(34, 'left')).toBe(false)
    expect(stepsToCentre(34, 'right')).toBe(true)
  })
})
