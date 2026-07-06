import {
  SEVERITY_RANK,
  countBySeverity,
  normaliseCategory,
  type SafetyAlert,
} from '@/src/core/entities/safety-alert.entity'

const alert = (severity: SafetyAlert['severity'], id: string): SafetyAlert => ({
  id,
  severity,
  title: `t-${id}`,
  detail: 'd',
  evidence: [],
  sources: [],
  category: 'other',
})

describe('SEVERITY_RANK', () => {
  it('orders high → medium → low for a deterministic sort', () => {
    const shuffled = [alert('low', '1'), alert('high', '2'), alert('medium', '3')]
    const sorted = [...shuffled].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    expect(sorted.map((a) => a.severity)).toEqual(['high', 'medium', 'low'])
  })
})

describe('countBySeverity', () => {
  it('tallies each severity', () => {
    const alerts = [
      alert('high', '1'),
      alert('high', '2'),
      alert('medium', '3'),
      alert('low', '4'),
      alert('low', '5'),
      alert('low', '6'),
    ]
    expect(countBySeverity(alerts)).toEqual({ high: 2, medium: 1, low: 3 })
  })

  it('returns all-zero for an empty list', () => {
    expect(countBySeverity([])).toEqual({ high: 0, medium: 0, low: 0 })
  })
})

describe('normaliseCategory', () => {
  it('keeps a known category and coerces the rest to other', () => {
    expect(normaliseCategory('renal')).toBe('renal')
    expect(normaliseCategory('RENAL')).toBe('renal')
    expect(normaliseCategory('made-up')).toBe('other')
    expect(normaliseCategory(undefined)).toBe('other')
  })
})
