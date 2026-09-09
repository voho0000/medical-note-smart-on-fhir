import { fireEvent, render, screen, within } from '@testing-library/react'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { EvidenceTablePanel } from '@/features/clinical-decision-support/renderers/EvidenceTablePanel'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import type { ClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type {
  CdssPatientProfile,
  CdssRecommendation,
  EvidenceTable,
} from '@/features/clinical-decision-support/types'

/**
 * 有／無／未評估 on a sign the record cannot settle.
 *
 * The switch beside these rows decided whether an **undetermined** row was
 * counted, so a clinician who turned on 「Orthopnea」 to say they had seen it
 * still read 「紀錄中沒有這一項 · 無法判定」 beside their own answer, and the
 * module's conclusion did not move. The answer is now the control, and it
 * travels the same route every other clinician input takes: a fact on the
 * profile, and the whole pack recomputes.
 *
 * 「無」 is a finding too. The pack keeps a negated sign apart from an unasked
 * one, which is why an answer of 「無」 argues against rather than going quiet.
 */

const BASE: CdssPatientProfile = {
  id: 'sign-answers',
  evaluatedAt: '2026-09-09T00:00:00+08:00',
  facts: {
    age: { zh: '70', en: '70', numericValue: 70 },
    heartFailureDiagnosis: { zh: 'I50.9 心衰竭', en: 'I50.9 heart failure' },
    LVEF: { zh: '58%', en: '58%', numericValue: 58, unit: '%' },
  },
}

function congestionRow(vitals: ClinicVitals, rowId: string) {
  const profile = applyClinicVitals(BASE, vitals)
  const cards: readonly CdssRecommendation[] = HEART_FAILURE_GUIDELINE_PACK
    .build({ profile, locale: 'zh-TW' }).recommendations
  const table = cards
    .flatMap((card) => card.evidenceTables ?? [])
    .find((item) => item.concept === 'congestion')
  return table?.items.find((item) => item.id === rowId)
}

describe('answering a sign in the room', () => {
  it('reaches the pack as a finding, not as a counted unknown', () => {
    const unasked = congestionRow({ measuredOn: '2026-09-09' }, 'congestion:orthopnea')
    expect(unasked?.direction).toBe('unknown')
    expect(unasked?.defaultEnabled).toBe(false)

    const present = congestionRow(
      { measuredOn: '2026-09-09', signAnswers: { orthopnea: 'present' } },
      'congestion:orthopnea',
    )
    expect(present?.direction).toBe('supports')
    // Switched on by the answer: the physician entering it is the switch.
    expect(present?.defaultEnabled).toBe(true)
    expect(present?.value).toContain('門診理學檢查')
  })

  it('keeps 「無」 apart from 「沒問」', () => {
    const absent = congestionRow(
      { measuredOn: '2026-09-09', signAnswers: { orthopnea: 'absent' } },
      'congestion:orthopnea',
    )

    expect(absent?.direction).toBe('against')
    expect(absent?.defaultEnabled).toBe(true)
  })

  it('lets a row answer win over the three-group tap for the same sign', () => {
    // The tap said 「有水腫」; the row then said 「pitting edema：無」, which is
    // the more specific statement about the same examination.
    const row = congestionRow(
      {
        measuredOn: '2026-09-09',
        congestionSigns: ['edema'],
        signAnswers: { 'pitting-edema': 'absent' },
      },
      'congestion:pitting-edema',
    )

    expect(row?.direction).toBe('against')
  })

  it('moves the module’s own count, not just the row', () => {
    const countsFor = (vitals: ClinicVitals) => {
      const profile = applyClinicVitals(BASE, vitals)
      const cards = HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' }).recommendations
      const table = cards
        .flatMap((card) => card.evidenceTables ?? [])
        .find((item) => item.concept === 'congestion') as EvidenceTable
      return { supports: table.supportsCount, against: table.againstCount }
    }

    const before = countsFor({ measuredOn: '2026-09-09' })
    const after = countsFor({
      measuredOn: '2026-09-09',
      signAnswers: { orthopnea: 'present', rales: 'absent' },
    })

    expect(after.supports).toBe(before.supports + 1)
    expect(after.against).toBe(before.against + 1)
  })
})

describe('the sign answer control', () => {
  const table: EvidenceTable = {
    concept: 'congestion',
    items: [
      {
        id: 'congestion:orthopnea',
        label: { zh: 'Orthopnea', en: 'Orthopnea' },
        category: 'examination',
        derivability: 'physician-entered',
        direction: 'unknown',
        defaultEnabled: false,
      },
      {
        // No canonical term in the published table, so no answer can land.
        id: 'congestion:bendopnea',
        label: { zh: 'Bendopnea', en: 'Bendopnea' },
        category: 'examination',
        derivability: 'physician-entered',
        direction: 'unknown',
        defaultEnabled: false,
      },
    ],
    supportsCount: 0,
    againstCount: 0,
    unknownCount: 2,
    limitations: [],
    evidenceReferences: [],
  }

  function renderPanel(onSave = jest.fn(), vitals?: ClinicVitals) {
    render(
      <EvidenceTablePanel
        table={table}
        recommendationId="heart-failure-congestion-diuretic"
        locale="zh-TW"
        patientId="p1"
        onNavigate={jest.fn()}
        clinicVitals={vitals ?? { measuredOn: '2026-09-09' }}
        onSaveClinicVitals={onSave}
      />,
    )
    return onSave
  }

  it('offers 有／無／未評估 on a row a clinician can answer', () => {
    const onSave = renderPanel()
    const control = screen.getByTestId('cdss-evidence-answer-congestion:orthopnea')

    expect(within(control).getAllByRole('button')).toHaveLength(3)
    // Nothing preselected: unanswered is not 「無」.
    expect(screen.getByTestId('cdss-evidence-answer-congestion:orthopnea-unassessed'))
      .toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('cdss-evidence-answer-congestion:orthopnea-present'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ signAnswers: { orthopnea: 'present' } }),
    )
  })

  it('clears the answer back to 未評估 rather than recording a negative', () => {
    const onSave = renderPanel(jest.fn(), {
      measuredOn: '2026-09-09',
      signAnswers: { orthopnea: 'present' },
    })

    fireEvent.click(screen.getByTestId('cdss-evidence-answer-congestion:orthopnea-unassessed'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ signAnswers: undefined }),
    )
  })

  it('leaves the plain switch on a row whose answer would have nowhere to land', () => {
    renderPanel()

    expect(screen.queryByTestId('cdss-evidence-answer-congestion:bendopnea')).toBeNull()
    expect(screen.getByTestId('cdss-evidence-switch-congestion:bendopnea')).toBeInTheDocument()
  })
})
