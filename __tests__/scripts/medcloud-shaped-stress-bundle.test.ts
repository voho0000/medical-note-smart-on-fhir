import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  extractDocumentKeySections,
} from '@/src/core/utils/clinical-documents.utils'
import { isMedicationCurrentlyInUse, medicationExpectedEnd } from '@/src/core/utils/clinical-context-selection.utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require('../../scripts/generate-medcloud-shaped-stress-bundle.cjs') as {
  buildMedcloudShapedBundle: (options?: { extraRestagingRounds?: number }) => { bundle: any; manifest: any }
  MODULE_SCOPES: Record<string, string>
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateBundleReferences } = require('../../scripts/generate-oncology-stress-bundle.cjs')

const AS_OF_MS = Date.parse('2026-09-03T00:00:00Z')
const DAY_MS = 86_400_000

describe('Medcloud-bridge-shaped synthetic oncology fixture', () => {
  let fixture: ReturnType<typeof generator.buildMedcloudShapedBundle>
  let parsed: NonNullable<ReturnType<typeof LocalBundleService.parse>>
  let documents: ReturnType<typeof listClinicalDocuments>

  beforeAll(() => {
    fixture = generator.buildMedcloudShapedBundle()
    const result = LocalBundleService.parse(fixture.bundle)
    if (!result) throw new Error('Application importer rejected the bridge-shaped fixture')
    parsed = result
    documents = listClinicalDocuments(parsed.collection)
  }, 60_000)

  it('carries the bridge bundle envelope and resolves every reference', () => {
    expect(fixture.bundle.type).toBe('collection')
    expect(fixture.bundle.meta.source).toBe('https://medcloud2.nhi.gov.tw/')
    const tagCodes = fixture.bundle.meta.tag.map((tag: any) => tag.code)
    expect(tagCodes).toContain('clinical-reference')
    expect(tagCodes).toContain('complete-for-requested-modules')
    for (const imueModule of Object.keys(generator.MODULE_SCOPES)) {
      expect(tagCodes).toContain(imueModule.toLowerCase())
      expect(tagCodes).toContain(`${imueModule.toLowerCase()}-complete`)
    }
    for (const entry of fixture.bundle.entry) {
      expect(entry.fullUrl).toBe(
        `https://cloud-wildcatch.invalid/fhir/${entry.resource.resourceType}/${entry.resource.id}`,
      )
    }
    expect(validateBundleReferences(fixture.bundle)).toEqual({ resourceCount: 2_301, resolvedReferences: 4_558 })
    expect(fixture.manifest.syntheticOnly).toBe(true)
  })

  it('gives every clinical resource exactly one Provenance, and Patient/Organization none', () => {
    const resources = fixture.bundle.entry.map(({ resource }: any) => resource)
    const targets = new Map<string, number>()
    for (const resource of resources.filter((r: any) => r.resourceType === 'Provenance')) {
      const target = resource.target[0].reference
      targets.set(target, (targets.get(target) ?? 0) + 1)
      expect(resource.agent[0].who.display).toBe('雲端懷爾抓抓')
      expect(resource.recorded).toBe(fixture.bundle.timestamp)
    }
    for (const resource of resources) {
      const key = `${resource.resourceType}/${resource.id}`
      const clinical = !['Patient', 'Organization', 'Provenance'].includes(resource.resourceType)
      expect(targets.get(key) ?? 0).toBe(clinical ? 1 : 0)
      if (clinical) {
        expect(resource.meta.source).toBe('https://medcloud2.nhi.gov.tw/')
        expect(resource.meta.tag.map((tag: any) => tag.code)).toContain('clinical-reference')
      }
    }
    expect(targets.size).toBe(fixture.manifest.resourceCounts.Provenance)
  })

  it('imports through LocalBundleService with the expected per-type counts', () => {
    expect(parsed.patient.id).toMatch(/^mc-[0-9a-f]{32}$/)
    expect(parsed.collection.encounters).toHaveLength(196)
    expect(parsed.collection.observations).toHaveLength(251)
    expect(parsed.collection.vitalSigns).toHaveLength(0)
    expect(parsed.collection.diagnosticReports).toHaveLength(241)
    expect(parsed.collection.medications).toHaveLength(263)
    expect(parsed.collection.medicationRemainingSummaries).toHaveLength(6)
    expect(parsed.collection.procedures).toHaveLength(20)
    expect(parsed.collection.documentReferences).toHaveLength(120)
    expect(parsed.collection.compositions).toHaveLength(3)
    // The bridge emits none of these; parse() must not invent them either.
    expect(parsed.collection.conditions).toHaveLength(0)
    expect(parsed.collection.allergies).toHaveLength(0)
    expect(parsed.collection.imagingStudies).toHaveLength(0)
  })

  it('models the bridge medication convention so all three currency buckets are exercised', () => {
    const medications = parsed.collection.medications as any[]
    expect(medications.every((medication) => medication.status === 'unknown')).toBe(true)
    expect(medications.every((medication) => medication.intent === 'order')).toBe(true)
    for (const medication of medications) {
      const supply = medication.dispenseRequest?.expectedSupplyDuration
      expect(supply).toMatchObject({ unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' })
      expect(medication.authoredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const urls = (medication.extension ?? []).map((extension: any) => extension.url)
      expect(urls).toContain('https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-medication-end-date')
      expect(urls).toContain('https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-single-prescription-remaining-days')
    }

    // `status` is uninformative on bridge rows: currency is days-supply only.
    const current = medications.filter((medication) => isMedicationCurrentlyInUse(medication, AS_OF_MS))
    const ends = medications.map((medication) => Date.parse(medicationExpectedEnd(medication) as string))
    const recentlyEnded = ends.filter((end) => end < AS_OF_MS - DAY_MS && end >= AS_OF_MS - 90 * DAY_MS)
    const historical = ends.filter((end) => end < AS_OF_MS - 365 * DAY_MS)
    expect(current.length).toBeGreaterThanOrEqual(6)
    expect(recentlyEnded.length).toBeGreaterThanOrEqual(4)
    expect(historical.length).toBeGreaterThan(150)
    expect(fixture.manifest.medicationMix.chronicRefills).toBe(186)
    expect(fixture.manifest.medicationMix.acuteCourses).toBe(61)
    expect(fixture.manifest.medicationMix.longRunningOrders).toBe(16)
  })

  it('carries 出院病摘 as base64 HTML DocumentReferences that deduplicate into admission groups', () => {
    expect(documents).toHaveLength(123)
    const discharges = documents.filter((document) => document.isDischargeSummary)
    expect(discharges).toHaveLength(120)
    // 96 admissions over 3 institutions x 8 ICD reasons = 24 (institution, ICD)
    // groups; the 24 cross-institution duplicates resolve to the same
    // Encounters, so they must collapse into those same groups.
    const deduplicated = resolveSelectedDocuments(documents, 'deduplicatedAdmissions', [])
    expect(deduplicated).toHaveLength(24)
    expect(new Set(discharges.map((document) => document.dischargeDeduplicationKey)).size).toBe(24)
    expect(resolveSelectedDocuments(documents, 'latestAdmission', [])).toHaveLength(1)

    const raw = fixture.bundle.entry
      .map(({ resource }: any) => resource)
      .filter((resource: any) => resource.resourceType === 'DocumentReference')
    for (const resource of raw) {
      expect(resource.type.coding[0].code).toBe('18842-5')
      expect(resource.type.text).toBe('出院病摘')
      expect(resource.content[0].attachment.contentType).toBe('text/html')
      expect(resource.content[0].attachment.language).toBe('zh-TW')
      expect(resource.date).toBeUndefined()
      expect(resource.context.period.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    // The NHI 出院病摘 layout survives base64 -> HTML -> text, so the key-section
    // extractor still finds the dense sections and drops the bulky ones.
    const keySections = extractDocumentKeySections(discharges[0].text ?? '')
    expect(keySections.extracted).toBe(true)
    expect(keySections.text).toContain('出院診斷')
    expect(keySections.text).toContain('出院指示')
    expect(keySections.text).not.toContain('理學檢查發現')
    expect(keySections.text.length).toBeLessThan((discharges[0].text ?? '').length)
  })

  it('keeps the bridge lab / imaging / preventive conventions and exceeds a million tokens', () => {
    const resources = fixture.bundle.entry.map(({ resource }: any) => resource)
    const labObservation = resources.find((resource: any) =>
      resource.resourceType === 'Observation'
      && resource.category?.[0]?.coding?.[0]?.code === 'laboratory')
    expect(labObservation.status).toBe('unknown')
    expect(labObservation.code.coding[0].system).toBe('http://loinc.org')
    expect(labObservation.code.coding[2].system).toBe('https://cloud-wildcatch.invalid/fhir/upstream-local/CodeSystem/his-local-lab')
    expect(labObservation.referenceRange[0].text).toBeTruthy()
    expect(labObservation.interpretation[0].coding[0].system)
      .toBe('http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation')
    expect(labObservation.specimen.reference).toBeUndefined()

    const imaging = resources.filter((resource: any) =>
      resource.resourceType === 'DiagnosticReport'
      && resource.category?.[0]?.coding?.[0]?.code === 'RAD')
    expect(imaging).toHaveLength(193)
    expect(imaging.every((resource: any) => typeof resource.conclusion === 'string' && resource.conclusion.length > 200)).toBe(true)
    expect(imaging[0].identifier[0].system).toBe('https://cloud-wildcatch.invalid/fhir/IdentifierSystem/medcloud-imaging-case')

    const composition = resources.find((resource: any) => resource.resourceType === 'Composition')
    expect(composition.type.coding[0].code).toBe('75484-6')
    expect(composition.section).toHaveLength(9)
    expect(composition.section.map((section: any) => section.code.coding[0].code)).toEqual([
      'general-examination', 'blood-pressure', 'blood-lipids', 'blood-glucose', 'renal-function',
      'uric-acid', 'urinalysis', 'metabolic-syndrome', 'liver-function',
    ])

    const json = JSON.stringify(fixture.bundle, null, 2) + '\n'
    const tokens = estimateTokens(json)
    expect(tokens).toBeGreaterThan(1_000_000)
    if (process.env.SYNTHETIC_FIXTURE_REPORT === '1') {
      console.info('Medcloud-shaped fixture', {
        tokens, bytes: Buffer.byteLength(json), entries: fixture.bundle.entry.length,
      })
    }
  })
})
