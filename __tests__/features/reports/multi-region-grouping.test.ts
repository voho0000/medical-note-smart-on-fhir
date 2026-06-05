// Multi-region NHI imaging grouping — same (code, date, hospital) collapsed
// into one synthetic group row + ambiguity flag, per bridge v0.17.1 spec.

import {
  groupMultiRegionStudies,
  hasAmbiguousAssociation,
} from '@/features/clinical-summary/reports/utils/multi-region-grouping'
import type { Row, Observation } from '@/features/clinical-summary/reports/types'

const longText = 'Computed Tomography of the chest without contrast. Findings: minimal patchy consolidation at bilateral upper lobes; no evidence of mass. Impression: no significant abnormality.'

function narrativeObs(text: string): Observation {
  return {
    id: 'o-' + Math.random().toString(36).slice(2, 8),
    code: { text: 'Report Summary' },
    valueString: text,
  } as Observation
}

function row(over: Partial<Row>): Row {
  return {
    id: over.id || 'r-' + Math.random().toString(36).slice(2, 8),
    title: '電腦斷層造影 - 無造影劑',
    rawTitle: '電腦斷層造影 - 無造影劑',
    meta: 'Radiology • final',
    obs: [],
    group: 'imaging',
    institution: '長庚嘉義',
    effectiveDate: '2025-02-14T00:00:00+08:00',
    ...over,
  }
}

describe('hasAmbiguousAssociation', () => {
  it('returns false for a single row', () => {
    expect(hasAmbiguousAssociation([row({ obs: [narrativeObs(longText)] })])).toBe(false)
  })

  it('returns false for 1 narrative + 1 image (the unambiguous baseline)', () => {
    expect(
      hasAmbiguousAssociation([
        row({ id: 'a', obs: [narrativeObs(longText)] }),
        row({ id: 'b', images: [{ contentType: 'image/jpeg', size: 90000 }] }),
      ]),
    ).toBe(false)
  })

  it('flags ≥2 narrative-only rows (multi-region study)', () => {
    expect(
      hasAmbiguousAssociation([
        row({ id: 'a', obs: [narrativeObs(longText)] }),
        row({ id: 'b', obs: [narrativeObs('CT of head…and the brain shows no acute infarct') ] }),
      ]),
    ).toBe(true)
  })

  it('flags 1 narrative + 2 image sets (mixed ambiguous)', () => {
    expect(
      hasAmbiguousAssociation([
        row({ id: 'a', obs: [narrativeObs(longText)] }),
        row({ id: 'b', images: [{ contentType: 'image/jpeg', size: 90000 }] }),
        row({ id: 'c', images: [{ contentType: 'image/jpeg', size: 160000 }] }),
      ]),
    ).toBe(true)
  })
})

describe('groupMultiRegionStudies', () => {
  it('passes single-row clusters through unchanged', () => {
    const a = row({ id: 'a', obs: [narrativeObs(longText)] })
    const out = groupMultiRegionStudies([a])
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(a)
    expect(out[0].groupedRows).toBeUndefined()
  })

  it('collapses same-(code,date,hospital) rows into one synthetic group', () => {
    const a = row({ id: 'a', obs: [narrativeObs('Head CT findings: brain shows no infarct') ] })
    const b = row({ id: 'b', obs: [narrativeObs('Chest CT findings: minimal consolidation') ] })
    const c = row({ id: 'c', images: [{ contentType: 'image/jpeg', size: 94000 }] })
    const out = groupMultiRegionStudies([a, b, c])
    expect(out).toHaveLength(1)
    expect(out[0].groupedRows).toEqual([a, b, c])
    expect(out[0].hasAmbiguity).toBe(true)
    expect(out[0].id).toContain('group:')
  })

  it('keeps unrelated rows separate (different date, code, or hospital)', () => {
    const a = row({ id: 'a' })
    const differentDate = row({ id: 'b', effectiveDate: '2025-02-15T00:00:00+08:00' })
    const differentHospital = row({ id: 'c', institution: '臺北榮總' })
    const differentCode = row({ id: 'd', rawTitle: '電腦斷層造影 - 含造影劑' })
    const out = groupMultiRegionStudies([a, differentDate, differentHospital, differentCode])
    expect(out).toHaveLength(4)
    expect(out.every((r) => !r.groupedRows)).toBe(true)
  })

  it('preserves original order, placing the group at the earliest position', () => {
    const before = row({ id: 'before', effectiveDate: '2025-02-15T00:00:00+08:00' })
    const groupA = row({ id: 'gA', obs: [narrativeObs('Head CT …') ] })
    const between = row({ id: 'between', effectiveDate: '2025-02-13T00:00:00+08:00' })
    const groupB = row({ id: 'gB', obs: [narrativeObs('Chest CT …') ] })
    const out = groupMultiRegionStudies([before, groupA, between, groupB])
    expect(out.map((r) => r.id)).toEqual([
      'before',
      expect.stringContaining('group:'),
      'between',
    ])
  })

  it('does not flag ambiguity when only one row is in a single-member cluster', () => {
    const a = row({ id: 'a', obs: [narrativeObs(longText)] })
    const out = groupMultiRegionStudies([a])
    expect(out[0].hasAmbiguity).toBeUndefined()
  })
})
