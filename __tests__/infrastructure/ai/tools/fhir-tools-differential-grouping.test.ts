/**
 * @jest-environment node
 *
 * AI lab grouping (queryLabResultsByCategory, getHealthSummarySnapshot) must
 * (a) never split rows that carry the same LOINC and value family — whatever
 *     their source label ("Lithium" / "Li") — and
 * (b) never put an absolute count and a percentage in one group — even when
 *     both carry the same label (「嗜中性白血球 / Neutrophil」 for 751-8 / 770-8)
 *     or no LOINC at all.
 * The differential test checks both properties for every category over the
 * committed demo / e2e bundles and a synthetic corpus.
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import {
  createFhirTools,
  labCategoryAnalyteKey,
  labValueFamily,
} from '@/src/infrastructure/ai/tools/fhir-tools'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import { expandObservationValues } from '@/src/core/utils/observation-value.utils'
import { samplePatient, sampleCollection } from './fixtures'

const LOINC = 'http://loinc.org'
const NHI_ORDER = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'
const NHI_PAYMENT = 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-service-payment-tw'
const MEDICLOUD_EXTENSION = {
  url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
  valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
}

const toolsFor = (observations: any[]) => createFhirTools(() => ({
  patient: samplePatient,
  collection: { ...sampleCollection, observations, vitalSigns: [] },
}))

let seq = 0
function lab(
  text: string,
  loinc: string | undefined,
  value: number,
  unit: string,
  options: { date?: string; nhi?: string; medicloud?: boolean; high?: boolean } = {},
) {
  seq += 1
  return {
    resourceType: 'Observation',
    id: `diffgrp-${seq}`,
    status: 'final',
    ...(options.medicloud ? { extension: [MEDICLOUD_EXTENSION] } : {}),
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: {
      text,
      coding: [
        ...(loinc ? [{ system: LOINC, code: loinc }] : []),
        ...(options.nhi ? [{ system: options.nhi, code: '08013C', display: '白血球分類計數' }] : []),
      ],
    },
    valueQuantity: { value, unit },
    ...(options.high ? { interpretation: [{ coding: [{ code: 'H' }] }] } : {}),
    effectiveDateTime: `${options.date ?? '2026-10-01'}T08:00:00+08:00`,
  }
}

const loincOf = (observation: any): string | undefined =>
  (observation?.code?.coding ?? []).find((coding: any) => /loinc/i.test(coding?.system ?? ''))?.code

function unitKind(observation: any): 'count' | 'percent' | null {
  const unit = String(observation?.valueQuantity?.unit ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  if (unit === '%') return 'percent'
  if (/\/(?:u|µ|μ)l$|\/mm3$|\/cumm$|10\^9\/l$/.test(unit)) return 'count'
  return null
}

describe('same LOINC, different source labels', () => {
  it('keeps one history for an unrecognised analyte labelled "Lithium" and "Li" (LOINC 14334-7)', async () => {
    const lithium = [
      lab('Lithium', '14334-7', 0.6, 'mmol/L', { date: '2026-09-01' }),
      lab('Li', '14334-7', 0.8, 'mmol/L', { date: '2026-10-01' }),
    ]
    const category = categorizeObservation(lithium[0])?.id
    expect(category).toBeDefined()
    expect(labCategoryAnalyteKey(lithium[0], category!)).toBe(labCategoryAnalyteKey(lithium[1], category!))
    const result = await (toolsFor(lithium).queryLabResultsByCategory as any).execute({ category, withTrend: true })
    expect(result.analyteCount).toBe(1)
    expect(result.data[0].results.map((item: any) => item.value)).toEqual([0.8, 0.6])
  })

  it('the health summary keeps one latest abnormal row for that analyte', async () => {
    const result = await (toolsFor([
      lab('Lithium', '14334-7', 1.6, 'mmol/L', { date: '2026-09-01', high: true }),
      lab('Li', '14334-7', 1.8, 'mmol/L', { date: '2026-10-01', high: true }),
    ]).getHealthSummarySnapshot as any).execute({})
    const lithiumRows = JSON.stringify(result).match(/"value":1\.[68]/g) ?? []
    expect(lithiumRows).toHaveLength(1)
  })
})

describe('count and percentage under one label', () => {
  it('the health summary reports an abnormal ANC and an abnormal NEU% as two analytes', async () => {
    const result = await (toolsFor([
      lab('嗜中性白血球', undefined, 9100, '/uL', { nhi: NHI_PAYMENT, medicloud: true, high: true }),
      lab('嗜中性白血球', undefined, 82, '%', { nhi: NHI_PAYMENT, medicloud: true, high: true }),
    ]).getHealthSummarySnapshot as any).execute({})
    const text = JSON.stringify(result)
    expect(text).toContain('9100')
    expect(text).toContain('82')
  })
})

// ── Differential corpus ────────────────────────────────────────────────────
const SYNTHETIC: any[] = [
  // Same LOINC, different labels.
  lab('Lithium', '14334-7', 0.6, 'mmol/L'), lab('Li', '14334-7', 0.8, 'mmol/L'),
  lab('嗜中性白血球 / Neutrophil', '770-8', 55, '%'), lab('Seg', '770-8', 60, '%'), lab('Neutrophils %', '770-8', 58, '%'),
  lab('嗜中性白血球 / Neutrophil', '751-8', 3.2, '10^3/uL'), lab('ANC', '751-8', 3100, '/uL'),
  lab('Eosinophil', '711-2', 150, '/uL'), lab('Eos count', '711-2', 0.2, '10^3/uL'),
  // Different LOINC, same label — count vs percentage.
  ...([
    ['嗜中性白血球 / Neutrophil', '751-8', '770-8'],
    ['淋巴球 / Lymphocyte', '731-0', '736-9'],
    ['單核球 / Monocyte', '742-7', '5905-5'],
    ['嗜伊紅性白血球 / Eosinophil', '711-2', '713-8'],
    ['嗜鹼性白血球 / Basophil', '704-7', '706-2'],
    ['Band form', '26507-4', '764-1'],
  ] as const).flatMap(([text, count, percent]) => [
    lab(text, count, 3, '10^3/uL', { nhi: NHI_ORDER }), lab(text, percent, 40, '%', { nhi: NHI_ORDER }),
  ]),
  // No LOINC: NHI 08013C rows, MediCloud rows and plain names, count vs %.
  ...['嗜中性白血球', '淋巴球', '單核球', '嗜伊紅性白血球', 'Neutrophil', 'Segment', 'Lymphocyte', 'Monocyte', 'Eosinophil', 'Basophil', 'Band', 'Blast', 'NRBC']
    .flatMap((text) => [
      lab(text, undefined, 2900, '/uL', { nhi: NHI_ORDER }), lab(text, undefined, 61, '%', { nhi: NHI_ORDER }),
      lab(text, undefined, 2.9, 'x10^9/L', { nhi: NHI_PAYMENT, medicloud: true }), lab(text, undefined, 62, '%', { nhi: NHI_PAYMENT, medicloud: true }),
    ]),
  lab('ANC', undefined, 3100, '/uL', { nhi: NHI_PAYMENT, medicloud: true }), lab('ANC', undefined, 60, '%'),
  // Reticulocytes, count vs %.
  lab('Reticulocyte', '14196-0', 60, '10^3/uL'), lab('Reticulocyte', '17849-1', 1.2, '%'),
  lab('Retic', undefined, 55, '10^3/uL'), lab('Retic', undefined, 1.1, '%'),
]

function bundleObservations(): Array<{ source: string; observation: any }> {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((file) => file.endsWith('.json'))
  const out: Array<{ source: string; observation: any }> = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (!text.includes('"Observation"')) continue
    let json: any
    try { json = JSON.parse(text) } catch { continue }
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (node.resourceType === 'Observation') out.push({ source: file, observation: node })
      for (const value of Object.values(node)) walk(value)
    }
    walk(json)
  }
  return out
}

describe('differential: demo / e2e bundles + synthetic corpus', () => {
  const corpora: Array<[string, Array<{ source: string; observation: any }>]> = [
    ['committed bundles', bundleObservations()],
    ['synthetic corpus', SYNTHETIC.map((observation) => ({ source: 'synthetic', observation }))],
  ]

  it.each(corpora)('%s: same LOINC + value family never splits; count and %% never merge', (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0)
    const groups = new Map<string, any[]>()
    const keyByLoinc = new Map<string, Set<string>>()
    for (const { source, observation: raw } of rows) {
      for (const observation of expandObservationValues(raw)) {
        const category = categorizeObservation(observation)?.id
        if (!category) continue
        const key = `${category}|${labCategoryAnalyteKey(observation, category)}`
        groups.set(key, [...(groups.get(key) ?? []), observation])
        const loinc = loincOf(observation)
        if (loinc) {
          const scope = `${source}|${category}|${loinc}|${labValueFamily(observation)}`
          keyByLoinc.set(scope, new Set([...(keyByLoinc.get(scope) ?? []), key]))
        }
      }
    }
    const splits = [...keyByLoinc.entries()].filter(([, keys]) => keys.size > 1)
    expect(splits).toEqual([])
    const mixed = [...groups.entries()]
      .filter(([, members]) => new Set(members.map(unitKind).filter(Boolean)).size > 1)
      .map(([key, members]) => `${key}: ${members.map((m) => `${m.code.text} ${m.valueQuantity?.unit}`).join(', ')}`)
    expect(mixed).toEqual([])
  })
})
