// 影像與病理重點 finalize — the app writes every row; a model quote is shown
// only when it occurs verbatim in the report. Synthetic fixtures only.
import {
  buildSourceCatalog,
  ensureReportHighlights,
  generateMedicalSummaryUseCase as useCase,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

const RAD = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD' }] }]

const CT_TEXT = [
  'Technique: Contrast-enhanced CT of the chest.',
  'Findings: A 12 mm part-solid nodule in the right upper lobe.',
  'No definite evidence of mediastinal lymphadenopathy.',
  'Impression:',
  'Suspect primary lung cancer, cT1bN0. Suggest   tissue proof.',
].join('\n')
const PATH_TEXT = '病理診斷：大腸，乙狀結腸，切片：管狀腺瘤，低度分化不良。'
const XRAY_TEXT = '報告人：測試醫師\nThe heart size is normal. Both lungs are clear.'

const report = (id: string, date: string, title: string, conclusion: string) => ({
  id,
  status: 'final',
  category: RAD,
  code: { text: title },
  effectiveDateTime: `${date}T09:00:00+08:00`,
  conclusion,
  performer: [{ display: '示範測試醫院' }],
})

const clinicalData = {
  diagnosticReports: [
    report('ct-1', '2026-06-24', '電腦斷層造影', CT_TEXT),
    report('path-1', '2026-05-02', '病理組織檢查', PATH_TEXT),
    report('xr-1', '2026-01-10', 'Chest X-ray', XRAY_TEXT),
  ],
} as any
const catalog = buildSourceCatalog(clinicalData)
const keyOf = (resourceId: string) => catalog.find((entry) => entry.resourceId === resourceId)!.key
const CT = keyOf('ct-1')
const PATH = keyOf('path-1')
const XR = keyOf('xr-1')

const finalize = (reports: Array<{ ref: string; quotes: string[] }>, extra: Record<string, unknown> = {}) =>
  useCase.finalizeResult(
    { ...useCase.createEmptyAiResult(), reports, ...extra },
    catalog,
    { clinicalData, audience: 'medical', locale: 'zh-TW' },
  ).reportHighlights!

const row = (highlights: ReturnType<typeof finalize>, key: string) =>
  highlights.items.find((item) => item.key === key)!

describe('影像與病理重點 finalize', () => {
  it('keeps an exact quote and shows it as the source text', () => {
    const highlights = finalize([{ ref: CT, quotes: ['Suspect primary lung cancer, cT1bN0.'] }])
    expect(row(highlights, CT)).toMatchObject({
      excerpts: ['Suspect primary lung cancer, cT1bN0.'],
      excerptSource: 'ai',
    })
    expect(highlights.aiSummarized).toBe(1)
    expect(highlights.droppedQuoteCount).toBe(0)
  })

  it('keeps a whitespace-only difference but displays the report\'s own spacing', () => {
    const highlights = finalize([{ ref: CT, quotes: ['Suggest tissue proof.'] }])
    expect(row(highlights, CT).excerpts).toEqual(['Suggest   tissue proof.'])
  })

  it('drops an altered negation and counts it', () => {
    const highlights = finalize([{
      ref: CT,
      quotes: ['No evidence of mediastinal lymphadenopathy.', 'Suspect primary lung cancer, cT1bN0.'],
    }])
    expect(row(highlights, CT).excerpts).toEqual(['Suspect primary lung cancer, cT1bN0.'])
    expect(highlights.droppedQuoteCount).toBe(1)
  })

  it('drops a translated quote and falls back to the conclusion section', () => {
    const highlights = finalize([{ ref: PATH, quotes: ['Sigmoid colon biopsy: tubular adenoma, low-grade dysplasia.'] }])
    expect(row(highlights, PATH)).toMatchObject({
      excerpts: ['大腸，乙狀結腸，切片：管狀腺瘤，低度分化不良。'],
      excerptSource: 'conclusion',
    })
    expect(highlights.droppedQuoteCount).toBe(1)
    expect(highlights.aiSummarized).toBe(0)
  })

  it('falls back to the conclusion, then to the opening for a report the model skipped', () => {
    const highlights = finalize([])
    expect(row(highlights, CT)).toMatchObject({
      excerpts: ['Suspect primary lung cancer, cT1bN0. Suggest   tissue proof.'],
      excerptSource: 'conclusion',
    })
    expect(row(highlights, XR)).toMatchObject({
      excerpts: ['The heart size is normal. Both lungs are clear.'],
      excerptSource: 'opening',
    })
    expect(highlights.totalReports).toBe(3)
  })

  it('dedupes, keeps model order and shows at most three quotes', () => {
    const highlights = finalize([{
      ref: `[${CT.toLowerCase()}]`,
      quotes: [
        'No definite evidence of mediastinal lymphadenopathy.',
        'No definite evidence of mediastinal lymphadenopathy.',
        'Suspect primary lung cancer, cT1bN0.',
        'A 12 mm part-solid nodule in the right upper lobe.',
        'Contrast-enhanced CT of the chest.',
      ],
    }])
    expect(row(highlights, CT).excerpts).toEqual([
      'No definite evidence of mediastinal lymphadenopathy.',
      'Suspect primary lung cancer, cT1bN0.',
      'A 12 mm part-solid nodule in the right upper lobe.',
    ])
    expect(highlights.droppedQuoteCount).toBe(0)
  })

  it('counts quotes filed under a key that names no listed report', () => {
    const highlights = finalize([{ ref: 'L999', quotes: ['Suspect primary lung cancer, cT1bN0.'] }])
    expect(highlights.droppedQuoteCount).toBe(1)
    expect(highlights.aiSummarized).toBe(0)
  })

  it('writes title, date, organization and modality from the catalog, whatever the model sends', () => {
    const parsed = useCase.parseModuleResult('reports', JSON.stringify({
      reports: [{
        ref: CT,
        title: 'PET-CT whole body',
        date: '1999-01-01',
        organization: 'Invented Hospital',
        quotes: ['Suspect primary lung cancer, cT1bN0.'],
      }],
    }))!
    const highlights = finalize(parsed.reports)
    const entry = catalog.find((candidate) => candidate.key === CT)!
    expect(row(highlights, CT)).toEqual({
      key: CT,
      resourceType: 'DiagnosticReport',
      resourceId: 'ct-1',
      kind: 'ct',
      title: entry.display,
      date: '2026-06-24',
      organization: '示範測試醫院',
      excerpts: ['Suspect primary lung cancer, cT1bN0.'],
      excerptSource: 'ai',
    })
  })

  it('renders the overflow past the request cap with the deterministic fallback', () => {
    const many = {
      diagnosticReports: Array.from({ length: 33 }, (_, index) => report(
        `xr-${index}`,
        `2025-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
        'Chest X-ray',
        `Impression: Finding number ${index}, stable.`,
      )),
    } as any
    const manyCatalog = buildSourceCatalog(many)
    const result = useCase.finalizeResult(useCase.createEmptyAiResult(), manyCatalog, {
      clinicalData: many, audience: 'medical', locale: 'zh-TW',
    }).reportHighlights!
    expect(result.totalReports).toBe(33)
    expect(result.items).toHaveLength(33)
    expect(result.items.every((item) => item.excerptSource === 'conclusion' && item.excerpts.length === 1)).toBe(true)
    // Newest first across the cap boundary.
    const dates = result.items.map((item) => item.date ?? '')
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('is clinician-only', () => {
    const patient = useCase.finalizeResult(useCase.createEmptyAiResult(), catalog, {
      clinicalData, audience: 'patient', locale: 'zh-TW',
    })
    expect(patient.reportHighlights).toBeUndefined()
  })
})

describe('影像與病理重點 across card retries', () => {
  const first = useCase.finalizeResult(
    {
      ...useCase.createEmptyAiResult(),
      headline: 'h',
      reports: [{ ref: CT, quotes: ['Suggest tissue proof.', 'No evidence of mediastinal lymphadenopathy.'] }],
    },
    catalog,
    { clinicalData, audience: 'medical', locale: 'zh-TW' },
  )

  it('keeps verified quotes and the dropped count when another card is retried', () => {
    expect(first.reportHighlights!.droppedQuoteCount).toBe(1)
    const draft = useCase.createAiDraftFromResult(first)
    const retried = useCase.mergeModuleResult(draft, 'recent', { recent: [] })
    const again = useCase.finalizeResult(retried, catalog, { clinicalData, audience: 'medical', locale: 'zh-TW' })
    expect(again.reportHighlights).toEqual(first.reportHighlights)
  })

  it('replaces the quotes when the reports card itself is retried', () => {
    const draft = useCase.createAiDraftFromResult(first)
    const retried = useCase.mergeModuleResult(draft, 'reports', {
      reports: [{ ref: PATH, quotes: ['管狀腺瘤，低度分化不良。'] }],
    })
    const again = useCase.finalizeResult(retried, catalog, { clinicalData, audience: 'medical', locale: 'zh-TW' }).reportHighlights!
    expect(row(again, CT).excerptSource).toBe('conclusion')
    expect(row(again, PATH)).toMatchObject({ excerpts: ['管狀腺瘤，低度分化不良。'], excerptSource: 'ai' })
    expect(again.droppedQuoteCount).toBe(0)
  })

  it('gives a result finalized before the section existed its deterministic rows', () => {
    const { reportHighlights: _omit, ...rest } = first
    const legacy: MedicalSummaryResult = rest
    const presented = ensureReportHighlights(legacy, { clinicalData, catalog, audience: 'medical' })!
    expect(presented.reportHighlights!.items.map((item) => item.excerptSource)).toEqual(['conclusion', 'conclusion', 'opening'])
    expect(ensureReportHighlights(legacy, { clinicalData, catalog, audience: 'patient' })).toBe(legacy)
    expect(ensureReportHighlights(first, { clinicalData, catalog, audience: 'medical' })).toBe(first)
  })
})
