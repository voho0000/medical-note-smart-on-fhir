// Pure selectors behind the 總覽 tab. Runs under TZ=Asia/Taipei (npm test).
import {
  buildOverviewWindow,
  classifyMedicationChanges,
  fitGroupedRows,
  fitRows,
  isOverviewPinnedAnalyte,
  isWithinOverviewWindow,
  monthTicks,
  OVERVIEW_PINNED_ANALYTES,
  overlapsOverviewWindow,
  toDayKey,
  windowOffsetPercent,
  type OverviewMedFact,
  type OverviewWindow,
} from '@/features/clinical-summary/overview/utils/overview-selectors'

const at = (iso: string) => new Date(iso).getTime()

describe('buildOverviewWindow', () => {
  it('anchors on today and reaches back whole calendar months, both ends inclusive', () => {
    const window = buildOverviewWindow(3, at('2026-09-09T10:30:00+08:00'))
    expect(window).toEqual({ months: 3, startDay: '2026-06-09', endDay: '2026-09-09' })
  })

  it('clamps the start day to the target month length instead of overflowing', () => {
    // 31 May − 3 months is 28 February, never 3 March.
    expect(buildOverviewWindow(3, at('2026-05-31T09:00:00+08:00')).startDay).toBe('2026-02-28')
  })

  it('crosses the year boundary for the 6-month range', () => {
    expect(buildOverviewWindow(6, at('2026-02-15T09:00:00+08:00'))).toEqual({
      months: 6,
      startDay: '2025-08-15',
      endDay: '2026-02-15',
    })
  })

  it('supports a one-year range', () => {
    expect(buildOverviewWindow(12, at('2026-09-09T09:00:00+08:00'))).toEqual({
      months: 12,
      startDay: '2025-09-09',
      endDay: '2026-09-09',
    })
  })
})

describe('toDayKey', () => {
  it('keeps the day the SOURCE recorded rather than re-projecting the offset', () => {
    // A 00:30 draw in Taipei must stay on the 19th, not slip to the 18th.
    expect(toDayKey('2026-08-19T00:30:00+08:00')).toBe('2026-08-19')
    expect(toDayKey('2026-08-19')).toBe('2026-08-19')
  })

  it('returns undefined for absent or unparseable values', () => {
    expect(toDayKey(undefined)).toBeUndefined()
    expect(toDayKey('')).toBeUndefined()
    expect(toDayKey('not a date')).toBeUndefined()
    expect(toDayKey(null)).toBeUndefined()
  })
})

describe('isWithinOverviewWindow', () => {
  const window = buildOverviewWindow(3, at('2026-09-09T08:00:00+08:00'))

  it('includes both boundary days', () => {
    expect(isWithinOverviewWindow('2026-06-09T23:59:00+08:00', window)).toBe(true)
    expect(isWithinOverviewWindow('2026-09-09T00:00:00+08:00', window)).toBe(true)
  })

  it('excludes the days just outside', () => {
    expect(isWithinOverviewWindow('2026-06-08T23:59:00+08:00', window)).toBe(false)
    expect(isWithinOverviewWindow('2026-09-10T00:00:00+08:00', window)).toBe(false)
  })

  it('never admits an undated record', () => {
    expect(isWithinOverviewWindow(undefined, window)).toBe(false)
  })
})

describe('overlapsOverviewWindow', () => {
  const window = buildOverviewWindow(1, at('2026-09-09T08:00:00+08:00'))

  it('accepts a stay that began before the window but ended inside it', () => {
    expect(overlapsOverviewWindow('2026-08-01', '2026-08-12', window)).toBe(true)
  })

  it('accepts an open-ended period that started inside the window', () => {
    expect(overlapsOverviewWindow('2026-08-20', undefined, window)).toBe(true)
  })

  it('rejects a period that closed before the window opened', () => {
    expect(overlapsOverviewWindow('2026-06-01', '2026-08-08', window)).toBe(false)
  })

  it('rejects a record with no dates at all', () => {
    expect(overlapsOverviewWindow(undefined, undefined, window)).toBe(false)
  })
})

describe('fitRows', () => {
  it('shows the whole list when it fits and reserves no truncation line', () => {
    // 200 − 4 slack = 196 usable → 9 row slots for a 5-row list.
    expect(fitRows(200, 20, 0, 5)).toBe(5)
  })

  it('reserves the truncation line when the list does not fit', () => {
    // 204 − 4 slack = 200 → 10 rows bare, but the note costs 24 → 8 rows.
    expect(fitRows(204, 20, 0, 30)).toBe(8)
  })

  it('charges the header before the rows', () => {
    expect(fitRows(204, 20, 100, 30)).toBe(3)
  })

  it('returns 0 when the header alone exceeds the box', () => {
    expect(fitRows(40, 20, 60, 9)).toBe(0)
  })

  it('falls back to the full list while the container is unmeasured', () => {
    expect(fitRows(0, 20, 0, 7)).toBe(7)
    expect(fitRows(Number.NaN, 20, 0, 7)).toBe(7)
  })

  it('is 0 rows for an empty list regardless of space', () => {
    expect(fitRows(500, 20, 0, 0)).toBe(0)
  })
})

describe('fitGroupedRows', () => {
  const options = { rowPx: 20, groupPx: 10, headerPx: 0 }

  it('charges a divider only where the group actually changes', () => {
    // 3 rows in one group cost 10 + 3×20 = 70, not 3 dividers.
    expect(fitGroupedRows(74, ['a', 'a', 'a'], options)).toBe(3)
  })

  it('fits more rows when they share groups than when the groups alternate', () => {
    // The same six rows: two dividers when contiguous (140px, all fit), six
    // when interleaved (30px per row, so the list truncates).
    expect(fitGroupedRows(160, ['a', 'a', 'a', 'b', 'b', 'b'], options)).toBe(6)
    expect(fitGroupedRows(160, ['a', 'b', 'a', 'b', 'a', 'b'], options)).toBe(4)
  })

  it('reserves the truncation line only when something is left out', () => {
    expect(fitGroupedRows(200, ['a', 'a'], options)).toBe(2)
    expect(fitGroupedRows(58, ['a', 'a', 'a'], options)).toBe(1)
  })

  it('returns the whole list while the container is unmeasured', () => {
    expect(fitGroupedRows(0, ['a', 'b'], options)).toBe(2)
  })

  it('is 0 for an empty list and for a box the header already fills', () => {
    expect(fitGroupedRows(500, [], options)).toBe(0)
    expect(fitGroupedRows(30, ['a', 'b'], { ...options, headerPx: 40 })).toBe(0)
  })
})

describe('classifyMedicationChanges', () => {
  const window: OverviewWindow = buildOverviewWindow(3, at('2026-09-09T08:00:00+08:00'))
  const fact = (over: Partial<OverviewMedFact> & { key: string }): OverviewMedFact => ({
    isActive: true,
    ...over,
  })

  it('marks 新增 when the earliest record of the therapy starts inside the window', () => {
    const verdicts = classifyMedicationChanges(
      [fact({ key: 'jardiance', startDay: '2026-08-19' })],
      window,
    )
    expect(verdicts.get('jardiance')).toEqual({ kind: 'added' })
  })

  it('does NOT mark 新增 when the same therapy already existed before the window', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'metformin', startDay: '2025-11-02', doseSignature: '500 mg · BID' }),
        fact({ key: 'metformin', startDay: '2026-08-19', doseSignature: '500 mg · BID' }),
      ],
      window,
    )
    expect(verdicts.get('metformin')).toBeUndefined()
  })

  it('marks 停用 when nothing is active and the last coverage day falls inside the window', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'norvasc', startDay: '2025-01-01', endDay: '2026-07-26', isActive: false }),
      ],
      window,
    )
    expect(verdicts.get('norvasc')).toEqual({ kind: 'stopped' })
  })

  it('does NOT mark 停用 while another fill of the same therapy is still running', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'concor', startDay: '2025-01-01', endDay: '2026-07-26', isActive: false }),
        fact({ key: 'concor', startDay: '2026-07-26', isActive: true }),
      ],
      window,
    )
    expect(verdicts.get('concor')).toBeUndefined()
  })

  it('marks 調整 with the pre-window dose when the signature changed', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'concor', startDay: '2026-03-10', doseSignature: '2.5 mg · QD' }),
        fact({ key: 'concor', startDay: '2026-08-19', doseSignature: '5 mg · QD' }),
      ],
      window,
    )
    expect(verdicts.get('concor')).toEqual({ kind: 'adjusted', previousDose: '2.5 mg · QD' })
  })

  it('stays silent when the source never stated a dose (判不出 → no badge)', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'unknown-dose', startDay: '2026-03-10' }),
        fact({ key: 'unknown-dose', startDay: '2026-08-19' }),
      ],
      window,
    )
    expect(verdicts.get('unknown-dose')).toBeUndefined()
  })

  it('stays silent when the dose is unchanged across the window boundary', () => {
    const verdicts = classifyMedicationChanges(
      [
        fact({ key: 'lipitor', startDay: '2026-03-10', doseSignature: '20 mg · HS' }),
        fact({ key: 'lipitor', startDay: '2026-08-19', doseSignature: '20 mg · HS' }),
      ],
      window,
    )
    expect(verdicts.get('lipitor')).toBeUndefined()
  })

  it('ignores facts with no key rather than bucketing them together', () => {
    expect(classifyMedicationChanges([fact({ key: '', startDay: '2026-08-19' })], window).size)
      .toBe(0)
  })
})

describe('timeline geometry', () => {
  const window = buildOverviewWindow(3, at('2026-09-09T08:00:00+08:00'))

  it('maps the window ends to 0% and 100%', () => {
    expect(windowOffsetPercent('2026-06-09', window)).toBe(0)
    expect(windowOffsetPercent('2026-09-09', window)).toBe(100)
  })

  it('clamps a day outside the window into the strip', () => {
    expect(windowOffsetPercent('2026-05-01', window)).toBe(0)
    expect(windowOffsetPercent('2026-12-01', window)).toBe(100)
  })

  it('emits one tick per first-of-month inside the window', () => {
    expect(monthTicks(window).map((tick) => tick.day)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
  })
})

describe('OVERVIEW_PINNED_ANALYTES', () => {
  it('is the clinician short list, in chart-reading order', () => {
    expect(OVERVIEW_PINNED_ANALYTES).toEqual({
      cbc: ['WBC', 'HB', 'PLT'],
      chem: ['CREA', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'ALT'],
    })
  })

  it('is scoped by category so urine WBC / CREA never join the blood panel', () => {
    expect(isOverviewPinnedAnalyte('cbc', 'WBC')).toBe(true)
    expect(isOverviewPinnedAnalyte('urine', 'WBC')).toBe(false)
    expect(isOverviewPinnedAnalyte('chem', 'CREA')).toBe(true)
    expect(isOverviewPinnedAnalyte('urine', 'CREA')).toBe(false)
  })

  it('accepts every canonical eGFR formula key, since sources differ', () => {
    for (const key of ['EGFR', 'EGFR(EPI)', 'EGFR(M)']) {
      expect(isOverviewPinnedAnalyte('chem', key)).toBe(true)
    }
  })

  it('leaves the differential and the liver panel to 全部', () => {
    for (const key of ['NEU', 'LYM', 'MONO', 'EOS', 'BASO', 'HCT', 'MCV']) {
      expect(isOverviewPinnedAnalyte('cbc', key)).toBe(false)
    }
    expect(isOverviewPinnedAnalyte('chem', 'AST')).toBe(false)
    expect(isOverviewPinnedAnalyte('chem', 'BUN')).toBe(false)
  })
})
