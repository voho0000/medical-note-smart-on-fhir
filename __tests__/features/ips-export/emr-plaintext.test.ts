// 帶回病歷 plain-text builders. These strings land in a signed medical record,
// so the shape is locked down here: self-describing lines, source-only abnormal
// flags, no invented values, explicit elision.
import {
  buildEmrLabText,
  buildEmrReportText,
  collectEmrReports,
  emrRangeCutoff,
  joinEmrSections,
  summarizeEmrLabPanels,
} from '@/features/ips-export/utils/emr-plaintext'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

const NOW = new Date(2026, 7, 18) // 2026-08-18 local

const LABELS = { cbc: '血液', chem: '生化', urine: '尿液' }
const OMITTED = '…略去 {count} 次…'
const DRAWS = '{count} 次'

// Short codes taken from the audited `codes` lists in lab-categories
// (chem: CREA / K, cbc: HB) so categorisation is exercised through the app's
// own table rather than a LOINC asserted here.
function obs(code: string, date: string, value: number | string, opts: {
  unit?: string
  interpretation?: string
} = {}) {
  return {
    resourceType: 'Observation',
    code: { text: code },
    effectiveDateTime: `${date}T09:00:00+08:00`,
    ...(typeof value === 'number'
      ? { valueQuantity: { value, unit: opts.unit } }
      : { valueString: value }),
    ...(opts.interpretation
      ? { interpretation: [{ coding: [{ code: opts.interpretation }] }] }
      : {}),
  }
}

const OBSERVATIONS = [
  obs('CREA', '2025-09-05', 1.21, { unit: 'mg/dL', interpretation: 'H' }),
  obs('CREA', '2026-02-14', 1.48, { unit: 'mg/dL', interpretation: 'H' }),
  obs('CREA', '2026-07-02', 1.62, { unit: 'mg/dL', interpretation: 'H' }),
  obs('CREA', '2026-08-18', 1.83, { unit: 'mg/dL', interpretation: 'H' }),
  obs('K', '2026-07-02', 5.0, { unit: 'mmol/L' }),
  obs('K', '2026-08-18', 5.2, { unit: 'mmol/L', interpretation: 'H' }),
  obs('HB', '2026-08-18', 10.4, { unit: 'g/dL', interpretation: 'L' }),
]

function labText(overrides: Partial<Parameters<typeof buildEmrLabText>[0]> = {}) {
  const pivots = buildLabPivots(OBSERVATIONS)
  const selected: Record<string, boolean> = {}
  for (const id of Object.keys(pivots)) selected[id] = true
  return buildEmrLabText({
    pivots,
    categoryLabels: LABELS,
    selected,
    range: '1y',
    preset: 'standard',
    omittedLabel: OMITTED,
    drawCountLabel: DRAWS,
    now: NOW,
    ...overrides,
  })
}

describe('emrRangeCutoff', () => {
  it('walks back whole months and has no cut-off for 最近一次', () => {
    expect(emrRangeCutoff('3m', NOW)).toBe('2026-05-18')
    expect(emrRangeCutoff('6m', NOW)).toBe('2026-02-18')
    expect(emrRangeCutoff('1y', NOW)).toBe('2025-08-18')
    expect(emrRangeCutoff('last', NOW)).toBeNull()
  })
})

describe('buildEmrLabText', () => {
  it('prints one date-led line per panel for 最近一次', () => {
    const text = labText({ range: 'last' })
    expect(text).toContain('2026/08/18 生化 ')
    expect(text).toContain('CREA 1.83(H)')
    expect(text).toContain('K 5.2(H)')
    // Only the newest draw — an older value must not sneak into the snapshot.
    expect(text).not.toContain('1.62')
  })

  it('prints one trend line per analyte with every point carrying its date', () => {
    const text = labText({ range: '1y' })
    expect(text).toContain('生化 (2025/09/05-2026/08/18, 4 次)')
    expect(text).toContain('CREA 2025/09/05 1.21(H) → 02/14 1.48(H) → 07/02 1.62(H) → 08/18 1.83(H)')
    // A missing draw is skipped, never padded with a placeholder.
    expect(text).toContain('K 07/02 5 → 08/18 5.2(H)')
  })

  it('flags values only where the source interpreted them', () => {
    const text = labText({ range: '1y' })
    expect(text).toContain('07/02 5 →')     // no interpretation on this draw
    expect(text).toContain('08/18 5.2(H)')  // source said H
  })

  it('carries the year on any point outside the current year', () => {
    const text = labText({ range: '1y' })
    // 2025 point keeps its year; same-year points stay short. "05/18" next to
    // "06/02" would read as this May and age a result by a year.
    expect(text).toContain('2025/09/05 1.21(H)')
    expect(text).toContain('→ 02/14 1.48(H)')
    expect(text).not.toContain(' 09/05 1.21(H)')
  })

  it('keeps the last three collection days for 最近三次', () => {
    const text = labText({ range: 'last3' })
    expect(text).toContain('生化 (2026/02/14-2026/08/18, 3 次)')
    expect(text).not.toContain('2025/09/05')
  })

  it('windows one calendar month for 1 個月', () => {
    const text = labText({ range: '1m' })
    expect(emrRangeCutoff('1m', NOW)).toBe('2026-07-18')
    expect(text).toContain('2026/08/18')
    expect(text).not.toContain('07/02')
  })

  it('collapses analytes measured only once onto one shared day line', () => {
    const text = labText({ range: '1y' })
    // K has two draws → its own trend line; HB has one → folded into a day line
    // carrying the panel name, exactly as 最近一次 would print it.
    expect(text).toContain('K 07/02 5 → 08/18 5.2(H)')
    expect(text).toContain('2026/08/18 血液 HB 10.4(L)')
    expect(text).not.toContain('HB 08/18 10.4(L)')
  })

  it('prints no flag for a source code that means "not abnormal"', () => {
    const pivots = buildLabPivots([
      obs('K', '2026-08-18', 4.2, { unit: 'mmol/L', interpretation: 'N' }),
      obs('CREA', '2026-08-18', 0.9, { unit: 'mg/dL', interpretation: 'NEG' }),
    ])
    const text = buildEmrLabText({
      pivots,
      categoryLabels: LABELS,
      selected: { chem: true },
      range: 'last',
      preset: 'standard',
      omittedLabel: OMITTED,
      drawCountLabel: DRAWS,
      now: NOW,
    })
    expect(text).toContain('K 4.2')
    expect(text).toContain('CREA 0.9')
    expect(text).not.toContain('(N)')
    expect(text).not.toContain('(NEG)')
  })

  it('adds units and four-digit years only in the 完整 preset', () => {
    expect(labText({ preset: 'standard' })).not.toContain('mg/dL')
    const full = labText({ preset: 'full' })
    expect(full).toContain('CREA (mg/dL) 2025/09/05 1.21(H)')
  })

  it('drops the panel heading in the 緊湊 preset', () => {
    expect(labText({ preset: 'compact' })).not.toContain('生化 (')
  })

  it('elides a long run in the middle and says how many were dropped', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      obs('CREA', `2026-0${i + 1}-05`, 1 + i / 10, { unit: 'mg/dL' }))
    const pivots = buildLabPivots(many)
    const selected: Record<string, boolean> = {}
    for (const id of Object.keys(pivots)) selected[id] = true
    const text = buildEmrLabText({
      pivots,
      categoryLabels: LABELS,
      selected,
      range: '1y',
      preset: 'standard',
      omittedLabel: OMITTED,
      drawCountLabel: DRAWS,
      now: NOW,
    })
    expect(text).toContain('…略去 3 次…')
  })

  it('omits panels the user unticked', () => {
    const pivots = buildLabPivots(OBSERVATIONS)
    const text = buildEmrLabText({
      pivots,
      categoryLabels: LABELS,
      selected: { chem: true },
      range: '1y',
      preset: 'standard',
      omittedLabel: OMITTED,
      drawCountLabel: DRAWS,
      now: NOW,
    })
    expect(text).toContain('CREA ')
    expect(text).not.toContain('HB ')
  })
})

describe('summarizeEmrLabPanels', () => {
  it('reports only panels with real values in the window', () => {
    const pivots = buildLabPivots(OBSERVATIONS)
    const panels = summarizeEmrLabPanels(pivots, LABELS, '1y', NOW)
    const chem = panels.find((p) => p.id === 'chem')
    expect(chem?.drawCount).toBe(4)
    // Pinned-column stub rows must not manufacture an empty panel.
    expect(panels.every((p) => p.drawCount > 0)).toBe(true)
  })

  it('counts a single draw for 最近一次', () => {
    const pivots = buildLabPivots(OBSERVATIONS)
    const panels = summarizeEmrLabPanels(pivots, LABELS, 'last', NOW)
    expect(panels.every((p) => p.drawCount === 1)).toBe(true)
  })
})

describe('collectEmrReports', () => {
  const reports = [
    {
      id: 'dr1',
      code: { text: '胸部X光' },
      effectiveDateTime: '2026-08-18T10:00:00+08:00',
      conclusion: '兩側肺野未見浸潤性病灶。Impression:No active lung lesion.',
      performer: [{ display: '北榮' }],
    },
    {
      id: 'dr2',
      code: { text: '腹部超音波' },
      effectiveDateTime: '2026-06-30T10:00:00+08:00',
      conclusion: '肝臟實質回音稍增強。',
    },
    // Lab DR: values live on linked observations, no narrative → not a report.
    { id: 'dr3', code: { text: '生化' }, effectiveDateTime: '2026-08-18T09:00:00+08:00' },
  ]

  it('keeps only reports with narrative text, newest first', () => {
    const items = collectEmrReports(reports, { range: '1y', now: NOW })
    expect(items.map((r) => r.id)).toEqual(['dr1', 'dr2'])
  })

  it('re-flows the narrative onto its own lines', () => {
    const [first] = collectEmrReports(reports, { range: '1y', now: NOW })
    expect(first.body.split('\n').length).toBeGreaterThan(1)
    expect(first.body).toContain('Impression')
  })

  it('breaks a space-run blob into lines', () => {
    const blob = [{
      id: 'ecg',
      code: { text: '心電圖' },
      effectiveDateTime: '2026-08-18T10:00:00+08:00',
      conclusion: '心電圖:    Sinus bradycardia    Left axis deviation    Abnormal ECG',
    }]
    const [item] = collectEmrReports(blob, { range: '1y', now: NOW })
    expect(item.body.split('\n')).toEqual([
      '心電圖:',
      'Sinus bradycardia',
      'Left axis deviation',
      'Abnormal ECG',
    ])
  })

  it('drops a bridge duplicate of the same narrative on the same day', () => {
    const withDup = [...reports, { ...reports[0], id: 'dr1-copy' }]
    expect(collectEmrReports(withDup, { range: '1y', now: NOW })).toHaveLength(2)
  })

  it('keeps the whole newest exam day for 最近一次', () => {
    const sameDay = [
      ...reports,
      { id: 'dr4', code: { text: '心電圖' }, effectiveDateTime: '2026-08-18T11:00:00+08:00', conclusion: 'Sinus rhythm, no acute change noted.' },
    ]
    const items = collectEmrReports(sameDay, { range: 'last', now: NOW })
    expect(items.map((r) => r.id).sort()).toEqual(['dr1', 'dr4'])
  })

  it('keeps the three most recent exam days for 最近三次', () => {
    const older = [...reports, {
      id: 'dr5',
      code: { text: '心臟超音波' },
      effectiveDateTime: '2025-12-11T10:00:00+08:00',
      conclusion: 'LVEF 62%, normal left ventricular systolic function.',
    }, {
      id: 'dr6',
      code: { text: '骨密度' },
      effectiveDateTime: '2025-08-30T10:00:00+08:00',
      conclusion: 'T-score -1.8 at lumbar spine, osteopenia.',
    }]
    expect(collectEmrReports(older, { range: 'last3', now: NOW }).map((r) => r.id))
      .toEqual(['dr1', 'dr2', 'dr5'])
  })

  it('excludes reports outside the window', () => {
    const older = [...reports, {
      id: 'dr5',
      code: { text: '心臟超音波' },
      effectiveDateTime: '2025-12-11T10:00:00+08:00',
      conclusion: 'LVEF 62%, normal left ventricular systolic function.',
    }]
    expect(collectEmrReports(older, { range: '1y', now: NOW }).map((r) => r.id)).toEqual(['dr1', 'dr2', 'dr5'])
    expect(collectEmrReports(older, { range: '3m', now: NOW }).map((r) => r.id)).toEqual(['dr1', 'dr2'])
  })

  it('names the institution only in the 完整 preset', () => {
    const items = collectEmrReports(reports, { range: '1y', now: NOW })
    expect(buildEmrReportText(items, 'standard')).not.toContain('北榮')
    expect(buildEmrReportText(items, 'full')).toContain('2026/08/18 胸部X光 (北榮)')
  })
})

describe('joinEmrSections', () => {
  it('separates the two blocks and skips an empty one', () => {
    expect(joinEmrSections('labs', 'reports')).toBe('labs\n\nreports')
    expect(joinEmrSections('labs', '')).toBe('labs')
    expect(joinEmrSections('', '')).toBe('')
  })
})
