import { fireEvent, render, screen, within } from '@testing-library/react'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { EvidenceTablePanel } from '@/features/clinical-decision-support/renderers/EvidenceTablePanel'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import {
  buildClinicVitals,
  EMPTY_CLINIC_VITALS,
  type ClinicVitals,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
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

const VISIT = new Date('2026-09-09T10:00:00+08:00')

/** One statement about this visit, as the store would have recorded it. */
function vitals(patch: Parameters<typeof buildClinicVitals>[0]): ClinicVitals {
  return buildClinicVitals(patch, VISIT)
}

function congestionRow(recorded: ClinicVitals, rowId: string) {
  const profile = applyClinicVitals(BASE, recorded)
  const cards: readonly CdssRecommendation[] = HEART_FAILURE_GUIDELINE_PACK
    .build({ profile, locale: 'zh-TW' }).recommendations
  const table = cards
    .flatMap((card) => card.evidenceTables ?? [])
    .find((item) => item.concept === 'congestion')
  return table?.items.find((item) => item.id === rowId)
}

describe('answering a sign in the room', () => {
  it('reaches the pack as a finding, not as a counted unknown', () => {
    const unasked = congestionRow(EMPTY_CLINIC_VITALS, 'congestion:orthopnea')
    expect(unasked?.direction).toBe('unknown')
    expect(unasked?.defaultEnabled).toBe(false)

    const present = congestionRow(
      vitals({ signAnswers: { orthopnea: 'present' } }),
      'congestion:orthopnea',
    )
    expect(present?.direction).toBe('supports')
    // Switched on by the answer: the physician entering it is the switch.
    expect(present?.defaultEnabled).toBe(true)
    expect(present?.value).toContain('門診理學檢查')
  })

  it('keeps 「無」 apart from 「沒問」', () => {
    const absent = congestionRow(
      vitals({ signAnswers: { orthopnea: 'absent' } }),
      'congestion:orthopnea',
    )

    expect(absent?.direction).toBe('against')
    expect(absent?.defaultEnabled).toBe(true)
  })

  it('lets the row and the group chip state the same examination once', () => {
    // The chip and the row write the same record, so the last answer given for
    // a sign is the one that stands — there is no second field to disagree.
    const row = congestionRow(
      vitals({ signAnswers: { 'pitting-edema': 'absent' } }),
      'congestion:pitting-edema',
    )

    expect(row?.direction).toBe('against')
  })

  it('moves the module’s own count, not just the row', () => {
    const countsFor = (recorded: ClinicVitals) => {
      const profile = applyClinicVitals(BASE, recorded)
      const cards = HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' }).recommendations
      const table = cards
        .flatMap((card) => card.evidenceTables ?? [])
        .find((item) => item.concept === 'congestion') as EvidenceTable
      return { supports: table.supportsCount, against: table.againstCount }
    }

    const before = countsFor(EMPTY_CLINIC_VITALS)
    const after = countsFor(vitals({
      signAnswers: { orthopnea: 'present', rales: 'absent' },
    }))

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
        id: 'congestion:nyha',
        label: { zh: 'NYHA class', en: 'NYHA class' },
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

  function renderPanel(onSave = jest.fn(), recorded?: ClinicVitals) {
    render(
      <EvidenceTablePanel
        table={table}
        recommendationId="heart-failure-congestion-diuretic"
        locale="zh-TW"
        patientId="p1"
        onNavigate={jest.fn()}
        clinicVitals={recorded ?? EMPTY_CLINIC_VITALS}
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
    expect(onSave).toHaveBeenCalledWith({ signAnswers: { orthopnea: 'present' } })
  })

  it('clears the answer back to 未評估 rather than recording a negative', () => {
    const onSave = renderPanel(jest.fn(), vitals({ signAnswers: { orthopnea: 'present' } }))

    fireEvent.click(screen.getByTestId('cdss-evidence-answer-congestion:orthopnea-unassessed'))
    // `null` returns the sign to 「沒問」, which is not the same as 「無」.
    expect(onSave).toHaveBeenCalledWith({ signAnswers: { orthopnea: null } })
  })

  it('grades NYHA on its own row, because 有／無 is the wrong question for a class', () => {
    const onSave = renderPanel()

    // Not a 有／無 control, and not a switch that cannot be answered.
    expect(screen.queryByTestId('cdss-evidence-answer-congestion:nyha')).toBeNull()
    expect(screen.queryByTestId('cdss-evidence-switch-congestion:nyha')).toBeNull()
    const control = screen.getByTestId('cdss-evidence-nyha-congestion:nyha')
    expect(within(control).getAllByRole('button')).toHaveLength(4)

    fireEvent.click(screen.getByTestId('cdss-evidence-nyha-congestion:nyha-III'))
    expect(onSave).toHaveBeenCalledWith({ nyhaClass: 'III' })
  })

  it('clears the NYHA grade when the selected class is tapped again', () => {
    const onSave = renderPanel(jest.fn(), vitals({ nyhaClass: 'II' }))

    expect(screen.getByTestId('cdss-evidence-nyha-congestion:nyha-II'))
      .toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cdss-evidence-nyha-congestion:nyha-II'))
    expect(onSave).toHaveBeenCalledWith({ nyhaClass: null })
  })
})
