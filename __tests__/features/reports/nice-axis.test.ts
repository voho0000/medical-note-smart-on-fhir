// The trend chart's Y axis used a raw [min−pad, max+pad] domain, so recharts
// emitted ugly data-derived ticks (5.751, 4.339…) plus a floating-point
// artifact at the foot. niceAxis rounds the range to clean steps instead.
import { niceAxis } from '@/features/clinical-summary/reports/components/ObservationTrendChart'

describe('niceAxis', () => {
  it('rounds an albumin-style range to 0.5 steps', () => {
    // data 3.2–4.4 plus reference band 3.5–5.5 → callers pass [3.2, 5.5]
    const { domain, ticks } = niceAxis(3.2, 5.5)
    expect(domain).toEqual([3, 5.5])
    expect(ticks).toEqual([3, 3.5, 4, 4.5, 5, 5.5])
  })

  it('keeps every tick a clean multiple of the step (no float artifacts)', () => {
    const { ticks } = niceAxis(3.2, 5.5)
    for (const t of ticks) {
      expect(Number.isInteger(t * 2)).toBe(true) // all land on a 0.5 grid
    }
  })

  it('scales the step up for wide ranges', () => {
    expect(niceAxis(0, 250).ticks).toEqual([0, 50, 100, 150, 200, 250])
    expect(niceAxis(133, 147).ticks).toEqual([130, 135, 140, 145, 150])
  })

  it('pads a flat (single repeated value) series instead of collapsing', () => {
    const { domain, ticks } = niceAxis(5, 5)
    expect(domain[0]).toBeLessThan(5)
    expect(domain[1]).toBeGreaterThan(5)
    expect(ticks.length).toBeGreaterThan(1)
  })

  it('is resilient to degenerate input', () => {
    expect(niceAxis(NaN, 5)).toEqual({ domain: [0, 1], ticks: [0, 1] })
    expect(niceAxis(10, 2)).toEqual({ domain: [0, 1], ticks: [0, 1] })
  })
})
