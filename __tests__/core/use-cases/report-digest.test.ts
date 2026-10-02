// 影像與病理重點 digest — which reports are summarised, in what order, with
// what prompt text, and how they are split into requests. Synthetic fixtures.
import { buildSourceCatalog } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import {
  buildReportDigest,
  buildReportPromptBody,
  cutAtSentenceBoundary,
  deterministicReportExcerpt,
  findConclusionSection,
} from '@/src/core/use-cases/medical-summary/report-digest'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

const RAD = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD' }] }]
const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }]

const report = (
  id: string,
  date: string,
  title: string,
  conclusion: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  status: 'final',
  category: RAD,
  code: { text: title },
  effectiveDateTime: `${date}T09:00:00+08:00`,
  conclusion,
  performer: [{ display: '示範測試醫院' }],
  ...extra,
})

const digestFor = (reports: any[], options?: Parameters<typeof buildReportDigest>[1]) => {
  const clinicalData = { diagnosticReports: reports } as any
  const catalog = buildSourceCatalog(clinicalData)
  return { digest: buildReportDigest({ clinicalData, catalog }, options), catalog }
}

describe('report digest — scope and order', () => {
  it('keeps imaging and pathology reports with text, newest first, and drops labs and empty reports', () => {
    const { digest, catalog } = digestFor([
      report('ct-1', '2026-03-01', '電腦斷層造影', 'Impression: No acute lesion.'),
      report('lab-1', '2026-06-01', 'CBC', 'WBC 5.1', { category: LAB }),
      report('path-1', '2026-05-10', '病理組織檢查', 'Diagnosis: Tubular adenoma, low grade.'),
      report('us-1', '2026-04-02', '腹部超音波', ''),
      report('mri-1', '2026-04-20', 'MRI of brain', 'Conclusion: Old lacunar infarct.'),
    ])
    expect(digest.items.map((item) => item.resourceId)).toEqual(['path-1', 'mri-1', 'ct-1'])
    expect(digest.items.map((item) => item.kind)).toEqual(['pathology', 'mri', 'ct'])
    expect(digest.overflow).toEqual([])
    // Every item resolves to its own catalog key and carries the catalog's
    // display, date and organization.
    for (const item of digest.items) {
      const entry = catalog.find((candidate) => candidate.key === item.key)!
      expect(entry.resourceId).toBe(item.resourceId)
      expect(item.title).toBe(entry.display)
      expect(item.date).toBe(entry.date)
      expect(item.organization).toBe('示範測試醫院')
    }
  })

  it('skips a report that has no catalog key', () => {
    const reports = [report('ct-1', '2026-03-01', '電腦斷層造影', 'Impression: No acute lesion.')]
    const digest = buildReportDigest({ clinicalData: { diagnosticReports: reports } as any, catalog: [] })
    expect(digest.items).toEqual([])
  })

  it('collapses the bilingual duplicate of one study but keeps different studies of the same day', () => {
    const { digest } = digestFor([
      report('ct-zh', '2026-04-20', '電腦斷層造影', 'Impression: RUL nodule 8 mm.', { identifier: [{ value: 'ACC-2' }] }),
      report('ct-en', '2026-04-20', 'CT chest with contrast', 'Impression: RUL nodule 8 mm.', { identifier: [{ value: 'ACC-2' }] }),
      report('ct-head', '2026-04-20', '電腦斷層造影', 'Impression: No ICH.', { identifier: [{ value: 'ACC-3' }] }),
    ])
    expect(digest.items.map((item) => item.resourceId).sort()).toEqual(['ct-head', 'ct-zh'])
  })

  it('caps the request at maxReports and returns the rest as overflow, still newest first', () => {
    const reports = Array.from({ length: 5 }, (_, index) =>
      report(`x-${index}`, `2026-0${index + 1}-01`, 'Chest X-ray', `Impression: Finding number ${index}.`))
    const { digest } = digestFor(reports, { maxReports: 3 })
    expect(digest.items.map((item) => item.resourceId)).toEqual(['x-4', 'x-3', 'x-2'])
    expect(digest.overflow.map((item) => item.resourceId)).toEqual(['x-1', 'x-0'])
    expect(digest.chunks.flatMap((chunk) => chunk.items)).toHaveLength(3)
  })
})

describe('report digest — prompt text', () => {
  it('opens each report with an app-written header line', () => {
    const { digest } = digestFor([
      report('ct-1', '2026-06-24', '電腦斷層造影', 'Impression: No acute lesion.'),
    ])
    const [item] = digest.items
    expect(item.promptText.split('\n')[0]).toBe(`[${item.key}] CT · 2026-06-24 · 示範測試醫院 · 電腦斷層造影`)
  })

  it('puts the conclusion section first, then the rest of the body', () => {
    const narrative = [
      'Technique: Axial images of the chest.',
      'Findings: A 12 mm nodule in the right upper lobe.',
      'IMPRESSION:',
      'Suspect primary lung cancer, cT1bN0.',
    ].join('\n')
    const body = buildReportPromptBody(narrative)
    expect(body.hasConclusion).toBe(true)
    expect(body.text.startsWith('IMPRESSION:\nSuspect primary lung cancer, cT1bN0.')).toBe(true)
    expect(body.text).toContain('Findings: A 12 mm nodule')
    expect(body.text.indexOf('Findings:')).toBeGreaterThan(body.text.indexOf('Suspect primary'))
  })

  it('lets the last conclusion header win and does not treat "Clinical diagnosis" as one', () => {
    const narrative = [
      'Clinical diagnosis: R/O lung cancer',
      'Impression: Initial read, 10 mm nodule.',
      'Addendum',
      'Impression: Revised, 12 mm nodule.',
    ].join('\n')
    const section = findConclusionSection(narrative)!
    expect(narrative.slice(section.contentStart, section.end).trim()).toBe('Revised, 12 mm nodule.')
    expect(findConclusionSection('Clinical diagnosis: R/O lung cancer\nDiagnosis of exclusion was discussed.')).toBeNull()
  })

  it('recognises bare carriage-return line breaks and Chinese headers', () => {
    const narrative = '檢查部位：右乳\r超音波所見：低回音結節\r診斷：疑似纖維腺瘤，建議六個月追蹤'
    const section = findConclusionSection(narrative)!
    expect(narrative.slice(section.contentStart, section.end)).toBe('疑似纖維腺瘤，建議六個月追蹤')
  })

  it('strips administrative lines from the prompt text only', () => {
    const narrative = [
      '姓名：測試病人 性別：男',
      '申請序號：A0001',
      '開醫囑者：測試醫師',
      'Findings: Mild cardiomegaly.',
      '報告人：測試放射科醫師',
      '簽收時間：2026-06-24 10:00',
      '病理號：S26-00001',
      '醫檢師：測試醫檢師',
    ].join('\n')
    const { digest } = digestFor([report('x-1', '2026-06-24', 'Chest X-ray', narrative)])
    const [item] = digest.items
    expect(item.narrative).toBe(narrative)
    for (const label of ['姓名', '申請序號', '開醫囑者', '報告人', '簽收時間', '病理號', '醫檢師']) {
      expect(item.promptText).not.toContain(label)
    }
    expect(item.promptText).toContain('Findings: Mild cardiomegaly.')
  })

  it('truncates on a sentence boundary with an omission marker, conclusion first', () => {
    const findings = Array.from({ length: 40 }, (_, index) => `Finding sentence number ${index} is unremarkable.`).join(' ')
    const narrative = `${findings}\nImpression: Stable 6 mm nodule, no new lesion.`
    const body = buildReportPromptBody(narrative, 400)
    expect(body.text.length).toBeLessThanOrEqual(400)
    expect(body.text.startsWith('Impression: Stable 6 mm nodule, no new lesion.')).toBe(true)
    expect(body.text.endsWith('\n[…]')).toBe(true)
    // The cut lands after a full sentence, not mid-word.
    expect(body.text.replace(/\n\[…\]$/, '')).toMatch(/unremarkable\.$/)
  })
})

describe('report digest — request chunks', () => {
  it('splits by report count', () => {
    const reports = Array.from({ length: 10 }, (_, index) =>
      report(`x-${index}`, `2026-01-${String(index + 10)}`, 'Chest X-ray', `Impression: Finding ${index}.`))
    const { digest } = digestFor(reports, { chunkReports: 4 })
    expect(digest.chunks.map((chunk) => chunk.items.length)).toEqual([4, 4, 2])
    expect(digest.promptText).toBe(digest.chunks.map((chunk) => chunk.promptText).join('\n\n'))
  })

  it('splits by estimated tokens', () => {
    const long = (index: number) => `Impression: ${'Diffuse ground-glass opacities in both lungs. '.repeat(20)}Case ${index}.`
    const reports = Array.from({ length: 4 }, (_, index) =>
      report(`ct-${index}`, `2026-02-0${index + 1}`, 'CT chest', long(index)))
    const { digest } = digestFor(reports)
    const perItem = digest.items[0].estimatedTokens
    expect(perItem).toBe(estimateTokens(digest.items[0].promptText))
    const split = buildReportDigest(
      { clinicalData: { diagnosticReports: reports } as any, catalog: buildSourceCatalog({ diagnosticReports: reports } as any) },
      { chunkTokens: perItem * 2 + 1 },
    )
    expect(split.chunks.map((chunk) => chunk.items.length)).toEqual([2, 2])
    for (const chunk of split.chunks) expect(chunk.estimatedTokens).toBeLessThanOrEqual(perItem * 2 + 1)
  })
})

describe('deterministic excerpts', () => {
  it('uses the conclusion section, cut on a sentence boundary', () => {
    const narrative = `Findings: blah.\nImpression: ${'Stable small nodule. '.repeat(30)}`
    const excerpt = deterministicReportExcerpt(narrative)!
    expect(excerpt.source).toBe('conclusion')
    expect(excerpt.excerpt.length).toBeLessThanOrEqual(300)
    expect(excerpt.excerpt.endsWith('Stable small nodule.')).toBe(true)
    expect(narrative).toContain(excerpt.excerpt)
  })

  it('falls back to the opening, skipping administrative lines', () => {
    const narrative = '報告人：測試醫師\nThe heart size is normal. Lungs are clear.'
    expect(deterministicReportExcerpt(narrative)).toEqual({
      excerpt: 'The heart size is normal. Lungs are clear.',
      source: 'opening',
      truncated: false,
    })
  })

  it('stays fast on long rulers and long whitespace runs', () => {
    const narrative = [
      'Impression: Normal LV systolic function.',
      `${'-'.repeat(5_000)} continued`,
      `${' '.repeat(20_000)}trailing text`,
      '-'.repeat(3_000),
    ].join('\n')
    const started = Date.now()
    const excerpt = deterministicReportExcerpt(narrative)!
    buildReportPromptBody(narrative)
    findConclusionSection(`${' '.repeat(20_000)}x`)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(narrative.startsWith(excerpt.excerpt) || narrative.includes(excerpt.excerpt)).toBe(true)
    // A trailing ruler is layout, not part of the excerpt.
    expect(cutAtSentenceBoundary('Mild AR.\n------------', 300).text).toBe('Mild AR.')
  })

  it('marks a hard cut when no sentence boundary fits', () => {
    const cut = cutAtSentenceBoundary('x'.repeat(250), 200)
    expect(cut).toEqual({ text: 'x'.repeat(200), truncated: true })
  })
})
