import { render, screen, within } from '@testing-library/react'
import { CARE_PACKS, type CdssLocale, type CdssPatientProfile } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'

/**
 * The renderer post-processes clinical prose with heuristics that subtract text:
 * a character-bigram similarity test drops a "redundant" assessment, and a
 * regex strips evidence phrases out of monitoring titles. Those rules were
 * written against the wording the packs had at the time, and nothing tied them
 * to that wording — a copy change in the private care package could silently
 * blank part of a card.
 *
 * These are characterization tests: they run every bundled pack's real output
 * through the real renderer and assert that no displayed cell is left empty.
 * They do not pin exact strings, so intentional copy changes stay cheap.
 */

const profile: CdssPatientProfile = {
  id: 'display-heuristics',
  evaluatedAt: '2026-06-10T00:00:00+08:00',
  demographics: { sex: 'male' },
  eligibleDiseasePackIds: [
    'dm-poc',
    'ckd-poc',
    'hypertension-poc',
    'hyperlipidemia-poc',
    'heart-failure-poc',
    'cirrhosis-poc',
  ],
  facts: {
    age: { zh: '74 歲', en: '74 years', numericValue: 74 },
    eGFR: {
      zh: '32 mL/min/1.73m²（2026-06-02）',
      en: '32 mL/min/1.73m2 (2026-06-02)',
      numericValue: 32,
      date: '2026-06-02',
    },
    serumCreatinine: {
      zh: '1.9 mg/dL（2026-06-02）',
      en: '1.9 mg/dL (2026-06-02)',
      numericValue: 1.9,
      date: '2026-06-02',
    },
    potassium: {
      zh: '3.7 mmol/L（2026-06-02）',
      en: '3.7 mmol/L (2026-06-02)',
      numericValue: 3.7,
      date: '2026-06-02',
    },
    bicarbonate: {
      zh: '總 CO₂ 23.6 mmol/L（2026-06-02）',
      en: 'Total CO2 23.6 mmol/L (2026-06-02)',
      numericValue: 23.6,
      date: '2026-06-02',
    },
    hemoglobin: {
      zh: '11.4 g/dL（2026-06-02）',
      en: '11.4 g/dL (2026-06-02)',
      numericValue: 11.4,
      date: '2026-06-02',
    },
    HbA1c: { zh: '7.4%（2026-05-20）', en: '7.4% (2026-05-20)', numericValue: 7.4, date: '2026-05-20' },
    LDL: { zh: '126 mg/dL（2026-05-01）', en: '126 mg/dL (2026-05-01)', numericValue: 126, date: '2026-05-01' },
    bloodPressure: {
      zh: '154/88 mmHg（2026-05-01）',
      en: '154/88 mm Hg (2026-05-01)',
      date: '2026-05-01',
      sources: [{ resourceType: 'Observation', resourceId: 'bp-1', value: '154/88' }],
    },
    ckdDiagnosis: { zh: '慢性腎臟病第 3b 期', en: 'Chronic kidney disease stage 3b' },
    ascvdDiagnosis: { zh: '慢性缺血性心臟病', en: 'Chronic ischemic heart disease' },
    medicationListOverview: { zh: '目前用藥 12 筆', en: '12 current medications' },
  },
}

const locales: readonly CdssLocale[] = ['zh-TW', 'en']

/**
 * Separators are dropped on both sides: the renderer legitimately moves a
 * phrase out of the title and into the evidence column, where it appears as
 * "label：value". That is a relocation, not a loss.
 */
function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s：:；;、,，。()（）]/gu, '')
}

/**
 * Segments of a pack title that carry clinical meaning on their own. Short
 * fragments are ignored so ordinary rewording does not fail the test; what is
 * checked is that a substantive phrase never disappears from the row.
 */
function informativePhrases(title: string): string[] {
  return title
    // Split on sentence punctuation, but never inside a number such as 11.4.
    .split(/(?<!\d)[.](?!\d)|[：:；;，,。、()（）]/u)
    .map((part) => (part ?? '').trim())
    .filter((part) => part.replace(/[\s\d.]/gu, '').length >= 6)
}

describe.each(CARE_PACKS.map((pack) => [pack.id, pack] as const))(
  'renderer text heuristics on %s output',
  (_packId, pack) => {
    it.each(locales)('leaves no displayed cell empty in %s', (locale) => {
      const result = pack.build({ profile, locale })
      const { container } = render(
        <ClinicalDecisionSupportView result={result} locale={locale} />,
      )

      const cells = container.querySelectorAll('[data-testid^="cdss-module-cell-"]')
      expect(cells.length).toBeGreaterThan(0)

      cells.forEach((cell) => {
        const id = cell.getAttribute('data-testid')
        expect(`${id}:${cell.textContent?.trim()}`).not.toMatch(/:$/)
      })
    })

    it.each(locales)('never drops a clinical phrase from the row in %s', (locale) => {
      const result = pack.build({ profile, locale })
      const { container } = render(
        <ClinicalDecisionSupportView result={result} locale={locale} />,
      )

      for (const recommendation of result.recommendations) {
        const row = container
          .querySelector(`[data-testid="cdss-module-cell-${recommendation.id}"]`)
          ?.closest('[id^="cdss-trigger-"]')
        if (!row) continue

        // The subtraction rules may move a phrase from the title into the
        // evidence column, but the row as a whole must still carry it.
        const rendered = normalize(row.textContent ?? '')
        const dropped = informativePhrases(recommendation.title)
          .filter((phrase) => !rendered.includes(normalize(phrase)))

        expect({ module: recommendation.id, dropped }).toEqual({
          module: recommendation.id,
          dropped: [],
        })
      }
    })
  },
)

describe('evidence preview heuristics', () => {
  it('still shows the analytes a module declares as its overview evidence', () => {
    const ckd = CARE_PACKS.find((pack) => pack.id === 'ckd-cdss')!
    const result = ckd.build({ profile, locale: 'zh-TW' })
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" />)

    const preview = screen.queryByTestId('cdss-evidence-preview-ckd-potassium-acidosis')
    expect(preview).not.toBeNull()
    // The module declares overviewEvidenceFactKeys: ['potassium', 'bicarbonate'].
    expect(within(preview!).getByText(/3\.7/)).toBeInTheDocument()
    expect(within(preview!).getByText(/23\.6/)).toBeInTheDocument()
  })
})
