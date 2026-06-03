import { formatReportText, type ReportLine } from '@/src/shared/utils/report-text-format'

// Realistic colonoscopy blob shaped like what the NHI-FHIR bridge emits:
// section headings glued onto neighbouring text, verbose blank padding,
// numbered findings, and measurements with decimals / ranges that must survive.
const COLONOSCOPY = `Endoscopy: 內視鏡編號: CF-H260AL-2001186

The colonoscope was introduced and advanced to the cecum.
1. A 0.5 cm polyp was found at the sigmoid colon, s/p polypectomy.
2. Diverticulosis of the descending colon, involving 5%-25% of the lumen.Impression:
1. Colon polyp, s/p polypectomy.
2. Diverticulosis.
Recommendation: correlate with clinical finding, trace pathologic result`

function texts(lines: ReportLine[]): string[] {
  return lines.map((l) => l.text)
}

describe('formatReportText', () => {
  it('returns an empty array for blank input', () => {
    expect(formatReportText('')).toEqual([])
    expect(formatReportText('   \n  \n')).toEqual([])
  })

  it('keeps a structureless paragraph as a single flush line', () => {
    const lines = formatReportText('Normal colonoscopy. No abnormality detected.')
    expect(lines).toEqual([
      { text: 'Normal colonoscopy. No abnormality detected.', level: 0 },
    ])
  })

  it('splits a section heading that the bridge glued onto preceding text', () => {
    const lines = formatReportText(COLONOSCOPY)
    // "...of the lumen.Impression:" must break into a finding line + its own heading.
    const impressionIdx = lines.findIndex((l) => l.heading && l.text === 'Impression:')
    expect(impressionIdx).toBeGreaterThan(-1)
    const prev = lines[impressionIdx - 1]
    expect(prev.text).toContain('Diverticulosis of the descending colon')
    expect(prev.text).not.toContain('Impression')
  })

  it('marks known section keywords as headings at level 0', () => {
    const lines = formatReportText(COLONOSCOPY)
    const headings = lines.filter((l) => l.heading).map((l) => l.text)
    expect(headings).toEqual(['Endoscopy:', 'Impression:', 'Recommendation:'])
    for (const l of lines.filter((x) => x.heading)) expect(l.level).toBe(0)
  })

  it('promotes inline content after a heading colon to an indented item', () => {
    const lines = formatReportText(COLONOSCOPY)
    const recIdx = lines.findIndex((l) => l.heading && l.text === 'Recommendation:')
    const body = lines[recIdx + 1]
    expect(body).toEqual({
      text: 'correlate with clinical finding, trace pathologic result',
      level: 1,
    })
  })

  it('detects numbered items and strips the marker', () => {
    const lines = formatReportText(COLONOSCOPY)
    const items = lines.filter((l) => l.marker === '1.' || l.marker === '2.')
    expect(items.length).toBe(4) // two findings + two impressions
    for (const item of items) expect(item.level).toBe(1)
    expect(items[0].text).toContain('polyp was found at the sigmoid colon')
  })

  it('does NOT mistake decimals or percent ranges for list markers', () => {
    const lines = formatReportText(COLONOSCOPY)
    const all = texts(lines).join(' | ')
    // Measurements must remain intact and never become a marker.
    expect(all).toContain('0.5 cm polyp')
    expect(all).toContain('5%-25% of the lumen')
    expect(lines.some((l) => l.marker === '0.')).toBe(false)
    expect(lines.some((l) => l.marker === '5.')).toBe(false)
  })

  it('handles a line that begins with a decimal measurement as plain text', () => {
    const lines = formatReportText('0.8 cm ulcer at the antrum.')
    expect(lines).toEqual([{ text: '0.8 cm ulcer at the antrum.', level: 0 }])
  })

  it('detects sub-items "1)" / "a)" at level 2', () => {
    const lines = formatReportText('Findings:\n1) erythema\na) mild')
    expect(lines).toEqual([
      { text: 'Findings:', level: 0, heading: true },
      { text: 'erythema', level: 2, marker: '1)' },
      { text: 'mild', level: 2, marker: 'a)' },
    ])
  })

  it('detects sub-sub "A:" / "B:" markers at level 2', () => {
    const lines = formatReportText('A: biopsy taken\nB: clip applied')
    expect(lines).toEqual([
      { text: 'biopsy taken', level: 2, marker: 'A:' },
      { text: 'clip applied', level: 2, marker: 'B:' },
    ])
  })

  it('collapses verbose blank-line padding', () => {
    const lines = formatReportText('Impression:\n\n\n\nNormal study.')
    expect(lines).toEqual([
      { text: 'Impression:', level: 0, heading: true },
      { text: 'Normal study.', level: 0 },
    ])
  })

  it('does not split an ordinary lowercase word containing a keyword substring', () => {
    // case-sensitive heading match — "history" lowercase mid-sentence stays put.
    const lines = formatReportText('Patient with a history of polyps.')
    expect(lines).toEqual([{ text: 'Patient with a history of polyps.', level: 0 }])
  })

  it('breaks apart numbered findings the bridge ran together on one line', () => {
    // Real CT-brain shape: heading glued to item 1, items glued to each other
    // both with ("ICH2.") and without ("disease.3.") a space.
    const lines = formatReportText(
      'Impression:1. No apparent ICH2. Senile cortical atrophy.3. Pan-paranasal sinusitis.'
    )
    expect(lines).toEqual([
      { text: 'Impression:', level: 0, heading: true },
      { text: 'No apparent ICH', level: 1, marker: '1.' },
      { text: 'Senile cortical atrophy.', level: 1, marker: '2.' },
      { text: 'Pan-paranasal sinusitis.', level: 1, marker: '3.' },
    ])
  })

  it('keeps a glued decimal intact while splitting an adjacent numbered item', () => {
    const lines = formatReportText('Findings:1. A 0.5 cm polyp.2. Normal mucosa.')
    expect(lines).toEqual([
      { text: 'Findings:', level: 0, heading: true },
      { text: 'A 0.5 cm polyp.', level: 1, marker: '1.' },
      { text: 'Normal mucosa.', level: 1, marker: '2.' },
    ])
  })

  it('recognises Method: and Other Interpretations: sub-headings', () => {
    const lines = formatReportText(
      'Method: Axial 5 mm sections.Other Interpretations:1. Normal cerebrum.'
    )
    expect(lines).toEqual([
      { text: 'Method:', level: 0, heading: true },
      { text: 'Axial 5 mm sections.', level: 1 },
      { text: 'Other Interpretations:', level: 0, heading: true },
      { text: 'Normal cerebrum.', level: 1, marker: '1.' },
    ])
  })

  it('splits a radiology "Show:" findings list one finding per indented line', () => {
    // Real chest X-ray shape: a modality lead-in glued to the first finding
    // ("Show:Tortuosity"), then period-separated findings, no headings/numbers.
    const lines = formatReportText(
      'Radiography of Chest A-P View(Supine) Show:Tortuosity thoracic aorta. ' +
        'Borderline cardiomegaly . Peribronchial infiltration over lung field. ' +
        'Bilateral pleural change with effusion.'
    )
    expect(lines).toEqual([
      { text: 'Radiography of Chest A-P View(Supine) Show:', level: 0 },
      { text: 'Tortuosity thoracic aorta.', level: 1 },
      // stray space-before-period healed ("cardiomegaly ." → "cardiomegaly.")
      { text: 'Borderline cardiomegaly.', level: 1 },
      { text: 'Peribronchial infiltration over lung field.', level: 1 },
      { text: 'Bilateral pleural change with effusion.', level: 1 },
    ])
  })

  it('breaks apart findings the bridge glued at the period boundary', () => {
    // "field(s).Obliteration" — no space after the period, mirrors the bridge.
    const lines = formatReportText(
      'Show:Consolidation in right lower lung field(s).Obliteration of costophrenic angles. ' +
        'Left apical pleural change.'
    )
    expect(lines).toEqual([
      { text: 'Show:', level: 0 },
      { text: 'Consolidation in right lower lung field(s).', level: 1 },
      { text: 'Obliteration of costophrenic angles.', level: 1 },
      { text: 'Left apical pleural change.', level: 1 },
    ])
  })

  it('does NOT split a decimal measurement inside a findings list', () => {
    const lines = formatReportText('Sonography shows: A 1.2 cm nodule. Normal liver.')
    // "1.2" must stay intact; only the sentence boundary splits.
    expect(lines).toEqual([
      { text: 'Sonography shows:', level: 0 },
      { text: 'A 1.2 cm nodule.', level: 1 },
      { text: 'Normal liver.', level: 1 },
    ])
  })

  it('segments a findings lead-in the bridge tucked inside a "Conclusion:" heading', () => {
    // The real chest X-ray shape: the whole findings list is the inline content
    // of a "Conclusion:" heading. Heading at level 0, lead-in at level 1, each
    // finding nested at level 2.
    const lines = formatReportText(
      'Conclusion: Radiography of Chest A-P View(Supine) Show:Tortuosity thoracic aorta. ' +
        'Borderline cardiomegaly. Bilateral pleural change with effusion.'
    )
    expect(lines).toEqual([
      { text: 'Conclusion:', level: 0, heading: true },
      { text: 'Radiography of Chest A-P View(Supine) Show:', level: 1 },
      { text: 'Tortuosity thoracic aorta.', level: 2 },
      { text: 'Borderline cardiomegaly.', level: 2 },
      { text: 'Bilateral pleural change with effusion.', level: 2 },
    ])
  })

  it('leaves a multi-sentence paragraph WITHOUT a findings lead-in untouched', () => {
    // No Show:/reveals: verb — must stay a single flush line, not get segmented.
    const lines = formatReportText('Tortuosity thoracic aorta. Borderline cardiomegaly.')
    expect(lines).toEqual([
      { text: 'Tortuosity thoracic aorta. Borderline cardiomegaly.', level: 0 },
    ])
  })
})
