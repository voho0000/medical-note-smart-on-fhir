import { fireEvent, render, screen } from '@testing-library/react'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { PhysicianInputRequestPanel } from '@/features/clinical-decision-support/renderers/PhysicianInputRequestPanel'
import {
  diagnosticSummaryOf,
  physicianInputRequestsOf,
} from '@/features/clinical-decision-support/physician-input-contract'
import { applyPhenotypeAnswer } from '@/features/clinical-decision-support/utils/apply-phenotype-answer'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import type { CdssPatientProfile, CdssRecommendation } from '@/features/clinical-decision-support/types'

/**
 * DP-01, end to end through the host.
 *
 * Two things are worth holding here, and neither is the markup.
 *
 * The first is that the host's copy of the answer terms is the one the pack
 * matches on. They are copies on purpose — the preview overlay keeps the
 * published `types.*` and `clinical-modules/evidence-tables.*`, so a new export
 * from the pilot package never reaches the app — and copies drift. Comparing
 * the two strings would need an import the overlay cannot provide, so the
 * round trip is asserted instead: write an answer with the host's term, run the
 * real pack, and see the pathway it selects.
 *
 * The second is that nothing patches a rendered card. The control writes an
 * answer; the answer becomes a fact; the pack recomputes.
 */

const baseProfile: CdssPatientProfile = {
  id: 'dp01-wiring',
  evaluatedAt: '2026-09-09T00:00:00+08:00',
  eligibleDiseasePackIds: ['heart-failure-cdss'],
  facts: {
    age: { zh: '68', en: '68', numericValue: 68 },
  },
}

function cardsFor(answer: PhenotypeAnswer | undefined): readonly CdssRecommendation[] {
  const profile = applyPhenotypeAnswer(baseProfile, answer)
  return HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' }).recommendations
}

function phenotypeCard(answer: PhenotypeAnswer | undefined): CdssRecommendation {
  const card = cardsFor(answer).find((item) => item.id === 'heart-failure-phenotype')
  if (!card) throw new Error('the phenotype module did not build')
  return card
}

/** DP-00 answered yes, which is what opens everything below it. */
const SUSPECTED: PhenotypeAnswer = { hfSuspicion: 'suspected', answeredOn: '2026-09-09' }

function requestsFor(answer: PhenotypeAnswer | undefined) {
  return physicianInputRequestsOf(phenotypeCard(answer))
}

describe('DP-01 phenotype gate, host to pack', () => {
  it('asks only whether heart failure is suspected until someone answers', () => {
    // DP-00 first. Without it the phenotype question would be put to every
    // patient whose chart happens to hold no echocardiogram.
    expect(requestsFor(undefined).map((request) => request.kind)).toEqual(['hf-suspicion'])
    expect(cardsFor(undefined)).toHaveLength(1)
  })

  it('adds the symptom tick-list and the phenotype question on 「是」', () => {
    const requests = requestsFor(SUSPECTED)

    expect(requests.map((request) => request.kind))
      .toEqual(['hf-suspicion', 'hf-symptoms', 'lvef-phenotype'])
    const symptoms = requests.find((request) => request.kind === 'hf-symptoms')
    expect(symptoms?.selection).toBe('multiple')
    // The same three groups the congestion card offers, so a tick here is the
    // same examination rather than a second one.
    expect(symptoms?.options?.map((option) => option.id))
      .toEqual(['edema', 'orthopnea-pnd', 'jvp-rales'])
    // Three choices, worded by the pack; the host renders them and sends back
    // the id it was given.
    const lvef = requests.find((request) => request.kind === 'lvef-phenotype')
    expect(lvef?.options?.map((option) => option.id))
      .toEqual(['reduced', 'preserved', 'unknown'])
    expect(lvef?.options?.[0].label).toContain('<50%')
  })

  it('closes the pathway on 「否」 without concluding anything about the record', () => {
    const card = phenotypeCard({ hfSuspicion: 'not-suspected', answeredOn: '2026-09-09' })

    expect(card.status).toBe('no-action')
    expect(cardsFor({ hfSuspicion: 'not-suspected', answeredOn: '2026-09-09' })).toHaveLength(1)
    // The question stays, so the answer can be changed without a reload.
    expect(physicianInputRequestsOf(card).map((request) => request.kind))
      .toEqual(['hf-suspicion'])
  })

  it('opens the HFrEF pathway on the host’s 「已知 <50%」 term', () => {
    const ids = cardsFor({ choice: 'reduced', answeredOn: '2026-09-09' })
      .map((card) => card.id)

    expect(ids).toContain('heart-failure-hfref-gdmt')
    expect(ids).not.toContain('heart-failure-hfpef-diagnosis')
  })

  it('opens the HFpEF diagnosis module on the host’s 「已知 ≥50%」 term', () => {
    const ids = cardsFor({ ...SUSPECTED, choice: 'preserved' })
      .map((card) => card.id)

    expect(ids).toContain('heart-failure-hfpef-diagnosis')
    expect(ids).toContain('heart-failure-hfpef-treatment')
    expect(ids).not.toContain('heart-failure-hfref-gdmt')
  })

  it('keeps asking on the host’s 「不清楚」 term, and opens no pathway', () => {
    const cards = cardsFor({ ...SUSPECTED, choice: 'unknown' })

    expect(cards).toHaveLength(1)
    expect(cards[0].status).toBe('needs-data')
  })

  it('drops the pending note on the treatment card once the confirmation is written', () => {
    const pending = cardsFor({ ...SUSPECTED, choice: 'preserved' })
    const confirmed = cardsFor({ ...SUSPECTED, choice: 'preserved', hfpEfConfirmed: true })
    const therapy = (cards: readonly CdssRecommendation[]) =>
      cards.find((card) => card.id === 'heart-failure-hfpef-treatment')?.rationale ?? ''

    expect(therapy(pending)).toContain('HFpEF 診斷待確認')
    expect(therapy(confirmed)).not.toContain('HFpEF 診斷待確認')
  })

  it('recomputes a typed LVEF through every module that reads one', () => {
    const ids = cardsFor({
      choice: 'reduced',
      lvef: 30,
      measuredOn: '2026-02-01',
      answeredOn: '2026-09-09',
    }).map((card) => card.id)

    // 30% is below every additional-therapy ceiling, so the AMT card is built
    // from the value the physician typed rather than from the empty record.
    expect(ids).toContain('heart-failure-additional-medical-therapy')
  })
})

describe('PhysicianInputRequestPanel', () => {
  const requests = requestsFor(SUSPECTED).filter((request) => request.kind === 'lvef-phenotype')

  it('renders the pack’s choices as one radio group and reports the id chosen', () => {
    const onAnswer = jest.fn()
    render(
      <PhysicianInputRequestPanel
        requests={requests}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        onAnswer={onAnswer}
        now={new Date('2026-09-09T09:00:00+08:00')}
      />,
    )

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)

    fireEvent.click(screen.getByTestId('cdss-lvef-phenotype-option-preserved'))

    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'preserved', answeredOn: '2026-09-09' }),
    )
  })

  it('reports the suspicion answer, and routes ticked symptoms to the examination', () => {
    const onAnswer = jest.fn()
    const onToggleSymptom = jest.fn()
    render(
      <PhysicianInputRequestPanel
        requests={requestsFor(SUSPECTED)}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        answer={SUSPECTED}
        onAnswer={onAnswer}
        selectedSymptoms={['edema']}
        onToggleSymptom={onToggleSymptom}
        now={new Date('2026-09-09T09:00:00+08:00')}
      />,
    )

    // 是 / 否 is one exclusive answer; the signs are a list, so an already
    // ticked sign stays ticked while another is added.
    expect(screen.getByTestId('cdss-hf-symptom-edema')).toBeChecked()
    expect(screen.getByTestId('cdss-hf-symptom-jvp-rales')).not.toBeChecked()

    fireEvent.click(screen.getByTestId('cdss-hf-symptom-jvp-rales'))
    expect(onToggleSymptom).toHaveBeenCalledWith('jvp-rales', true)

    fireEvent.click(screen.getByTestId('cdss-hf-suspicion-option-not-suspected'))
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ hfSuspicion: 'not-suspected' }),
    )
  })

  it('hides the symptom list where the host cannot route the answer anywhere', () => {
    render(
      <PhysicianInputRequestPanel
        requests={requestsFor(SUSPECTED)}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        answer={SUSPECTED}
        onAnswer={jest.fn()}
      />,
    )

    // A tick with nowhere to go is worse than no tick-list at all.
    expect(screen.queryByTestId('cdss-hf-symptom-edema')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-suspicion-option-suspected')).toBeInTheDocument()
  })

  it('offers the value fields only for the two 「已知」 choices', () => {
    const { rerender } = render(
      <PhysicianInputRequestPanel
        requests={requests}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        answer={{ choice: 'unknown', answeredOn: '2026-09-09' }}
        onAnswer={jest.fn()}
      />,
    )
    expect(screen.queryByTestId('cdss-lvef-phenotype-value')).not.toBeInTheDocument()

    rerender(
      <PhysicianInputRequestPanel
        requests={requests}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        answer={{ choice: 'reduced', answeredOn: '2026-09-09' }}
        onAnswer={jest.fn()}
      />,
    )
    expect(screen.getByTestId('cdss-lvef-phenotype-value')).toBeInTheDocument()
  })

  it('renders the confirmation as an action, and offers to undo it', () => {
    const onAnswer = jest.fn()
    const confirmation = [{
      kind: 'hfpef-diagnosis-confirmation' as const,
      label: '確認 HFpEF 診斷',
    }]
    const { rerender } = render(
      <PhysicianInputRequestPanel
        requests={confirmation}
        recommendationId="heart-failure-hfpef-diagnosis"
        isEnglish={false}
        onAnswer={onAnswer}
        now={new Date('2026-09-09T09:00:00+08:00')}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hfpef-confirm'))
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ hfpEfConfirmed: true }),
    )

    rerender(
      <PhysicianInputRequestPanel
        requests={confirmation}
        recommendationId="heart-failure-hfpef-diagnosis"
        isEnglish={false}
        answer={{ hfpEfConfirmed: true, answeredOn: '2026-09-09' }}
        onAnswer={onAnswer}
        now={new Date('2026-09-09T09:00:00+08:00')}
      />,
    )
    expect(screen.getByTestId('cdss-hfpef-confirmed')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cdss-hfpef-unconfirm'))
    expect(onAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({ hfpEfConfirmed: false }),
    )
  })
})

describe('the diagnosis reading the host shows', () => {
  const suspectedHfpEf = { ...SUSPECTED, choice: 'preserved' as const }

  function diagnosisCard(answer: PhenotypeAnswer) {
    const card = cardsFor(answer).find((item) => item.id === 'heart-failure-hfpef-diagnosis')
    if (!card) throw new Error('the diagnosis module did not build')
    return card
  }

  it('carries the criteria and a parameter count rather than a score', () => {
    const summary = diagnosticSummaryOf(diagnosisCard(suspectedHfpEf))

    expect(summary?.criteria.map((item) => item.id))
      .toEqual(['symptoms-signs', 'lvef', 'objective-abnormality'])
    // Nothing was measured for this patient, so the criteria that need a study
    // are undetermined — never 「不符合」.
    expect(summary?.criteria.find((item) => item.id === 'lvef')?.state).toBe('met')
    expect(summary?.criteria.find((item) => item.id === 'objective-abnormality')?.state)
      .toBe('undetermined')
    expect(summary?.supportingParameterCount).toBe(0)
    // ESC's own answer to 「有多少把握」, cited to the page it is on.
    expect(summary?.basis).toContain('p.25')
    expect(summary?.confirmedByClinician).toBeUndefined()
  })

  it('leads with the clinician’s conclusion once they have confirmed', () => {
    const summary = diagnosticSummaryOf(diagnosisCard({ ...suspectedHfpEf, hfpEfConfirmed: true }))

    expect(summary?.confirmedByClinician).toBe(true)
    expect(summary?.verdict).toContain('醫師已確認')
  })

  it('carries both published scores as floors, with what could not be measured', () => {
    const scores = diagnosticSummaryOf(diagnosisCard(suspectedHfpEf))?.scores ?? []
    const byName = (name: string) => scores.find((item) => item.name === name)

    expect(scores.map((item) => item.name)).toEqual(['HFA-PEFF', 'H2FPEF'])

    // This profile holds no echocardiographic measurement and no natriuretic
    // peptide, so HFA-PEFF is 0 — and a floor, never a rule-out.
    expect(byName('HFA-PEFF')).toMatchObject({ value: 0, maximum: 6, isFloor: true })
    expect(byName('HFA-PEFF')?.unmeasured?.length).toBeGreaterThan(0)
    // Attributed to the body that published it, not to the guideline that
    // merely cites it.
    expect(byName('HFA-PEFF')?.source).toContain('Heart Failure Association')

    // H2FPEF: age 68 is its one point here, and BMI, PASP and E/e-prime are all
    // unmeasured, so it is a floor too.
    expect(byName('H2FPEF')).toMatchObject({ value: 1, maximum: 9, isFloor: true })
    expect(byName('H2FPEF')?.source).toContain('Circulation 2018')
    // The paper maps score to probability in a figure, so no percentage is
    // printed and no rule-in cut-off is invented.
    expect(byName('H2FPEF')?.bandLabel).not.toMatch(/%/)
  })

  it('reads nothing from a recommendation the published package built', () => {
    expect(diagnosticSummaryOf({ id: 'x' } as CdssRecommendation)).toBeUndefined()
  })
})

describe('physicianInputRequestsOf', () => {
  it('reads nothing from a recommendation the published package built', () => {
    expect(physicianInputRequestsOf({ id: 'x' } as CdssRecommendation)).toEqual([])
  })

  it('drops a request whose kind this host does not render', () => {
    const recommendation = {
      id: 'x',
      physicianInputRequests: [
        { kind: 'something-newer', label: 'from a later pack' },
        { kind: 'lvef-phenotype', label: '已知 LVEF？' },
      ],
    } as unknown as CdssRecommendation

    expect(physicianInputRequestsOf(recommendation).map((request) => request.kind))
      .toEqual(['lvef-phenotype'])
  })
})
