import {
  DOCUMENT_CONTEXT_OMISSION_MARKER,
  DOCUMENT_KEY_SECTIONS_NOTICE,
  extractDocumentKeySections,
  formatDocumentsSection,
  type ClinicalDocumentRef,
} from '@/src/core/utils/clinical-documents.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

const paragraph = (lead: string, times = 6): string =>
  Array.from({ length: times }, (_, i) => `${lead} recorded detail number ${i + 1} for this admission.`).join('\n')

const ENGLISH_SUMMARY = [
  'Demo Regional Medical Center',
  'Discharge Summary',
  'Patient Name: SYNTHETIC TEST',
  'Medical Record No: 00000001',
  'Admission Date: 2025-03-01',
  'Discharge Date: 2025-03-08',
  'Chief Complaint:',
  'Fever with productive cough for three days.',
  'History of Present Illness:',
  paragraph('The patient reported'),
  'Physical Examination:',
  paragraph('General appearance and chest auscultation'),
  'Review of Systems:',
  paragraph('Denies chest pain, syncope and haematuria;'),
  'Laboratory Data:',
  paragraph('WBC 15.2 CRP 88.4 creatinine 1.10 sodium 138'),
  'Discharge Diagnosis:',
  '1. Community-acquired pneumonia, right lower lobe',
  '2. Type 2 diabetes mellitus',
  'Operation:',
  'Bronchoscopy with bronchoalveolar lavage on 2025-03-03.',
  'Pathology:',
  'Bronchoalveolar lavage cytology negative for malignant cells.',
  'Hospital Course:',
  paragraph('Intravenous antibiotics were given and'),
  'Discharge Medications:',
  'Amoxicillin/clavulanate 875mg BID for seven days.',
  'Discharge Plan:',
  'Return to the chest medicine clinic on 2025-03-15.',
].join('\n')

const CHINESE_SUMMARY = [
  '示範長青醫院',
  '出院病摘',
  '病患姓名：陳○明\t病歷號碼：M00000001\t性別：男',
  '住院日期：2025-05-18\t出院日期：2025-05-22\t出院科別：胃腸肝膽科',
  '住院臆斷',
  '[underlying disease] Hypothyroidism, hyperlipidemia, chronic kidney disease.',
  '出院診斷\t1.Hemoptysis, favor pulmonary origin',
  '2.Reflux esophagitis, L.A. grade A; erythematous gastritis',
  '主訴',
  'vomiting with some blood today',
  '病史',
  paragraph('This 92-year-old male was'),
  '理學檢查發現',
  paragraph('General appearance well-developed, HEENT and chest'),
  '檢驗',
  paragraph('WBC 2.9 RBC 4.01 HGB 11.7 HCT 37.3 MCV 93.0 PLT 151'),
  '醫療影像檢查',
  paragraph('Radiography of Chest P-A View shows'),
  '手術日期及方法',
  'Nil',
  '住院治療經過',
  paragraph('Panendoscopy showed no active bleeder and'),
  '出院指示',
  '門診治療',
  '出院用藥',
  'Lansoprazole 30mg QD 7 days; Tranexamic acid 250mg TID 5 days.',
].join('\n')

describe('extractDocumentKeySections', () => {
  it('keeps the clinically dense English sections in canonical order and drops the rest', () => {
    const result = extractDocumentKeySections(ENGLISH_SUMMARY)

    expect(result.extracted).toBe(true)
    const kept = result.text
    expect(kept).toContain('Discharge Diagnosis:')
    expect(kept).toContain('Community-acquired pneumonia')
    expect(kept).toContain('Chief Complaint:')
    expect(kept).toContain('Hospital Course:')
    expect(kept).toContain('Operation:')
    expect(kept).toContain('Pathology:')
    expect(kept).toContain('Discharge Medications:')
    expect(kept).toContain('Discharge Plan:')
    // Canonical order: diagnosis → complaint → course → operation → pathology
    // → medication → plan, regardless of where they appeared in the source.
    const order = [
      'Discharge Diagnosis:',
      'Chief Complaint:',
      'Hospital Course:',
      'Operation:',
      'Pathology:',
      'Discharge Medications:',
      'Discharge Plan:',
    ].map((header) => kept.indexOf(header))
    expect(order).toEqual([...order].sort((a, b) => a - b))

    // Physical exam, ROS, labs, HPI and the administrative header are gone.
    expect(kept).not.toContain('Physical Examination:')
    expect(kept).not.toContain('Review of Systems:')
    expect(kept).not.toContain('Laboratory Data:')
    expect(kept).not.toContain('History of Present Illness:')
    expect(kept).not.toContain('Medical Record No')
    expect(kept).not.toContain('SYNTHETIC TEST')
  })

  it('names what it elided in a single marker line', () => {
    const result = extractDocumentKeySections(ENGLISH_SUMMARY)

    const markers = result.text.split('\n').filter((line) => line.startsWith('[sections omitted:'))
    expect(markers).toHaveLength(1)
    expect(markers[0]).toContain('physical exam')
    expect(markers[0]).toContain('labs')
    expect(result.omittedSections).toEqual(expect.arrayContaining([
      'document header', 'administrative fields', 'history',
      'physical exam', 'review of systems', 'labs',
    ]))
    // A marker must never smuggle back the content — or the identifiers —
    // that it stands in for.
    expect(markers[0]).not.toContain('SYNTHETIC TEST')
    expect(markers[0]).not.toContain('00000001')
  })

  it('is materially cheaper than the full document', () => {
    const result = extractDocumentKeySections(ENGLISH_SUMMARY)

    expect(estimateTokens(result.text)).toBeLessThan(estimateTokens(ENGLISH_SUMMARY))
  })

  it('recognises the Chinese NHI 出院病摘 layout, including its tabbed table rows', () => {
    const result = extractDocumentKeySections(CHINESE_SUMMARY)

    expect(result.extracted).toBe(true)
    expect(result.text).toContain('出院診斷\t1.Hemoptysis, favor pulmonary origin')
    // A section is kept or dropped WHOLE — the second diagnosis line, which
    // carries no header of its own, travels with its section.
    expect(result.text).toContain('2.Reflux esophagitis')
    expect(result.text).toContain('住院臆斷')
    expect(result.text).toContain('主訴')
    expect(result.text).toContain('住院治療經過')
    expect(result.text).toContain('出院用藥')
    expect(result.text).toContain('出院指示')
    expect(result.text).not.toContain('理學檢查發現')
    expect(result.text).not.toContain('檢驗')
    expect(result.text).not.toContain('醫療影像檢查')
    expect(result.text).not.toContain('病歷號碼')
    expect(result.text).not.toContain('陳○明')
    expect(estimateTokens(result.text)).toBeLessThan(estimateTokens(CHINESE_SUMMARY))
  })

  it('handles a summary that mixes Chinese and English headers', () => {
    const mixed = [
      '出院診斷',
      'Metastatic breast carcinoma with bone metastasis.',
      'Chief Complaint:',
      'Progressive back pain.',
      '理學檢查發現',
      paragraph('Tenderness over the thoracic spine and'),
      'Laboratory Data:',
      paragraph('Calcium 10.9 ALP 210 haemoglobin 9.8'),
      'Hospital Course:',
      paragraph('Zoledronic acid was given and'),
      '出院用藥',
      'Letrozole 2.5mg QD.',
    ].join('\n')

    const result = extractDocumentKeySections(mixed)

    expect(result.extracted).toBe(true)
    expect(result.text).toContain('出院診斷')
    expect(result.text).toContain('Chief Complaint:')
    expect(result.text).toContain('Hospital Course:')
    expect(result.text).toContain('出院用藥')
    expect(result.text).not.toContain('理學檢查發現')
    expect(result.text).not.toContain('Laboratory Data:')
  })

  it('returns an unrecognised free-text note completely unchanged', () => {
    const prose = [
      'The patient was seen in the oncology clinic on a routine review.',
      paragraph('Interval symptoms were discussed and'),
      paragraph('Treatment tolerance was reviewed and'),
      paragraph('Imaging correlation was deferred because'),
    ].join('\n')

    const result = extractDocumentKeySections(prose)

    expect(result.extracted).toBe(false)
    expect(result.text).toBe(prose)
    expect(result.omittedSections).toEqual([])
  })

  it('returns the full text when fewer than two headers are recognised', () => {
    const oneHeader = [
      'Hospital Course:',
      paragraph('The patient improved and'),
      paragraph('Nothing else in this note carries a recognised header;'),
    ].join('\n')

    const result = extractDocumentKeySections(oneHeader)

    expect(result.extracted).toBe(false)
    expect(result.text).toBe(oneHeader)
  })

  it('returns the full text when recognised sections cover less than 30% of the note', () => {
    const mostlyUnknown = [
      // Nine tenths of the note is in a layout this extractor cannot read.
      paragraph('Free-form narrative that carries no recognised header at all,', 90),
      'Discharge Diagnosis:',
      'Pneumonia.',
      'Physical Examination:',
      'Unremarkable.',
    ].join('\n')

    const result = extractDocumentKeySections(mostlyUnknown)

    expect(result.extracted).toBe(false)
    expect(result.text).toBe(mostlyUnknown)
  })

  it('does not promote a report sub-heading out of the section being dropped', () => {
    // 'Impression' / 'Recommendation' head the conclusion of a radiology or
    // endoscopy report. Inside a dropped report they must stay dropped, or the
    // entire imaging dump is smuggled back under a one-word heading.
    const withReportSubheadings = [
      '出院診斷',
      'Bilateral pneumonia.',
      '主訴',
      'Fever for three days.',
      '醫療影像檢查',
      'Radiography of Chest P-A View shows:',
      paragraph('Patchy consolidation over bilateral lower lung fields and'),
      'Impression:',
      'Bilateral pneumonia, please correlate clinically.',
      'Recommendation: correlate with clinical findings',
      paragraph('Further reformatted views were obtained and'),
      '住院治療經過',
      'Intravenous antibiotics were given; the patient improved and was discharged.',
    ].join('\n')

    const result = extractDocumentKeySections(withReportSubheadings)

    expect(result.extracted).toBe(true)
    expect(result.text).toContain('住院治療經過')
    expect(result.text).not.toContain('Impression:')
    expect(result.text).not.toContain('Recommendation:')
    expect(result.text).not.toContain('Patchy consolidation')
    expect(result.text).not.toContain('reformatted views')
  })

  it('attaches text under an unrecognised header to the section it follows', () => {
    const withUnknownHeader = [
      'Discharge Diagnosis:',
      'Pneumonia.',
      'Hospital Course:',
      paragraph('Antibiotics were given and'),
      // Not in the vocabulary: it belongs to the kept Hospital Course above
      // rather than becoming a section that could be dropped on its own.
      'Multidisciplinary Team Conference:',
      'Palliative care was involved on day four.',
      'Laboratory Data:',
      paragraph('WBC 15.2 CRP 88.4 creatinine 1.10'),
    ].join('\n')

    const result = extractDocumentKeySections(withUnknownHeader)

    expect(result.extracted).toBe(true)
    expect(result.text).toContain('Multidisciplinary Team Conference:')
    expect(result.text).toContain('Palliative care was involved on day four.')
    expect(result.text).not.toContain('WBC 15.2')
  })

  it('returns the full text when no high-value section survives', () => {
    const noAnchor = [
      'Physical Examination:',
      paragraph('General appearance and chest auscultation'),
      'Laboratory Data:',
      paragraph('WBC 15.2 CRP 88.4 creatinine 1.10'),
      'Chief Complaint:',
      'Cough.',
    ].join('\n')

    const result = extractDocumentKeySections(noAnchor)

    expect(result.extracted).toBe(false)
    expect(result.text).toBe(noAnchor)
  })

  it('leaves a note with nothing to drop untouched rather than reordering it', () => {
    const allKept = [
      'Discharge Diagnosis:',
      'Pneumonia.',
      'Hospital Course:',
      paragraph('Antibiotics were given and'),
      'Discharge Plan:',
      'Clinic review in one week.',
    ].join('\n')

    const result = extractDocumentKeySections(allKept)

    expect(result.extracted).toBe(false)
    expect(result.text).toBe(allKept)
  })
})

describe('formatDocumentsSection document text mode', () => {
  const doc: ClinicalDocumentRef = {
    id: 'discharge-1',
    date: '2025-03-08',
    title: 'Discharge summary',
    isDischargeSummary: true,
    text: ENGLISH_SUMMARY,
  }

  it('reduces automatic-mode documents and marks them as key sections', () => {
    const section = formatDocumentsSection([doc], undefined, { documentTextMode: 'keySections' })

    const item = section!.items[0]
    expect(item).toContain('<BEGIN_DOCUMENT id="discharge-1">')
    // The citation anchor stays byte-identical, so document navigation resolves.
    expect(item).toContain('Document title: Discharge summary (')
    expect(item).toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
    expect(item).toContain('[sections omitted:')
    expect(item).not.toContain('Denies chest pain')
    expect(item).not.toContain('WBC 15.2')
    expect(item).toContain('<END_DOCUMENT id="discharge-1">')
  })

  it('sends a manually selected document as complete text with no marker', () => {
    const full = formatDocumentsSection([doc], undefined, { documentTextMode: 'full' })
    const defaulted = formatDocumentsSection([doc])

    for (const section of [full, defaulted]) {
      const item = section!.items[0]
      expect(item).toContain('Physical Examination:')
      expect(item).toContain('Review of Systems:')
      expect(item).toContain('History of Present Illness:')
      expect(item).not.toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
      expect(item).not.toContain('[sections omitted:')
    }
    expect(full!.items[0]).toBe(defaulted!.items[0])
  })

  it('spends fewer tokens in key-section mode than in full mode', () => {
    const keySections = formatDocumentsSection([doc], undefined, { documentTextMode: 'keySections' })
    const full = formatDocumentsSection([doc], undefined, { documentTextMode: 'full' })

    expect(estimateTokens(keySections!.items[0])).toBeLessThan(estimateTokens(full!.items[0]))
  })

  it('applies the per-document token budget to the already-reduced text', () => {
    const budgeted = formatDocumentsSection([doc], 60, { documentTextMode: 'keySections' })
    const item = budgeted!.items[0]

    // The head/tail fitter ran, and it ran on the already-extracted body.
    expect(item).toContain(DOCUMENT_CONTEXT_OMISSION_MARKER.trim())
    expect(item).toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
    expect(item).toContain('Discharge Diagnosis:')
    expect(item).not.toContain('Denies chest pain')
    expect(estimateTokens(item)).toBeLessThan(estimateTokens(ENGLISH_SUMMARY))
  })
})

// Not every Composition a bridge emits is a discharge summary. The NHI 健保存摺
// bridge also emits 成人預防保健 (adult preventive-health checkup) results as a
// Composition with LOINC 75484-6 and one structured `section` per checkup panel
// — every heading is a lab/measurement panel, and none is a diagnosis, hospital
// course or discharge plan.
//
// A measurement run on the real captures showed key-section extraction firing on
// 0 of 4 such documents, which is the CORRECT outcome, not a gap: mapping these
// panel headings into the vocabulary would classify all of them as dropped
// categories (labs / physical exam), leaving no required key section and — but
// for the conservative fallback — an empty note. These documents are also short
// enough that reducing them saves nothing. This test pins that behaviour so a
// future vocabulary widening cannot start silently gutting checkup reports.
//
// SYNTHETIC: real section titles and shape (as compositionText flattens them,
// `title:\n value`), made-up readings.
describe('extractDocumentKeySections — structured checkup report, not a discharge summary', () => {
  const PANEL_TITLES = [
    '一般檢查',
    '血壓檢查',
    '血脂肪檢查',
    '血糖檢查',
    '腎功能檢查',
    '尿酸檢查',
    '尿液檢查',
    '代謝症候群檢查',
    '肝功能檢查',
  ]

  // compositionText() renders Composition.section[] as `title:\n narrative`,
  // blank-line separated, after the document-level narrative.
  const CHECKUP_REPORT = [
    '成人預防保健結果',
    '檢查日期\t2026-01-01',
    '檢查醫事機構\tSYNTHETIC CLINIC',
    ...PANEL_TITLES.map((title, index) =>
      `${title}:\n項目 ${index + 1}\t數值 ${index + 1}\t參考區間 ${index + 1}\n備註 ${index + 1}`,
    ),
  ].join('\n\n')

  it('leaves the document untouched rather than dropping every panel', () => {
    const result = extractDocumentKeySections(CHECKUP_REPORT)
    expect(result.extracted).toBe(false)
    expect(result.text).toBe(CHECKUP_REPORT)
    expect(result.omittedSections).toEqual([])
  })

  it('keeps every panel heading readable in the context', () => {
    const { text } = extractDocumentKeySections(CHECKUP_REPORT)
    for (const title of PANEL_TITLES) {
      expect(text).toContain(title)
    }
  })

  it('still reduces a real discharge summary, so the fallback is not blanket', () => {
    expect(extractDocumentKeySections(ENGLISH_SUMMARY).extracted).toBe(true)
  })
})
