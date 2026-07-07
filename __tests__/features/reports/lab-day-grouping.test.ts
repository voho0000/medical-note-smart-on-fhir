// Lab collection-day grouping — 健保存摺 one-DR-per-analyte fragmentation
// folded into one group row per (collection day, institution, lab category):
// the hospital reading unit,「血液一份報告、生化一份報告」. Pins the
// separation rules (multi-org and multi-category days split; undated rows
// never group), the deterministic card stack order, and the member ordering.

import {
  groupLabReportsByDay,
  countAbnormalInRows,
  dayGroupLabelIds,
} from '@/features/clinical-summary/reports/utils/lab-day-grouping'
import type { Row, Observation } from '@/features/clinical-summary/reports/types'

function obs(codeText: string, over: Partial<Observation> = {}): Observation {
  return {
    id: 'o-' + codeText,
    code: { text: codeText },
    valueQuantity: { value: 1, unit: 'x' },
    ...over,
  } as Observation
}

let seq = 0
function labRow(over: Partial<Row>): Row {
  seq += 1
  return {
    id: `dr-${seq}`,
    title: over.title ?? `Report ${seq}`,
    meta: 'Laboratory • final',
    obs: [],
    group: 'lab',
    ...over,
  } as Row
}

beforeEach(() => {
  seq = 0
})

describe('groupLabReportsByDay', () => {
  it('separates same-day reports from DIFFERENT institutions into different cards', () => {
    // Same category (cbc) everywhere so the org boundary is what's tested.
    const rows = [
      labRow({ title: 'WBC', institution: '臺北榮總', effectiveDate: '2026-01-14T08:00:00+08:00', obs: [obs('WBC')] }),
      labRow({ title: 'HB', institution: '臺北榮總', effectiveDate: '2026-01-14T08:00:00+08:00', obs: [obs('HB')] }),
      labRow({ title: 'PLT', institution: '示範長青醫院', effectiveDate: '2026-01-14T14:00:00+08:00', obs: [obs('PLT')] }),
      labRow({ title: 'RBC', institution: '示範長青醫院', effectiveDate: '2026-01-14T14:00:00+08:00', obs: [obs('RBC')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.dayGroup)).toBe(true)
    const orgs = out.map((r) => r.institution).sort()
    expect(orgs).toEqual(['臺北榮總', '示範長青醫院'].sort())
    // Distinct synthetic ids — virtualizer keys must not collide.
    expect(out[0].id).not.toBe(out[1].id)
  })

  it('splits one day into per-category cards, stacked in LAB_CATEGORIES order', () => {
    // Hospital model: 血液 one report, 生化 one report — never one mega-sheet.
    const rows = [
      labRow({ title: 'BUN', institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('BUN')] }),
      labRow({ title: 'HB', institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('HB')] }),
      labRow({ title: 'WBC', institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('WBC')] }),
      labRow({ title: 'CREA', institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('CREA')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
    // cbc before chem — deterministic stack order, not arrival order.
    expect(out.map((r) => r.dayGroupCategoryId)).toEqual(['cbc', 'chem'])
    expect(out[0].groupedRows?.map((m) => m.title)).toEqual(['WBC', 'HB']) // preferredOrder
    expect(out[1].groupedRows?.map((m) => m.title)).toEqual(['BUN', 'CREA'])
  })

  it('groups same-day same-institution same-category reports into ONE card', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('BUN')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('CREA')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].dayGroup).toBe(true)
    expect(out[0].dayGroupCategoryId).toBe('chem')
    expect(out[0].groupedRows).toHaveLength(2)
  })

  it('splits different days at the same institution, newest day first', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('WBC')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-15', obs: [obs('WBC')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.effectiveDate)).toEqual(['2026-01-15', '2026-01-14'])
  })

  it('treats a missing institution as its own card, separate from named orgs that day', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('WBC')] }),
      labRow({ institution: undefined, effectiveDate: '2026-01-14', obs: [obs('HB')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
  })

  it('wraps single-report clusters too (uniform card shape)', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('TSH')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-15', obs: [obs('WBC')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-15', obs: [obs('HB')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.dayGroup)).toBe(true)
    const single = out.find((r) => r.effectiveDate === '2026-01-14')
    expect(single?.groupedRows).toHaveLength(1)
  })

  it('passes undated rows through flat — never grouped, never hidden — after dated cards', () => {
    const rows = [
      labRow({ title: 'MYSTERY', institution: 'A院', effectiveDate: undefined, obs: [obs('MYSTERY')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('WBC')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('HB')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(2)
    expect(out[0].dayGroup).toBe(true)
    expect(out[1].dayGroup).toBeUndefined()
    expect(out[1].title).toBe('MYSTERY')
  })

  it('keeps same-day serial repeats of one analyte in ONE card, adjacent, newest first', () => {
    // q6h serial troponin — three DRs, same day, same institution. TROP is a
    // chem analyte, so they share the 生化 card and sit together in it.
    const rows = [
      labRow({ title: 'Troponin I', institution: 'A院', effectiveDate: '2026-01-14T06:00:00+08:00', obs: [obs('Troponin I')] }),
      labRow({ title: 'BUN', institution: 'A院', effectiveDate: '2026-01-14T06:00:00+08:00', obs: [obs('BUN')] }),
      labRow({ title: 'Troponin I', institution: 'A院', effectiveDate: '2026-01-14T18:00:00+08:00', obs: [obs('Troponin I')] }),
      labRow({ title: 'Troponin I', institution: 'A院', effectiveDate: '2026-01-14T12:00:00+08:00', obs: [obs('Troponin I')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].dayGroupCategoryId).toBe('chem')
    const members = out[0].groupedRows!
    const idx = members.findIndex((m) => m.title === 'Troponin I')
    // Adjacent (same sort bucket) and newest first — deterministic, not
    // stable-sort luck. The time badge (hideMeta + showTime) shows the order.
    expect(members.slice(idx, idx + 3).every((m) => m.title === 'Troponin I')).toBe(true)
    expect(members.filter((m) => m.title === 'Troponin I').map((m) => m.effectiveDate)).toEqual([
      '2026-01-14T18:00:00+08:00',
      '2026-01-14T12:00:00+08:00',
      '2026-01-14T06:00:00+08:00',
    ])
  })

  it('does not re-assert per-report dup flags on the synthetic card row', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('WBC')], isPossibleDuplicate: true, bridgeDupCount: 2 }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [obs('HB')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out[0].isPossibleDuplicate).toBeUndefined()
    expect(out[0].bridgeDupCount).toBeUndefined()
    // …but the member keeps them (badges stay visible inside the card).
    const wbc = out[0].groupedRows?.find((m) => m.bridgeDupCount)
    expect(wbc?.bridgeDupCount).toBe(2)
  })
})

describe('glucose folds into 生化 in the day cards (day-card taxonomy tweak)', () => {
  // User decision 2026-07-07: plain blood glucose AND HbA1c run on the chem
  // analyzer and belong in the 生化 card, not a lone 血糖 card. Only C-peptide
  // (endocrine, not spot chemistry) stays separate. Cumulative report keeps its
  // 血糖 sub-tab (not exercised here — this is the day-card grouping only).
  const loincObs = (text: string, loinc: string): Observation =>
    ({ id: 'o-' + text, code: { text, coding: [{ system: 'http://loinc.org', code: loinc }] }, valueQuantity: { value: 1, unit: 'x' } } as Observation)

  it('plain glucose (GLU-AC) joins the 生化 card, no separate 血糖 card', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('BUN', '3094-0')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('GLU-AC', '2345-7')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].dayGroupCategoryId).toBe('chem')
    expect(out[0].groupedRows).toHaveLength(2)
  })

  it('HbA1c folds into the 生化 card alongside plain glucose (one card)', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('GLU-AC', '2345-7')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('HbA1c', '4548-4')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].dayGroupCategoryId).toBe('chem')
    expect(out[0].groupedRows).toHaveLength(2)
    // both are glucose-category members, so the chip reads 血糖 (not 生化・血糖)
    expect(out[0].dayGroupLabelIds).toEqual(['glucose'])
  })

  it('HbA1c joins a real 生化 panel on the same day (生化・血糖 card)', () => {
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('BUN', '3094-0')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('HbA1c', '4548-4')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].dayGroupCategoryId).toBe('chem')
    expect(out[0].dayGroupLabelIds).toEqual(['chem', 'glucose'])
  })

  it('labels the chem card by ACTUAL contents (生化 / 血糖 / 生化・血糖)', () => {
    const loincObs = (t: string, l: string): Observation =>
      ({ id: 'o-' + t, code: { text: t, coding: [{ system: 'http://loinc.org', code: l }] }, valueQuantity: { value: 1, unit: 'x' } } as Observation)
    const chemRow = () => labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('BUN', '3094-0')] })
    const gluRow = () => labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('GLU-AC', '2345-7')] })
    // all glucose → 血糖
    expect(groupLabReportsByDay([gluRow(), gluRow()])[0].dayGroupLabelIds).toEqual(['glucose'])
    // chem + glucose → 生化・血糖 (chem first)
    expect(groupLabReportsByDay([chemRow(), gluRow()])[0].dayGroupLabelIds).toEqual(['chem', 'glucose'])
    // chem only → 生化
    expect(groupLabReportsByDay([chemRow(), chemRow()])[0].dayGroupLabelIds).toEqual(['chem'])
    // non-chem clusters name their single category
    expect(dayGroupLabelIds('cbc', [])).toEqual(['cbc'])
  })

  it('C-peptide sits in its own 內分泌 card, never folded into 生化', () => {
    // C-peptide categorises as endocrine (not glucose), so it's inherently
    // separate from the folded plain glucose — a lone glucose fold must not
    // drag it in.
    const rows = [
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('GLU-AC', '2345-7')] }),
      labRow({ institution: 'A院', effectiveDate: '2026-01-14', obs: [loincObs('C-Peptide', '1986-9')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out.map((r) => r.dayGroupCategoryId).sort()).toEqual(['chem', 'endocrine'])
  })
})

describe('grouping invariants — hostile/foreign bundle shapes', () => {
  // The fear this pins down: 換一個健康存摺來源，分組會不會把資料弄丟/弄重?
  // For ANY input, the output must be an exact partition of the input rows:
  // every DR appears exactly once — either flat or as a member of exactly
  // one card. Categorisation quality may degrade (→ 其他); presence may not.
  it('partitions ANY input exactly — no row lost, none duplicated', () => {
    const hostile: Row[] = [
      labRow({ effectiveDate: undefined, institution: undefined, obs: [] }), // nothing at all
      labRow({ effectiveDate: '2026-01-14T23:50:00Z', institution: 'A院', obs: [obs('WBC')] }), // UTC stamp
      labRow({ effectiveDate: '2026-01-14T08:00:00+08:00', institution: 'A院', obs: [obs('WBC')] }),
      labRow({ effectiveDate: '2026-01', institution: 'A院', obs: [obs('HB')] }), // partial date
      labRow({ effectiveDate: 'not-a-date', institution: 'A院', obs: [obs('HB')] }), // garbage date
      labRow({ effectiveDate: '2026-01-14', institution: '  A院  ', obs: [obs('未知檢驗XYZ')] }), // padded inst + unknown analyte
      labRow({ effectiveDate: '2026-01-14', institution: 'B院', obs: [obs('嗜氧培養', { valueQuantity: undefined, valueString: 'No growth after 5 days' } as Partial<Observation>)] }), // narrative
      labRow({ effectiveDate: '2026-01-14', institution: 'A院', obs: [] }), // 0-obs DR
    ]
    const out = groupLabReportsByDay(hostile)
    const flattened = out.flatMap((r) => (r.dayGroup ? r.groupedRows! : [r]))
    // Exact partition: same multiset of original ids.
    expect(flattened.map((r) => r.id).sort()).toEqual(hostile.map((r) => r.id).sort())
    // And every original object is the SAME reference (display-only grouping).
    for (const orig of hostile) {
      expect(flattened).toContain(orig)
    }
  })

  it('groups by the LOCAL calendar day the header displays, even for UTC stamps', () => {
    // Two draws the same LOCAL day, one stamped Z, one +08:00 — must not
    // split into two cards whose headers show the same date.
    const local = new Date('2026-01-14T22:00:00+08:00')
    const sameLocalDayUtc = new Date(local) // identical instant, Z-formatted string
    const rows = [
      labRow({ effectiveDate: sameLocalDayUtc.toISOString(), institution: 'A院', obs: [obs('WBC')] }),
      labRow({ effectiveDate: '2026-01-14T22:00:00+08:00', institution: 'A院', obs: [obs('HB')] }),
    ]
    const out = groupLabReportsByDay(rows)
    expect(out).toHaveLength(1)
    expect(out[0].groupedRows).toHaveLength(2)
  })
})

describe('countAbnormalInRows', () => {
  it('counts interpretation-flagged and range-breaching obs across members', () => {
    const rows = [
      labRow({
        obs: [
          // NOTE: bridge ships interpretation as a SINGLE CodeableConcept
          // (see fhir.types.ts), not the FHIR-R4 array form.
          obs('WBC', { interpretation: { coding: [{ code: 'H' }] } } as Partial<Observation>),
          obs('HB'),
        ],
      }),
      labRow({
        obs: [obs('K', { valueQuantity: { value: 9, unit: 'mEq/L' }, referenceRange: [{ low: { value: 3.5 }, high: { value: 5.1 } }] } as Partial<Observation>)],
      }),
    ]
    expect(countAbnormalInRows(rows)).toBe(2)
  })
})
