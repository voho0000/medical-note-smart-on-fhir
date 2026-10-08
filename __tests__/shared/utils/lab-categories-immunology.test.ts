// 免疫 category — field report LDR-20261008-28256AA6 (臺北榮總 via 雲端病歷):
// 「累積報告沒有免疫相關: IgG, IgA, IgM, C3, C4, RF」. Every analyte of the
// report, with and without LOINC, plus the former mis-routes (line-blot
// "Negative" → 尿液, 混合黴菌 → 微生物) and their non-regressions.
import {
  categorizeObservation,
  categorizeObservationWithReason,
  LAB_CATEGORIES,
} from '@/src/shared/utils/lab-categories'
import { buildLabPivots, getLabPivotTestIdentity } from '@/src/shared/utils/lab-pivot.utils'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { en } from '@/src/shared/i18n/locales/en'

const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }]
// The 雲端病歷 bridge writes NHI codes under TW Core's payment code system.
const TW_CORE_NHI = 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-service-payment-tw'
const BRIDGE_NHI = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'
const LOCAL = 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab'
const LOINC = 'http://loinc.org'

let seq = 0
function obs({
  item,
  nhi,
  nhiDisplay,
  nhiSystem = TW_CORE_NHI,
  loinc,
  value,
  unit,
  specimen,
  date = '2026-09-30',
}: {
  item: string
  nhi?: string
  nhiDisplay?: string
  nhiSystem?: string
  loinc?: string
  value: string | number
  unit?: string
  specimen?: string
  date?: string
}) {
  const coding: any[] = []
  if (loinc) coding.push({ system: LOINC, code: loinc })
  if (nhi) coding.push({ system: nhiSystem, code: nhi, ...(nhiDisplay ? { display: nhiDisplay } : {}) })
  coding.push({ system: LOCAL, code: item, display: item })
  return {
    resourceType: 'Observation',
    id: `imm-${seq++}`,
    status: 'final',
    category: LAB,
    code: { coding, text: item },
    effectiveDateTime: `${date}T09:00:00+08:00`,
    ...(typeof value === 'number'
      ? { valueQuantity: { value, unit } }
      : { valueString: value }),
    ...(specimen ? { specimen: { display: specimen } } : {}),
  }
}

// [item as the hospital prints it, NHI order, verified analyte LOINC or null, value, expected column key]
const SPEC_ROWS: Array<[string, string, string | null, string | number, string]> = [
  ['RF', '12011C', '11572-5', 9.5, 'RF'],
  ['IGG', '12025B', '2465-3', 1107, 'IGG'],
  ['IGA', '12027B', '2458-8', 307, 'IGA'],
  ['IGM', '12029B', '2472-9', 324, 'IGM'],
  ['IgE', '12031C', '19113-0', 150, 'IGE'],
  ['C3', '12034B', '4485-9', 113.9, 'C3'],
  ['C4', '12038B', '4498-2', 16.5, 'C4'],
  ['ANA', '12053C', '5048-4', 'N', 'ANA'],
  ['dsDNA Ab', '12060C', '5130-0', 1.5, 'ANTI-DSDNA'],
  ['SS-A/Ro Ab', '12064B', '33569-5', 0.4, 'ANTI-SSA'],
  ['SS-B/La Ab', '12064B', '17791-5', 1.4, 'ANTI-SSB'],
  ['Ro52', '12064B', '53017-0', 'Negative', 'ANTI-RO52'],
  ['RNP Ab', '12173B', '29374-6', 0.8, 'ANTI-RNP'],
  ['Sm Ab', '12173B', '11090-8', 0.7, 'ANTI-SM'],
  ['Mi-2alpha(Mi-2a)', '12137B', '88732-3', 'Negative', 'ANTI-MI-2A'],
  ['Mi-2beta(Mi-2b)', '12137B', '88733-1', 'Negative', 'ANTI-MI-2B'],
  ['Jo-1', '12154B', '8076-2', 'Negative', 'ANTI-JO-1'],
  ['Ku', '12155B', '18484-6', 'Negative', 'ANTI-KU'],
  ['粒腺體抗體 ;(AMA, anti-mitochondrial antibody)', '12056B', '20483-4', 'Negative', 'AMA'],
  ['IgG1', '12149B', '2466-1', 518, 'IGG1'],
  ['IgG2', '12149B', '2467-9', 293.5, 'IGG2'],
  ['IgG3', '12149B', '2468-7', 65.5, 'IGG3'],
  ['IgG4', '12149B', '2469-5', 60.1, 'IGG4'],
  ['混合花粉', '30022C', null, '<0.35', '混合花粉'],
  ['屋塵璊', '30022C', null, 2.09, '屋塵璊'],
  ['德國蟑螂', '30022C', '6078-0', '<0.35', '德國蟑螂'],
  ['混合動物皮毛', '30022C', null, '<0.35', '混合動物皮毛'],
  ['貓毛', '30022C', '6833-8', '<0.35', '貓毛'],
  ['狗毛', '30022C', '6098-8', '<0.35', '狗毛'],
  ['混合黴菌', '30022C', null, '<0.35', '混合黴菌'],
]

describe('免疫 category definition', () => {
  const immuno = LAB_CATEGORIES.find((c) => c.id === 'immuno')!

  it('is a secondary sub-tab with immunoglobulin / autoantibody / allergen subgroups', () => {
    expect(immuno.hiddenByDefault).toBe(true)
    expect(immuno.subgroups?.map((sg) => sg.id)).toEqual(['immunoglobulin', 'autoantibody', 'allergen'])
    expect(immuno.pinnedColumns).toBeUndefined()
  })

  it('has zh-TW and en labels for the category, its subgroups and the nhi-order reason', () => {
    for (const locale of [zhTW, en] as any[]) {
      expect(locale.reports.cumulativeCategories.immuno).toBeTruthy()
      for (const sg of immuno.subgroups!) expect(locale.reports.cumulativeSubgroups[sg.id]).toBeTruthy()
      expect(locale.labDataReport.decidedBy['nhi-order']).toBeTruthy()
    }
  })

  it('no longer files the RF LOINC 11572-5 under 內分泌', () => {
    const endocrine = LAB_CATEGORIES.find((c) => c.id === 'endocrine')!
    expect(endocrine.loincCodes).not.toContain('11572-5')
  })
})

describe.each([
  ['NHI code only (雲端病歷 today)', false],
  ['NHI code + analyte LOINC (mapper 0.1.6)', true],
])('every field-report analyte — %s', (_label, withLoinc) => {
  it.each(SPEC_ROWS)('%s → 免疫 / %s', (item, nhi, loinc, value, key) => {
    const observation = obs({ item, nhi, loinc: withLoinc && loinc ? loinc : undefined, value })
    const result = categorizeObservationWithReason(observation)
    expect(result.category?.id).toBe('immuno')
    expect(result.decidedBy).toBe(withLoinc && loinc ? 'loinc' : 'nhi-order')
    expect(getLabPivotTestIdentity(observation, 'immuno').testKey).toBe(key)
  })
})

describe('uncoded rows (no NHI code, no LOINC) still reach 免疫 by name', () => {
  it.each(SPEC_ROWS)('%s', (item, _nhi, _loinc, value, key) => {
    const observation = obs({ item, value })
    expect(categorizeObservation(observation)?.id).toBe('immuno')
    expect(getLabPivotTestIdentity(observation, 'immuno').testKey).toBe(key)
  })

  it('reads the bilingual standardized IgE name', () => {
    const observation = obs({ item: '免疫球蛋白E ;(IgE)', value: 150 })
    expect(categorizeObservation(observation)?.id).toBe('immuno')
    expect(getLabPivotTestIdentity(observation, 'immuno').testKey).toBe('IGE')
  })

  it('accepts the older bridge NHI system too', () => {
    const observation = obs({ item: 'Ro52', nhi: '12064B', nhiSystem: BRIDGE_NHI, value: 'Negative' })
    expect(categorizeObservationWithReason(observation)).toMatchObject({ category: { id: 'immuno' }, decidedBy: 'nhi-order' })
  })
})

describe('former mis-routes', () => {
  it.each(['Ro52', 'Mi-2alpha(Mi-2a)', 'Mi-2beta(Mi-2b)', 'Jo-1', 'Ku'])(
    'line-blot %s "Negative" with no specimen is never 尿液',
    (item) => {
      const nhi = { Ro52: '12064B', 'Mi-2alpha(Mi-2a)': '12137B', 'Mi-2beta(Mi-2b)': '12137B', 'Jo-1': '12154B', Ku: '12155B' }[item]!
      for (const observation of [obs({ item, nhi, value: 'Negative' }), obs({ item, value: 'Negative' })]) {
        const result = categorizeObservationWithReason(observation)
        expect(result.category?.id).toBe('immuno')
        expect(result.decidedBy).not.toBe('qualitative')
      }
    },
  )

  it('an immunology order with a Positive result and an unknown member name is not 尿液', () => {
    const observation = obs({ item: 'Zeta blot member', nhi: '12137B', value: 'Positive' })
    expect(categorizeObservationWithReason(observation)).toMatchObject({ category: { id: 'immuno' }, decidedBy: 'nhi-order' })
  })

  it('混合黴菌 is an allergen, not a fungal culture — coded or uncoded', () => {
    expect(categorizeObservation(obs({ item: '混合黴菌', nhi: '30022C', value: '<0.35' }))?.id).toBe('immuno')
    expect(categorizeObservation(obs({ item: '混合黴菌', value: '<0.35' }))?.id).toBe('immuno')
  })

  it('an immunology order whose specimen says urine still follows the specimen', () => {
    const observation = obs({ item: 'IgG', nhi: '12025B', value: 3, specimen: 'Urine' })
    expect(categorizeObservation(observation)?.id).toBe('urine')
  })
})

describe('columns come from the analyte, not the shared order code', () => {
  it('splits 12064B into SS-A, Ro52 and SS-B; 12173B into Sm and RNP; one column per allergen', () => {
    const rows = [
      obs({ item: 'SS-A/Ro Ab', nhi: '12064B', value: 0.4 }),
      obs({ item: 'SS-B/La Ab', nhi: '12064B', value: 1.4 }),
      obs({ item: 'Ro52', nhi: '12064B', value: 'Negative' }),
      obs({ item: 'RNP Ab', nhi: '12173B', value: 0.8 }),
      obs({ item: 'Sm Ab', nhi: '12173B', value: 0.7 }),
      obs({ item: '貓毛', nhi: '30022C', value: '<0.35' }),
      obs({ item: '狗毛', nhi: '30022C', value: '<0.35' }),
      obs({ item: '牛奶', nhi: '30022C', value: '<0.35' }),
      obs({ item: 'IGG', nhi: '12025B', value: 1107 }),
      obs({ item: 'C3', nhi: '12034B', value: 113.9 }),
      obs({ item: 'RF', nhi: '12011C', value: 9.5 }),
    ]
    const pivot = buildLabPivots(rows).immuno
    expect(pivot.rows.map((row) => [row.testKey, row.subgroupId])).toEqual([
      ['IGG', 'immunoglobulin'],
      ['C3', 'immunoglobulin'],
      ['ANTI-SM', 'autoantibody'],
      ['ANTI-RNP', 'autoantibody'],
      ['ANTI-SSA', 'autoantibody'],
      ['ANTI-RO52', 'autoantibody'],
      ['ANTI-SSB', 'autoantibody'],
      ['RF', 'autoantibody'],
      ['貓毛', 'allergen'],
      ['狗毛', 'allergen'],
      // Not a listed allergen name: joins 過敏原 by its 30022C order.
      ['牛奶', 'allergen'],
    ])
    const labels = Object.fromEntries(pivot.rows.map((row) => [row.testKey, row.displayName]))
    expect(labels).toMatchObject({ 'ANTI-SSA': 'SS-A/Ro', 'ANTI-SSB': 'SS-B/La', 'ANTI-RO52': 'Ro52', 'ANTI-SM': 'Sm', 'ANTI-RNP': 'RNP', C3: 'C3', RF: 'RF', 貓毛: '貓毛' })
  })

  it('a LOINC-coded and an uncoded row of one analyte share a column', () => {
    const pivot = buildLabPivots([
      obs({ item: 'SS-A/Ro Ab', nhi: '12064B', loinc: '33569-5', value: 0.4, date: '2026-01-01' }),
      obs({ item: 'SS-A/Ro Ab', nhi: '12064B', value: 0.5, date: '2026-09-30' }),
      obs({ item: 'Mi-2alpha(Mi-2a)', nhi: '12137B', value: 'Negative', date: '2026-01-01' }),
      obs({ item: 'Mi-2α', value: 'Negative', date: '2026-09-30' }),
    ]).immuno
    expect(pivot.rows.map((row) => [row.testKey, row.values.size])).toEqual([
      ['ANTI-SSA', 2],
      ['ANTI-MI-2A', 2],
    ])
  })

  it('does not label every allergen with the order name', () => {
    const pivot = buildLabPivots([
      obs({ item: '混合花粉', nhi: '30022C', nhiSystem: 'urn:oid:nhi.lab.code', nhiDisplay: '特異過敏原免疫檢驗', value: '<0.35' }),
    ]).immuno
    expect(pivot.rows[0].displayName).toBe('混合花粉')
  })
})

describe('non-regression', () => {
  it('genuine uncoded urine dipstick rows still go to 尿液', () => {
    expect(categorizeObservationWithReason({ category: LAB, code: { text: 'Zeta strip' }, valueString: 'Negative' }))
      .toMatchObject({ category: { id: 'urine' }, decidedBy: 'qualitative' })
    expect(categorizeObservation(obs({ item: 'Protein', nhi: '06013C', value: 'Negative' }))?.id).toBe('urine')
    // A 06 尿液 order with an unrecognised name keeps the qualitative route.
    expect(categorizeObservationWithReason(obs({ item: 'Zeta strip', nhi: '06013C', value: 'Trace' })))
      .toMatchObject({ category: { id: 'urine' }, decidedBy: 'qualitative' })
  })

  it('genuine microbiology still goes to 微生物', () => {
    expect(categorizeObservation(obs({ item: 'Blood culture', nhi: '13016B', value: 'No growth' }))?.id).toBe('microbio')
    expect(categorizeObservation(obs({ item: '黴菌培養', nhi: '13007C', value: 'No growth' }))?.id).toBe('microbio')
    expect(categorizeObservation(obs({ item: 'Fungus culture', value: 'No growth' }))?.id).toBe('microbio')
  })

  it('CRP (12015C) stays in 生化', () => {
    expect(categorizeObservation(obs({ item: 'CRP', nhi: '12015C', value: 0.06 }))?.id).toBe('chem')
  })

  it('雲端病歷 CBC rows under 08 orders stay in 血液', () => {
    expect(categorizeObservation(obs({ item: 'WBC', nhi: '08011C', value: 6.2 }))?.id).toBe('cbc')
  })

  it('an NHI-coded row of another order cannot ride an immunology name', () => {
    // An immunofixation band (12103B) printed as "IgG" is not the IgG level.
    expect(categorizeObservation(obs({ item: 'IgG', nhi: '12103B', value: 'Monoclonal band' }))?.id).toBe('other')
  })
})

describe('urine spot Prot/Cr ratio (09040C)', () => {
  it.each([
    ['NHI code only', undefined],
    ['with LOINC 2890-2', '2890-2'],
  ])('%s → 尿液 UPCR column', (_label, loinc) => {
    const observation = obs({ item: 'Prot/Cr ratio', nhi: '09040C', loinc, value: 0.09, unit: 'mg/g' })
    expect(categorizeObservation(observation)?.id).toBe('urine')
    const pivot = buildLabPivots([observation]).urine
    const row = pivot.rows.find((r) => r.values.size > 0)!
    expect(row.testKey).toBe('PROT/CR RATIO')
    expect(row.subgroupId).toBe('ratio')
  })

  it('a bare 09040C 全蛋白 is still not urine', () => {
    expect(categorizeObservation(obs({ item: 'TP', nhi: '09040C', value: 7.1 }))?.id).toBe('chem')
  })
})
