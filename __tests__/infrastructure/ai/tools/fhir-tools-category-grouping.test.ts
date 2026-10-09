/**
 * @jest-environment node
 *
 * queryLabResultsByCategory groups by the cumulative report's analyte
 * identity only where that identity is a recognised analyte; otherwise it
 * keeps the LOINC-keyed grouping, so distinct tests that share a panel-level
 * name (CBC differential rows all named 白血球分類計數) are never merged.
 * The sweep runs every category over the repository's demo / e2e bundles and
 * proves the new grouping never yields fewer analytes than the old one,
 * except for listed merges of known-equivalent codes.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getAnalyteCanonicalKey, getAnalyteLabel } from '@voho0000/clinical-lab-normalization/canonical'
import { createFhirTools, labCategoryAnalyteKey } from '@/src/infrastructure/ai/tools/fhir-tools'
import { LAB_CATEGORIES, categorizeObservation } from '@/src/shared/utils/lab-categories'
import { expandObservationValues } from '@/src/core/utils/observation-value.utils'
import { samplePatient, sampleCollection } from './fixtures'

const toolsFor = (observations: any[]) => createFhirTools(() => ({
  patient: samplePatient,
  collection: { ...sampleCollection, observations, vitalSigns: [] },
}))

describe('queryLabResultsByCategory never merges distinct unrecognised tests', () => {
  it('keeps 731-0 and 751-8 apart when both are named 白血球分類計數', async () => {
    const row = (id: string, loinc: string, value: number) => ({
      resourceType: 'Observation', id, status: 'final',
      category: [{ coding: [{ code: 'laboratory' }] }],
      code: { text: '白血球分類計數', coding: [{ system: 'http://loinc.org', code: loinc }] },
      valueQuantity: { value, unit: '' },
      effectiveDateTime: '2026-10-09T08:00:00+08:00',
    })
    const result = await (toolsFor([row('a', '731-0', 2), row('b', '751-8', 5)]).queryLabResultsByCategory as any)
      .execute({ category: 'cbc' })
    expect(result.analyteCount).toBe(2)
    expect(result.data.flatMap((g: any) => g.results.map((r: any) => r.value)).sort()).toEqual([2, 5])
    expect(result.truncated).toBe(false)
  })
})

// The pre-change key: canonical analyte, else LOINC, else the label.
function oldKey(observation: any): string {
  const loinc = (observation?.code?.coding ?? []).find((c: any) => /loinc/i.test(c.system || ''))?.code
  return getAnalyteCanonicalKey(observation) ?? loinc ?? getAnalyteLabel(observation).normalize('NFKC').toUpperCase()
}

function bundleObservations(path: string): any[] {
  const bundle = JSON.parse(readFileSync(path, 'utf8'))
  return (bundle.entry ?? []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === 'Observation')
}

const ROOT = process.cwd()
const BUNDLES = [
  'public/demo/demo-bundle.json',
  ...readdirSync(join(ROOT, 'public/demo/hfrEF')).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => `public/demo/hfrEF/${f}`),
  'e2e/fixtures/hospital-cdss-bundle.json',
  'e2e/fixtures/medcloud-hepatitis-bundle.json',
  'e2e/fixtures/synthetic-bundle.json',
]

// Merges the pivot makes on purpose: old keys (LOINC / label) that name the
// same analyte. Key: new group key → the old keys it unites.
const KNOWN_EQUIVALENT_MERGES: Record<string, string[]> = {}

describe('category grouping sweep over demo / e2e bundles', () => {
  it.each(BUNDLES)('%s: no category loses distinct analytes', async (path) => {
    const observations = bundleObservations(join(ROOT, path))
    const tools = toolsFor(observations)
    const merges: Record<string, string[]> = {}
    for (const category of LAB_CATEGORIES.map((c) => c.id)) {
      const rows = observations
        .flatMap((o) => expandObservationValues(o))
        .filter((o: any) => String(o?.status ?? '').toLowerCase() !== 'entered-in-error'
          && categorizeObservation(o)?.id === category)
      const oldKeys = new Set(rows.map(oldKey))
      const byNew = new Map<string, Set<string>>()
      for (const o of rows) {
        const key = labCategoryAnalyteKey(o, category)
        if (!byNew.has(key)) byNew.set(key, new Set())
        byNew.get(key)!.add(oldKey(o))
      }
      for (const [key, olds] of byNew) {
        if (olds.size > 1) merges[`${category}:${key}`] = [...olds].sort()
      }
      const result = await (tools.queryLabResultsByCategory as any).execute({ category, limit: 1000 })
      expect(result.analyteCount).toBe(byNew.size)
      expect(result.truncated).toBe(false)
      // Group counts add up to every row the tool matched (undated rows are
      // outside its date filter, so compare with its own count).
      expect(result.data.reduce((n: number, g: any) => n + g.observationCount, 0)).toBe(result.observationCount)
      // Fewer analytes than before only through listed merges.
      const merged = [...byNew.values()].reduce((n, olds) => n + olds.size - 1, 0)
      expect(byNew.size).toBeGreaterThanOrEqual(oldKeys.size - merged)
    }
    for (const [key, olds] of Object.entries(merges)) {
      expect({ key, olds }).toEqual({ key, olds: KNOWN_EQUIVALENT_MERGES[key] })
    }
  })
})
