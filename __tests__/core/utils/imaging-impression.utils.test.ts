import {
  deriveImagingModality,
  deriveImagingRegion,
  extractImagingImpression,
  imagingGroupKey,
  imagingImpressionSummary,
  impressionOrFullText,
} from '@/src/core/utils/imaging-impression.utils'

const RADIOLOGY_REPORT = [
  'SYNTHETIC TEST REPORT; no real patient. Accession SYN-CXR-1.',
  'INDICATION: inpatient chest follow-up.',
  'TECHNIQUE: portable AP chest radiograph.',
  'COMPARISON: preceding chest radiograph in this admission.',
  'FINDINGS: Small left pleural effusion with adjacent basal opacity. No visible pneumothorax.',
  'IMPRESSION: Small left pleural effusion. Stable line position.',
].join('\n')

const PATHOLOGY_REPORT = [
  'SPECIMEN: pleural tissue biopsy.',
  'MICROSCOPIC DESCRIPTION: infiltrating malignant epithelial cells.',
  'DIAGNOSIS: metastatic carcinoma, compatible with the documented breast primary. Correlation advised.',
  'MATERIAL AND REVIEW: representative slides retained under the accession.',
].join('\n')

const CHINESE_REPORT = [
  '檢查說明: 胸部電腦斷層。',
  '影像所見: 兩側肺野可見小結節。',
  '診斷: 右下肺葉結節,建議追蹤。無新增病灶。',
].join('\n')

describe('extractImagingImpression', () => {
  it('isolates the IMPRESSION section of a radiology report', () => {
    const impression = extractImagingImpression(RADIOLOGY_REPORT)
    expect(impression?.header).toBe('IMPRESSION')
    expect(impression?.body).toBe('Small left pleural effusion. Stable line position.')
  })

  it('drops the descriptive sections that precede it', () => {
    const text = impressionOrFullText(RADIOLOGY_REPORT)
    expect(text).toBe('IMPRESSION: Small left pleural effusion. Stable line position.')
    expect(text).not.toContain('TECHNIQUE')
    expect(text).not.toContain('FINDINGS')
    expect(text).not.toContain('No visible pneumothorax')
  })

  it('uses DIAGNOSIS for pathology and stops at the next section header', () => {
    const impression = extractImagingImpression(PATHOLOGY_REPORT)
    expect(impression?.header).toBe('DIAGNOSIS')
    expect(impression?.body).toContain('metastatic carcinoma')
    expect(impression?.body).not.toContain('MATERIAL AND REVIEW')
    expect(impression?.body).not.toContain('representative slides')
  })

  it.each([
    ['診斷', '診斷: 右下肺葉結節,建議追蹤。'],
    ['結論', '結論: 無惡性證據。'],
    ['印象', '印象: 肺炎變化。'],
    ['判讀', '判讀: 未見異常。'],
    ['影像診斷', '影像診斷: 肝臟轉移。'],
  ])('recognises the Chinese header %s', (header, line) => {
    const impression = extractImagingImpression(`影像所見: 描述文字。\n${line}`)
    expect(impression?.header).toBe(header)
  })

  it('keeps only the Chinese conclusion section', () => {
    expect(impressionOrFullText(CHINESE_REPORT)).toBe('診斷: 右下肺葉結節,建議追蹤。無新增病灶。')
  })

  it.each(['CONCLUSION', 'INTERPRETATION', 'ASSESSMENT', 'FINAL DIAGNOSIS', 'IMPRESSION AND PLAN'])(
    'recognises the English header %s',
    (header) => {
      expect(extractImagingImpression(`FINDINGS: text.\n${header}: verdict.`)?.body).toBe('verdict.')
    },
  )

  it('does NOT treat a descriptive header as a conclusion', () => {
    expect(extractImagingImpression('FINDINGS: opacity.\nCOMMENT: sampling limits sensitivity.'))
      .toBeNull()
  })

  it('falls back to the full text when no conclusion header exists', () => {
    const narrative = 'Radiography of Chest A-P View (Supine). No acute finding.'
    expect(extractImagingImpression(narrative)).toBeNull()
    expect(impressionOrFullText(narrative)).toBe(narrative)
  })

  it('ignores mixed-case pseudo-headers such as attachment labels', () => {
    expect(extractImagingImpression('Presented form 1: some decoded attachment body.')).toBeNull()
  })

  it('takes the LAST conclusion header when several appear', () => {
    const text = 'DIAGNOSIS: provisional.\nMICROSCOPY: cells.\nFINAL DIAGNOSIS: definitive.'
    expect(extractImagingImpression(text)?.body).toBe('definitive.')
  })

  it('is empty for empty input', () => {
    expect(extractImagingImpression('')).toBeNull()
    expect(impressionOrFullText(undefined)).toBe('')
  })
})

describe('imagingImpressionSummary', () => {
  it('returns the first sentence of the impression', () => {
    expect(imagingImpressionSummary(RADIOLOGY_REPORT)).toBe('Small left pleural effusion.')
  })

  it('returns the first sentence of a Chinese conclusion', () => {
    expect(imagingImpressionSummary(CHINESE_REPORT)).toBe('診斷: 右下肺葉結節,建議追蹤。'.replace('診斷: ', ''))
  })

  it('falls back to the first characters of the narrative when no header exists', () => {
    const narrative = `${'a'.repeat(200)} tail`
    expect(imagingImpressionSummary(narrative, 120)).toBe(`${'a'.repeat(120)}…`)
  })

  it('does not truncate a short header-less narrative', () => {
    expect(imagingImpressionSummary('No acute finding.', 120)).toBe('No acute finding.')
  })
})

describe('modality / region derivation', () => {
  it.each([
    ['CT chest abdomen pelvis with contrast', 'CT'],
    ['胸腹骨盆電腦斷層', 'CT'],
    ['MRI spine with contrast', 'MR'],
    ['脊椎磁振造影', 'MR'],
    ['Abdominal ultrasound', 'US'],
    ['腹部超音波', 'US'],
    ['Chest radiograph AP', 'XR'],
    ['胸部Ｘ光（床邊）', 'XR'],
    ['Surgical pathology - biopsy', 'PATH'],
    ['Pleural fluid cytopathology', 'PATH'],
    ['Unlabelled study', ''],
  ])('derives the modality of %s', (title, expected) => {
    expect(deriveImagingModality(title)).toBe(expected)
  })

  it('does not mistake 電腦斷層 for a head study', () => {
    expect(deriveImagingRegion('胸腹骨盆電腦斷層')).toBe('chest+abdomen+pelvis')
  })

  it('resolves the same multi-region study identically in English and Chinese', () => {
    expect(imagingGroupKey('CT chest abdomen pelvis with contrast').key)
      .toBe(imagingGroupKey('胸腹骨盆電腦斷層').key)
  })

  it('groups CXR shorthand with spelled-out chest radiographs', () => {
    expect(imagingGroupKey('CXR portable').key).toBe(imagingGroupKey('Chest radiograph AP').key)
    expect(imagingGroupKey('胸部Ｘ光（床邊）').key).toBe(imagingGroupKey('Chest X-ray AP portable').key)
  })

  it('falls back to modality alone when no region can be derived', () => {
    const group = imagingGroupKey('Surgical pathology - biopsy')
    expect(group.modality).toBe('PATH')
    expect(group.region).toBe('')
    expect(group.label).toBe('PATH')
  })

  it('falls back to the title when neither modality nor region is derivable', () => {
    const group = imagingGroupKey('Imaging report 7')
    expect(group.key).toBe('title|imaging report 7')
    expect(imagingGroupKey('Imaging report 8').key).not.toBe(group.key)
  })

  it('keeps different regions of the same modality apart', () => {
    expect(imagingGroupKey('MRI spine').key).not.toBe(imagingGroupKey('MRI brain').key)
  })
})
