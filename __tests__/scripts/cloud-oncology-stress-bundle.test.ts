import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { imagingReportsCategory } from '@/src/core/categories/imaging-reports.category'
import { ALL_DATA_FILTERS } from '@/src/shared/constants/data-selection.constants'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { listClinicalDocuments, formatDocumentsSection, resolveSelectedDocuments, DOCUMENT_CONTEXT_OMISSION_MARKER } from '@/src/core/utils/clinical-documents.utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCloudOncologyBundle, reportBody } = require('../../scripts/generate-cloud-oncology-stress-bundle.cjs') as {
  buildCloudOncologyBundle: (options?: { targetTokens?: number }) => { bundle: any; manifest: any }
  reportBody: (type: string, admission: number, serial: number, date: string) => string
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateBundleReferences } = require('../../scripts/generate-oncology-stress-bundle.cjs')

describe('cloud-record-shaped synthetic oncology fixture', () => {
  let fixture: ReturnType<typeof buildCloudOncologyBundle>
  let parsed: NonNullable<ReturnType<typeof LocalBundleService.parse>>
  beforeAll(() => {
    fixture = buildCloudOncologyBundle()
    const result = LocalBundleService.parse(fixture.bundle)
    if (!result) throw new Error('Synthetic cloud fixture failed application import')
    parsed = result
  }, 30_000)

  it('has no progress notes or vital signs, and retains 96 discharge summaries', () => {
    expect(parsed.collection.vitalSigns).toHaveLength(0)
    expect(parsed.collection.observations).toHaveLength(24_192)
    // 768 historical inpatient courses + 6 chronic orders + 6 refills + 4 recent.
    expect(parsed.collection.medications).toHaveLength(784)
    const documents = listClinicalDocuments(parsed.collection)
    expect(documents).toHaveLength(97)
    expect(documents.filter(doc => doc.isDischargeSummary)).toHaveLength(96)
    expect(documents.some(doc => /progress|11506-3/i.test(doc.title))).toBe(false)
    expect(fixture.bundle.entry.some(({ resource }: any) => resource.id.startsWith('synthetic-progress-'))).toBe(false)
    expect(resolveSelectedDocuments(documents, 'latestAdmission', []).map(doc => doc.id)).toEqual(['synthetic-discharge-95'])
    expect(documents[0].id).toBe('synthetic-newest-non-discharge')
  })

  it('retains all radiology and pathology reports in the real AI report category', () => {
    const reports = imagingReportsCategory.extractData(parsed.collection)
    const filters = ALL_DATA_FILTERS as unknown as Parameters<typeof imagingReportsCategory.getCount>[1]
    expect(parsed.collection.diagnosticReports).toHaveLength(2_328)
    expect(reports).toHaveLength(2_328)
    expect(imagingReportsCategory.getCount(reports, filters, parsed.collection)).toBe(2_328)
    expect(fixture.manifest.reportCounts).toEqual({ CXR: 1344, CT: 443, MRI: 192, US: 192, PATH: 48, IHC: 48, REVIEW: 48, CYTO: 13 })
    // Stable repeated names exercise the existing latest-by-name filter.
    expect(imagingReportsCategory.getCount(
      reports,
      { ...filters, imagingReportVersion: 'latest' } as Parameters<typeof imagingReportsCategory.getCount>[1],
      parsed.collection,
    )).toBeLessThan(30)
  })

  it('exceeds one million tokens of raw report + discharge narrative, without truncation or duplicated attachment bodies', () => {
    // The ceiling is a property of the FIXTURE, so it is measured on the source
    // narratives — not through the AI report formatter, which now deliberately
    // reduces radiology/pathology reports to their impression (see the next
    // test and src/core/utils/imaging-impression.utils.ts).
    const rawReportText = fixture.bundle.entry
      .map(({ resource }: any) => resource)
      .filter((resource: any) => resource.resourceType === 'DiagnosticReport')
      .map((resource: any) => resource.conclusion
        ?? (resource.presentedForm ?? [])
          .map((attachment: any) => attachment.data ? Buffer.from(attachment.data, 'base64').toString('utf8') : '')
          .join('\n'))
      .join('\n\n')
    const docs = formatDocumentsSection(listClinicalDocuments(parsed.collection))
    const documentText = docs?.items.join('\n\n') ?? ''
    const context = [documentText, rawReportText].join('\n\n')
    expect(estimateTokens(context)).toBeGreaterThan(1_100_000)
    expect(documentText).not.toContain(DOCUMENT_CONTEXT_OMISSION_MARKER)
    expect(rawReportText).toContain('No significant interval change.')
    expect(rawReportText).toContain('ADDENDUM: additional immunostains')
    expect(rawReportText).toContain('OUTSIDE SLIDE REVIEW:')
    expect(rawReportText).toContain('SPECIMEN: left pleural fluid')
    for (const { resource } of fixture.bundle.entry.filter(({ resource }: any) => resource.resourceType === 'DiagnosticReport')) {
      expect(Boolean(resource.conclusion) !== Boolean(resource.presentedForm?.length)).toBe(true)
    }
    if (process.env.SYNTHETIC_FIXTURE_REPORT === '1') console.info('Cloud fixture verification', {
      rawReportTokens: estimateTokens(rawReportText), documentTokens: estimateTokens(documentText), combinedTokens: estimateTokens(context),
    })
  })

  it('renders those reports impression-first in the AI context, far below the raw ceiling', () => {
    const reports = imagingReportsCategory.extractData(parsed.collection)
    const reportSection = imagingReportsCategory.getContextSection(
      reports,
      ALL_DATA_FILTERS as unknown as Parameters<typeof imagingReportsCategory.getContextSection>[1],
      parsed.collection,
    )
    if (Array.isArray(reportSection)) throw new Error('Expected one report section')
    const reportText = reportSection?.items.join('\n\n') ?? ''

    // Conclusions survive for every report shape in the fixture …
    expect(reportText).toContain('IMPRESSION:')
    expect(reportText).toContain('DIAGNOSIS: metastatic carcinoma')
    expect(reportText).toContain('INTERPRETATION:')
    // … and every report is still individually citable by date + title.
    expect(reportSection?.items.filter((item) => /^\d{4}-\d{2}-\d{2} \| /.test(item)).length)
      .toBeGreaterThan(2_000)
    // … while the descriptive sections that dominated the raw text are gone.
    expect(reportText).not.toContain('TECHNIQUE:')
    expect(reportText).not.toContain('GROSS DESCRIPTION:')
    expect(estimateTokens(reportText)).toBeLessThan(400_000)
  })

  it('models short repeated CXR noise and longer cross-sectional reports', () => {
    for (let a = 0; a < 96; a++) {
      expect(estimateTokens(reportBody('CXR', a, 0, '2026-01-01'))).toBeLessThan(400)
      expect(estimateTokens(reportBody('CT', a, 0, '2026-01-01'))).toBeGreaterThan(700)
    }
  })

  it('resolves every reference and links addendum/review to the original specimen', () => {
    expect(validateBundleReferences(fixture.bundle).resourceCount).toBe(27_961)
    const reports = fixture.bundle.entry.map(({ resource }: any) => resource)
    for (let a = 0; a < 96; a += 2) {
      const original = reports.find((r: any) => r.id === `synthetic-cloud-path-${a}-0`)
      const addendum = reports.find((r: any) => r.id === `synthetic-cloud-ihc-${a}-0`)
      const review = reports.find((r: any) => r.id === `synthetic-cloud-review-${a}-0`)
      expect(addendum.specimen).toEqual(original.specimen)
      expect(review.specimen).toEqual(original.specimen)
    }
    expect(() => buildCloudOncologyBundle({ targetTokens: NaN })).toThrow()
  })
})
