/**
 * @jest-environment node
 *
 * queryLabResultsByCategory: two observations share a group only when they
 * carry the same LOINC, or LOINCs that an explicit LOINC → analyte mapping
 * declares equivalent, or (with no LOINC at all) the same recognised analyte
 * name. A shared display name never merges different LOINCs, and a count is
 * never grouped with a percentage or a coded/text result. The differential
 * test runs every category over the demo / e2e bundles and a synthetic corpus
 * of LOINC pairs that share a display name, and lists every declared merge.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  createFhirTools,
  declaredLoincAnalyteKey,
  labCategoryAnalyteKey,
  labValueFamily,
} from '@/src/infrastructure/ai/tools/fhir-tools'
import { LAB_CATEGORIES, categorizeObservation } from '@/src/shared/utils/lab-categories'
import { expandObservationValues } from '@/src/core/utils/observation-value.utils'
import { samplePatient, sampleCollection } from './fixtures'

const LOINC_SYSTEM = 'http://loinc.org'

const toolsFor = (observations: any[]) => createFhirTools(() => ({
  patient: samplePatient,
  collection: { ...sampleCollection, observations, vitalSigns: [] },
}))

let seq = 0
function lab(text: string, loinc: string | undefined, value: number | string, unit = '', date = '2026-10-09') {
  seq += 1
  return {
    resourceType: 'Observation', id: `syn-${seq}`, status: 'final',
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: { text, coding: loinc ? [{ system: LOINC_SYSTEM, code: loinc }] : [] },
    ...(typeof value === 'number' ? { valueQuantity: { value, unit } } : { valueString: value }),
    effectiveDateTime: `${date}T08:00:00+08:00`,
  }
}

const loincOf = (o: any): string | undefined =>
  (o?.code?.coding ?? []).find((c: any) => /loinc/i.test(c.system || ''))?.code

describe('queryLabResultsByCategory keeps distinct measurements apart', () => {
  it('keeps 731-0 and 751-8 apart when both are named 白血球分類計數', async () => {
    const result = await (toolsFor([
      lab('白血球分類計數', '731-0', 2, '10^3/uL'), lab('白血球分類計數', '751-8', 5, '10^3/uL'),
    ]).queryLabResultsByCategory as any).execute({ category: 'cbc' })
    expect(result.analyteCount).toBe(2)
    expect(result.data.flatMap((g: any) => g.results.map((r: any) => r.value)).sort()).toEqual([2, 5])
    expect(result.truncated).toBe(false)
  })

  it('keeps absolute neutrophils (751-8) and neutrophil % (770-8) apart, with distinct labels', async () => {
    const result = await (toolsFor([
      lab('Neutrophil', '751-8', 4.1, '10^3/uL'), lab('Neutrophil', '770-8', 62, '%'),
      lab('嗜中性白血球', '751-8', 3.9, '10^3/uL', '2026-10-01'), lab('嗜中性白血球', '770-8', 60, '%', '2026-10-01'),
    ]).queryLabResultsByCategory as any).execute({ category: 'cbc', withTrend: true })
    expect(result.analyteCount).toBe(2)
    const values = result.data.map((g: any) => g.results.map((r: any) => r.value).sort())
    expect(values).toEqual(expect.arrayContaining([[3.9, 4.1], [60, 62]]))
    expect(new Set(result.availableAnalytes).size).toBe(2)
  })
})

describe('titer, presence and free text never share a group', () => {
  it('keeps anti-TPO 32786-6 "1:100" (titer) and 32042-4 "Positive" (presence) apart', async () => {
    const result = await (toolsFor([
      lab('Anti-TPO', '32786-6', '1:100'), lab('Anti-TPO', '32042-4', 'Positive'),
    ]).queryLabResultsByCategory as any).execute({ category: 'endocrine' })
    expect(result.analyteCount).toBe(2)
    expect(result.data.map((g: any) => g.results[0].value).sort()).toEqual(['1:100', 'Positive'])
  })

  it.each([
    ['1:160', 'titer'], ['< 1:40', 'titer'], ['1：80 speckled', 'titer'],
    ['Negative', 'ordinal'], ['positive', 'ordinal'], ['Borderline', 'ordinal'], ['±', 'ordinal'], ['2+', 'ordinal'],
    ['+++', 'ordinal'], ['(-)', 'ordinal'], ['陰性', 'ordinal'], ['弱陽性', 'ordinal'], ['Non-reactive', 'ordinal'],
    ['Weakly positive', 'ordinal'], ['Equivocal', 'ordinal'], ['Trace', 'ordinal'],
    ['see report', 'text'], ['Speckled pattern', 'text'],
  ])('%s → %s', (value, family) => {
    expect(labValueFamily(lab('X', undefined, value))).toBe(family)
  })
})

/** LOINC pairs that share one display name but are different measurements. */
const SYNTHETIC: any[] = [
  // CBC differential: absolute count vs percentage, English and Chinese names.
  ...([
    ['Neutrophil', '嗜中性白血球', '751-8', '770-8'],
    ['Lymphocyte', '淋巴球', '731-0', '736-9'],
    ['Monocyte', '單核球', '742-7', '5905-5'],
    ['Eosinophil', '嗜酸性白血球', '711-2', '713-8'],
    ['Basophil', '嗜鹼性白血球', '704-7', '706-2'],
  ] as const).flatMap(([en, zh, abs, pct]) => [
    lab(en, abs, 4, '10^3/uL'), lab(en, pct, 50, '%'), lab(zh, abs, 3, '10^3/uL'), lab(zh, pct, 40, '%'),
    // A name-only row of each kind.
    lab(en, undefined, 5, '10^3/uL'), lab(en, undefined, 55, '%'),
  ]),
  // eGFR variants under one name.
  ...['33914-3', '62238-1', '48642-3', '98979-8', '69405-9'].map((code, i) => lab('eGFR', code, 60 + i, 'mL/min/1.73m2')),
  // Serum vs urine under one name.
  lab('Creatinine', '2160-0', 1.1, 'mg/dL'), lab('Creatinine', '2161-8', 80, 'mg/dL'),
  lab('Glucose', '2345-7', 100, 'mg/dL'), lab('Glucose', '2350-7', 'Negative'),
  lab('Protein', '2885-2', 7, 'g/dL'), lab('Protein', '2888-6', 'Trace'),
  lab('Albumin', '1751-7', 4, 'g/dL'), lab('Albumin', '14957-5', 20, 'mg/L'),
  // Quantitative vs qualitative under one name.
  lab('HBsAg', '5196-1', 0.2, 'IU/mL'), lab('HBsAg', '5195-3', 'Negative'),
  // Declared-equivalent immunology LOINCs: quantitative vs presence.
  lab('SS-A', '33569-5', 0.4, 'U/mL'), lab('SS-A', '5352-0', 'Negative'), lab('SS-A', '17792-3', 0.5, 'U/mL'),
  // Declared-equivalent thyroid LOINCs.
  lab('TPO Ab', '8099-4', 12, 'IU/mL'), lab('Anti-TPO', '56477-3', 15, 'IU/mL'),
  // Titer vs presence vs quantity, one analyte name each.
  lab('ANA', '5048-4', '1:160'), lab('ANA', '29953-7', '1:80'), lab('ANA', '8061-4', 'Positive'),
  lab('ANA', '42254-3', 'Negative'), lab('抗核抗體', undefined, '1:320'), lab('抗核抗體', undefined, 'Positive'),
  lab('AMA', '20483-4', '1:40'), lab('AMA', '14236-4', 'Negative'), lab('AMA', undefined, 'Weakly positive'),
  lab('Anti-TPO', '32786-6', '1:100'), lab('Anti-TPO', '32042-4', 'Positive'), lab('Anti-TPO', '32042-4', '±'),
  lab('Anti-dsDNA', '5130-0', 30, 'IU/mL'), lab('Anti-dsDNA', '31348-6', 'Negative'), lab('Anti-dsDNA', '31348-6', '2+'),
  // A quantitative LOINC reported as a word, and free text.
  lab('SS-A', '33569-5', 'Negative'), lab('SS-A', '33569-5', 'see report'),
]

function bundleObservations(path: string): any[] {
  const bundle = JSON.parse(readFileSync(path, 'utf8'))
  return (bundle.entry ?? []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === 'Observation')
}

const ROOT = process.cwd()
const CORPORA: Array<[string, () => any[]]> = [
  ['synthetic shared-name LOINC pairs', () => SYNTHETIC],
  ...[
    'public/demo/demo-bundle.json',
    ...readdirSync(join(ROOT, 'public/demo/hfrEF')).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
      .map((f) => `public/demo/hfrEF/${f}`),
    'e2e/fixtures/hospital-cdss-bundle.json',
    'e2e/fixtures/medcloud-hepatitis-bundle.json',
    'e2e/fixtures/synthetic-bundle.json',
  ].map((path) => [path, () => bundleObservations(join(ROOT, path))] as [string, () => any[]]),
]

/** Groups that unite more than one LOINC, all declared equivalent. Listed so
 *  every merge the AI grouping makes is reviewed here. */
const DECLARED_MERGES: Record<string, string[]> = {
  // 33569-5 SS-A [Units/volume] by IA and 17792-3 SS-A [Units/volume].
  'immuno:ANTI-SSA:quantity': ['17792-3', '33569-5'],
  // 8099-4 Thyroperoxidase Ab [Units/volume] and 56477-3 the same by IA.
  'endocrine:ANTI-TPO:quantity': ['56477-3', '8099-4'],
  // 5048-4 Nuclear Ab [Titer] by IF and 29953-7 Nuclear Ab [Titer]: both titers.
  'immuno:ANA:titer': ['29953-7', '5048-4'],
  // 8061-4 Nuclear Ab [Presence] and 42254-3 Nuclear Ab [Presence] by IF.
  'immuno:ANA:ordinal': ['42254-3', '8061-4'],
}

describe('AI category grouping differential (never fewer groups than LOINC-keyed)', () => {
  it.each(CORPORA)('%s', async (_name, load) => {
    const observations = load()
    const tools = toolsFor(observations)
    const declaredSeen: Record<string, string[]> = {}
    for (const category of LAB_CATEGORIES.map((c) => c.id)) {
      const rows = observations
        .flatMap((o) => expandObservationValues(o))
        .filter((o: any) => String(o?.status ?? '').toLowerCase() !== 'entered-in-error'
          && categorizeObservation(o)?.id === category)
      const groups = new Map<string, any[]>()
      for (const o of rows) {
        const key = labCategoryAnalyteKey(o, category)
        groups.set(key, [...(groups.get(key) ?? []), o])
      }
      for (const members of groups.values()) {
        const loincs = [...new Set(members.map(loincOf).filter(Boolean))].sort() as string[]
        // Never a LOINC row together with a LOINC-less one.
        expect(new Set(members.map((o) => !!loincOf(o))).size).toBe(1)
        // Never two value families (count / percent / coded text).
        expect(new Set(members.map(labValueFamily)).size).toBe(1)
        if (loincs.length > 1) {
          const declared = new Set(loincs.map(declaredLoincAnalyteKey))
          expect(declared.size).toBe(1)
          expect([...declared][0]).toBeTruthy()
          declaredSeen[`${category}:${[...declared][0]}:${labValueFamily(members[0])}`] = loincs
        }
      }
      // Baseline: LOINC-keyed grouping (LOINC, else the name-based key).
      const baseline = new Set(rows.map((o) => loincOf(o) ?? `name:${labCategoryAnalyteKey(o, category)}`))
      const declaredReduction = [...groups.values()]
        .map((m) => new Set(m.map(loincOf).filter(Boolean)).size)
        .reduce((n, size) => n + Math.max(0, size - 1), 0)
      expect(groups.size).toBeGreaterThanOrEqual(baseline.size - declaredReduction)

      const result = await (tools.queryLabResultsByCategory as any).execute({ category, limit: 1000 })
      expect(result.analyteCount).toBe(groups.size)
      expect(result.truncated).toBe(false)
      expect(result.data.reduce((n: number, g: any) => n + g.observationCount, 0)).toBe(result.observationCount)
      // Every group is told apart by its label.
      expect(new Set(result.availableAnalytes).size).toBe(result.availableAnalytes.length)
    }
    for (const [key, loincs] of Object.entries(declaredSeen)) {
      expect({ key, loincs }).toEqual({ key, loincs: DECLARED_MERGES[key] })
    }
  })
})
