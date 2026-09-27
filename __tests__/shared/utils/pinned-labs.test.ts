// 我的固定檢驗 — the pinnable catalog and the per-pin latest/previous reader.
import {
  findPinnableLab,
  getPinnableLabCatalog,
  isPinnedLabReminder,
  makePinnedLabReminder,
  parsePinnedLabId,
  pinnedLabReminderLabel,
  resolvePinnedLab,
  searchPinnableLabs,
} from '@/src/shared/utils/pinned-labs'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

function obs(code: string, date: string, value: number | string, opts: {
  unit?: string
  interpretation?: string
  comparator?: string
  status?: string
} = {}) {
  return {
    resourceType: 'Observation',
    code: { text: code },
    effectiveDateTime: `${date}T09:00:00+08:00`,
    ...(opts.status ? { status: opts.status } : {}),
    ...(typeof value === 'number'
      ? { valueQuantity: { value, unit: opts.unit, ...(opts.comparator ? { comparator: opts.comparator } : {}) } }
      : { valueString: value }),
    ...(opts.interpretation ? { interpretation: [{ coding: [{ code: opts.interpretation }] }] } : {}),
  }
}

describe('pinnable catalog', () => {
  const catalog = getPinnableLabCatalog()
  const ids = new Set(catalog.map((entry) => entry.id))

  it('lists each analyte individually and category-scoped', () => {
    for (const id of ['chem:CREA', 'chem:ALT', 'chem:AST', 'chem:K', 'lipid:LDL', 'lipid:HDL', 'lipid:TG', 'chem:NT-PROBNP', 'glucose:HBA1C']) {
      expect(ids.has(id)).toBe(true)
    }
    // No duplicate ids.
    expect(ids.size).toBe(catalog.length)
  })

  it('keeps the eGFR formulas as separate analytes', () => {
    expect(ids.has('chem:EGFR(EPI)')).toBe(true)
    expect(ids.has('chem:EGFR(M)')).toBe(true)
  })

  it('finds analytes by Chinese name, abbreviation and loose spelling', () => {
    expect(searchPinnableLabs('肌酸酐').map((e) => e.id)).toContain('chem:CREA')
    expect(searchPinnableLabs('crea').map((e) => e.id)).toContain('chem:CREA')
    expect(searchPinnableLabs('nt pro bnp').map((e) => e.id)).toContain('chem:NT-PROBNP')
    expect(searchPinnableLabs('hba1c').map((e) => e.id)).toContain('glucose:HBA1C')
  })

  it('returns nothing for an analyte the taxonomy does not know', () => {
    expect(searchPinnableLabs('digoxin')).toEqual([])
    expect(searchPinnableLabs('   ')).toEqual([])
  })

  it('looks entries up by id', () => {
    expect(findPinnableLab('lipid:LDL')?.short).toBe('LDL')
    expect(findPinnableLab('chem:NOPE')).toBeUndefined()
  })
})

describe('pin ids', () => {
  it('parses category-scoped ids and rejects reminders', () => {
    expect(parsePinnedLabId('chem:CREA')).toEqual({ categoryId: 'chem', testKey: 'CREA' })
    expect(parsePinnedLabId('chem:EGFR(EPI)')).toEqual({ categoryId: 'chem', testKey: 'EGFR(EPI)' })
    expect(parsePinnedLabId(makePinnedLabReminder('Digoxin 濃度'))).toBeNull()
  })

  it('round-trips a reminder label', () => {
    const id = makePinnedLabReminder('  Digoxin 濃度 ')
    expect(isPinnedLabReminder(id)).toBe(true)
    expect(pinnedLabReminderLabel(id)).toBe('Digoxin 濃度')
  })
})

describe('resolvePinnedLab', () => {
  it('returns latest and previous with their own dates', () => {
    const pivots = buildLabPivots([
      obs('CREA', '2026-03-01', 1.1, { unit: 'mg/dL' }),
      obs('CREA', '2026-09-18', 1.32, { unit: 'mg/dL', interpretation: 'H' }),
      obs('CREA', '2026-06-30', 1.28, { unit: 'mg/dL', interpretation: 'H' }),
    ])
    const resolved = resolvePinnedLab(pivots, 'chem:CREA')
    expect(resolved.latest?.date).toBe('2026-09-18')
    expect(resolved.latest?.value).toBe('1.32')
    expect(resolved.latest?.cell.isAbnormal).toBe(true)
    expect(resolved.previous?.date).toBe('2026-06-30')
    expect(resolved.points.map((p) => p.date)).toEqual(['2026-09-18', '2026-06-30', '2026-03-01'])
  })

  it('reports no result rather than guessing', () => {
    const pivots = buildLabPivots([obs('K', '2026-09-18', 4.6, { unit: 'mmol/L' })])
    const resolved = resolvePinnedLab(pivots, 'chem:CREA')
    expect(resolved.latest).toBeUndefined()
    expect(resolved.points).toEqual([])
  })

  it('keeps a comparator in front of the value', () => {
    const pivots = buildLabPivots([obs('CRP', '2026-09-18', 0.5, { unit: 'mg/dL', comparator: '<' })])
    expect(resolvePinnedLab(pivots, 'chem:CRP').latest?.value).toBe('<0.5')
  })

  it('skips entered-in-error results', () => {
    const pivots = buildLabPivots([
      obs('K', '2026-09-01', 4.4, { unit: 'mmol/L' }),
      obs('K', '2026-09-18', 9.9, { unit: 'mmol/L', status: 'entered-in-error' }),
    ])
    expect(resolvePinnedLab(pivots, 'chem:K').latest?.date).toBe('2026-09-01')
  })

  it('ignores reminder ids', () => {
    expect(resolvePinnedLab({}, makePinnedLabReminder('x')).points).toEqual([])
  })
})
