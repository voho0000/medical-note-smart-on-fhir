import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  formatDocumentsSection,
  DOCUMENT_CONTEXT_OMISSION_MARKER,
} from '@/src/core/utils/clinical-documents.utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require('../../scripts/generate-oncology-stress-bundle.cjs') as {
  buildSyntheticOncologyBundle: (options?: { targetTokens?: number }) => { bundle: any; manifest: any }
  validateBundleReferences: (bundle: any) => { resourceCount: number; resolvedReferences: number }
  estimateTokens: (text: string) => number
}

describe('entirely synthetic million-token oncology fixture', () => {
  let fixture: ReturnType<typeof generator.buildSyntheticOncologyBundle>
  let parsed: NonNullable<ReturnType<typeof LocalBundleService.parse>>
  let documents: ReturnType<typeof listClinicalDocuments>

  beforeAll(() => {
    fixture = generator.buildSyntheticOncologyBundle()
    const result = LocalBundleService.parse(fixture.bundle)
    if (!result) throw new Error('Application importer rejected synthetic fixture')
    parsed = result
    documents = listClinicalDocuments(parsed.collection)
  }, 30_000)

  it('contains exactly one fictional patient and no dangling references', () => {
    const validation = generator.validateBundleReferences(fixture.bundle)
    expect(validation.resourceCount).toBe(27_656)
    expect(validation.resolvedReferences).toBeGreaterThan(80_000)
    expect(parsed.patient.id).toBe('synthetic-oncology-million-token-v1')
    expect(fixture.manifest.syntheticOnly).toBe(true)
    for (const { resource } of fixture.bundle.entry) {
      expect(resource.meta.tag[0].code).toBe('synthetic-test-data')
      const period = resource.period
      if (period?.start && period?.end) expect(Date.parse(period.start)).toBeLessThanOrEqual(Date.parse(period.end))
    }
  })

  it('survives the same FHIR mapping used by local JSON imports', () => {
    const data = parsed.collection
    expect(data.encounters).toHaveLength(384)
    expect(data.observations.length + data.vitalSigns.length).toBeGreaterThanOrEqual(25_536)
    expect(data.medications).toHaveLength(768)
    expect(data.diagnosticReports).toHaveLength(192)
    expect(data.compositions).toHaveLength(612)
    expect(data.documentReferences).toHaveLength(48)
    expect(documents.filter(doc => doc.isDischargeSummary)).toHaveLength(96)
  })

  it('exceeds 1.25M estimated tokens in decoded document context, not JSON or base64 padding', () => {
    const section = formatDocumentsSection(resolveSelectedDocuments(documents, 'all', []))
    const text = section?.items.join('\n\n') ?? ''
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(1_250_000)
    expect(text.match(/<BEGIN_DOCUMENT /g)).toHaveLength(660)
    expect(text.match(/<END_DOCUMENT /g)).toHaveLength(660)
    expect(text).not.toContain(DOCUMENT_CONTEXT_OMISSION_MARKER)
    expect(generator.estimateTokens(text)).toBe(tokens)
    expect(text).toContain('合成癌症壓力測試')
    if (process.env.SYNTHETIC_FIXTURE_REPORT === '1') {
      console.info('Synthetic fixture verification', { decodedDocumentContextTokens: tokens, documents: documents.length })
    }
  })

  it('retains the latest discharge despite a newer non-discharge document', () => {
    expect(documents[0].id).toBe('synthetic-newest-non-discharge')
    const latest = resolveSelectedDocuments(documents, 'latestAdmission', [])
    expect(latest.map(doc => doc.id)).toEqual(['synthetic-discharge-95'])
    expect(latest[0].text).toContain('Encounter SYN-096')
    expect(latest[0].text).toContain('Disposition and follow-up documentation')
    expect(estimateTokens(latest[0].text)).toBeLessThan(100_000)
    expect(resolveSelectedDocuments(documents, 'recentAdmissions', [])).toHaveLength(3)
    // 3 institutions × 8 primary diagnoses, repeated over 96 admissions.
    const deduplicated = resolveSelectedDocuments(documents, 'deduplicatedAdmissions', [])
    expect(deduplicated.filter(doc => doc.isDischargeSummary)).toHaveLength(24)
    expect(deduplicated.some(doc => doc.id === 'synthetic-discharge-95')).toBe(true)
    expect(resolveSelectedDocuments(documents, 'custom', ['synthetic-discharge-0']).map(doc => doc.id)).toEqual(['synthetic-discharge-0'])
  })

  it('rejects invalid targets and unresolved fixture references', () => {
    expect(() => generator.buildSyntheticOncologyBundle({ targetTokens: NaN })).toThrow()
    expect(() => generator.buildSyntheticOncologyBundle({ targetTokens: -1 })).toThrow()
    expect(() => generator.validateBundleReferences({ resourceType: 'Bundle', type: 'collection', entry: [{
      fullUrl: 'https://synthetic.example.invalid/fhir/Patient/synthetic',
      resource: { resourceType: 'Patient', id: 'synthetic', managingOrganization: { reference: 'Organization/missing' } },
    }] })).toThrow('Unresolved reference')
  })
})
