import { fireEvent, render, screen } from '@testing-library/react'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import {
  GUEST_BETA_FEATURES_KEY,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'
import { useEvidenceOverridesStore } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { useHfpefInputsStore } from '@/features/clinical-decision-support/stores/hfpef-inputs.store'
import { usePhenotypeAnswerStore } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import { usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'

jest.mock('@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook', () => ({
  useNhiLipidAiAssist: () => ({
    suggestions: {},
    decisions: {},
    isRunning: false,
    isDataReady: false,
    error: null,
    modelId: 'test',
    modelName: 'Test',
    run: jest.fn(async () => undefined),
    decide: jest.fn(),
  }),
}))

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'

// `@voho0000/personalized-care` develops one pathway per branch and the
// released package ships heart failure alone, so the switcher lists that one
// pathway. It is released (`enabled: true`), so the Beta switch no longer
// decides whether it appears — the 個人化照護指引 tab is itself `beta: true`,
// and that is the gate a reader passes to reach this component at all.
//
// Beta is still flipped on in most of these tests because that is the state a
// real reader of this tab is in. Stored under the guest key: Beta takes no
// account, so this is what a signed-out visitor who flipped the switch has.
function enableBetaFeatures(): void {
  useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, true)
}

const mockUsePatient = jest.fn()
const mockUseClinicalData = jest.fn()

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => mockUsePatient(),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

jest.mock('@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView', () => ({
  ClinicalDecisionSupportView: ({
    result,
    layout,
    nhiPageResetKey,
  }: {
    result: {
      title: string
      knowledgePacks?: Array<{ id: string }>
    }
    layout?: string
    nhiPageResetKey?: number
  }) => (
    <div data-testid="mock-cdss-result" data-layout={layout} data-nhi-reset-key={nhiPageResetKey}>
      <span>{result.title}</span>
      <span>{result.knowledgePacks?.map((source) => source.id).join(',')}</span>
    </div>
  ),
}))

describe('Live personalized-guidance pathway list', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
    enableBetaFeatures()
    mockUsePatient.mockReturnValue({
      patient: {
        id: 'switch-patient',
        resourceType: 'Patient',
        age: 72,
      },
      loading: false,
      error: null,
    })
    mockUseClinicalData.mockReturnValue({
      conditions: [],
      encounters: [{
        id: 'encounter-hf-ckd',
        status: 'finished',
        period: { start: '2026-06-25T00:00:00+08:00' },
        reasonCode: [
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'I50.22',
              display: 'Chronic systolic (congestive) heart failure',
            }],
          },
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'N18.32',
              display: 'Chronic kidney disease, stage 3b',
            }],
          },
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'E11.9',
              display: 'Type 2 diabetes mellitus',
            }],
          },
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'E78.5',
              display: 'Hyperlipidemia',
            }],
          },
        ],
      }],
      observations: [
        {
          id: 'egfr-old',
          resourceType: 'Observation',
          status: 'final',
          effectiveDateTime: '2026-01-01',
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '77147-7',
              display: 'Glomerular filtration rate',
            }],
          },
          valueQuantity: {
            value: 38,
            unit: 'mL/min/1.73m2',
            system: 'http://unitsofmeasure.org',
            code: 'mL/min/1.73m2',
          },
        },
        {
          id: 'egfr-latest',
          resourceType: 'Observation',
          status: 'final',
          effectiveDateTime: '2026-05-01',
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '77147-7',
              display: 'Glomerular filtration rate',
            }],
          },
          valueQuantity: {
            value: 34,
            unit: 'mL/min/1.73m2',
            system: 'http://unitsofmeasure.org',
            code: 'mL/min/1.73m2',
          },
        },
        {
          id: 'uacr-semiquant',
          resourceType: 'Observation',
          status: 'final',
          effectiveDateTime: '2026-05-01',
          code: {
            text: '尿液白蛋白／肌酸酐比（半定量）',
            coding: [{ system: 'http://loinc.org', code: '14959-1' }],
          },
          valueString: '1+ (80)',
        },
        {
          id: 'ldl-current',
          resourceType: 'Observation',
          status: 'final',
          effectiveDateTime: '2026-05-01',
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '2089-1',
              display: 'LDL cholesterol',
            }],
          },
          valueQuantity: {
            value: 126,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
            code: 'mg/dL',
          },
        },
      ],
      medications: [],
      allergies: [],
      carePlans: [{
        id: 'pre-esrd',
        status: 'active',
        title: '末期腎臟病前期（Pre-ESRD）照護計畫',
      }],
      procedures: [],
      immunizations: [],
      isLoading: false,
      isFetching: false,
      error: null,
      hasBlockingQueryIssues: false,
    })
  })

  it('defaults to three sections and remembers the selected layout', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'sections')
    fireEvent.click(screen.getByTestId('cdss-layout-switch-board'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'board')
    expect(screen.getByTestId('cdss-layout-switch-board')).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(window.localStorage.getItem('cdss-layout-preference') ?? '{}'))
      .toMatchObject({ state: { layout: 'board' } })
    fireEvent.click(screen.getByTestId('cdss-layout-switch-flow'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'flow')
    fireEvent.click(screen.getByTestId('cdss-layout-switch-sections'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'sections')
    expect(screen.queryByTestId('cdss-layout-switch-classic')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cdss-layout-switch-c')).not.toBeInTheDocument()
  })

  it('replaces the duplicate lipid visit flow with the dedicated NHI Table 1 view', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    fireEvent.click(screen.getByTestId('cdss-disease-switch-hyperlipidemia-cdss'))

    expect(screen.getByTestId('cdss-layout-switch-sections')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-layout-switch-nhi')).toHaveTextContent('健保表一')
    expect(screen.getByTestId('cdss-layout-switch-board')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-layout-switch-flow')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cdss-layout-switch-nhi'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'nhi')

    fireEvent.click(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'sections')
    expect(screen.getByTestId('cdss-layout-switch-flow')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-layout-switch-nhi')).not.toBeInTheDocument()
  })

  it('restores every physician-entered HF value to the page defaults in one click', () => {
    const patientId = 'switch-patient'
    useEvidenceOverridesStore.setState({ byPatientId: { [patientId]: { congestion: true } } })
    useClinicVitalsStore.setState({ byPatientId: { [patientId]: { entries: { heartRate: { value: 88, measuredOn: '2026-09-12', modifiedAt: '2026-09-12T10:00:00.000Z' } }, signAnswers: {}, nyhaClass: { value: 'II', modifiedAt: '2026-09-12T10:00:00.000Z' } } } })
    useHfpefInputsStore.setState({ byPatientId: { [patientId]: { entries: { lavi: { value: '40', measuredOn: '2026-09-12', modifiedAt: '2026-09-12T10:00:00.000Z' } } } } })
    usePhenotypeAnswerStore.setState({ byPatientId: { [patientId]: { hfSuspicion: 'suspected', answeredOn: '2026-09-12' } } })
    usePhysicianDecisionsStore.setState({ byPatientId: { [patientId]: { 'heart-failure-sglt2': { decision: 'deferred', reasons: [], recordedAt: '2026-09-12T10:00:00.000Z', packVersion: '2.0.0' } } } })

    render(<LiveClinicalDecisionSupportFeature />)
    fireEvent.click(screen.getByTestId('cdss-hf-reset-page-defaults'))

    expect(useEvidenceOverridesStore.getState().byPatientId[patientId]).toEqual({})
    expect(useClinicVitalsStore.getState().byPatientId[patientId]).toMatchObject({ entries: {}, signAnswers: {} })
    expect(useHfpefInputsStore.getState().byPatientId[patientId]).toEqual({ entries: {} })
    expect(usePhenotypeAnswerStore.getState().byPatientId[patientId]).toBeUndefined()
    expect(usePhysicianDecisionsStore.getState().byPatientId[patientId]).toEqual({})
  })

  it('restores the NHI page to record-only defaults without clearing HF work', () => {
    const patientId = 'switch-patient'
    useNhiLipidReviewStore.setState({
      patientId,
      answers: { smoking: 'yes' },
      provenance: { smoking: { source: 'ai', modelName: 'GPT Test' } },
    })
    useEvidenceOverridesStore.setState({ byPatientId: { [patientId]: { congestion: true } } })

    render(<LiveClinicalDecisionSupportFeature />)
    fireEvent.click(screen.getByTestId('cdss-disease-switch-hyperlipidemia-cdss'))
    fireEvent.click(screen.getByTestId('cdss-layout-switch-nhi'))

    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-nhi-reset-key', '0')
    fireEvent.click(screen.getByTestId('cdss-nhi-reset-page-defaults'))

    expect(useNhiLipidReviewStore.getState().answers).toEqual({})
    expect(useNhiLipidReviewStore.getState().provenance).toEqual({})
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-nhi-reset-key', '1')
    expect(useEvidenceOverridesStore.getState().byPatientId[patientId]).toEqual({ congestion: true })
  })

  it('lists heart failure and lipid while keeping other pathways unlisted', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const heartFailureButton = screen.getByTestId('cdss-disease-switch-heart-failure-cdss')
    expect(screen.getByTestId('cdss-disease-switch-hyperlipidemia-cdss')).toBeInTheDocument()
    for (const unlisted of ['ckd', 'dm-ckd', 'hypertension', 'cirrhosis', 'ckd-anemia']) {
      expect(screen.queryByTestId(`cdss-disease-switch-${unlisted}-cdss`)).not.toBeInTheDocument()
    }

    expect(heartFailureButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent('心衰竭臨床決策支援')
    // The knowledge sources travel with the pack that was built, and they are
    // the heart-failure ones only.
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'esc-hf-2026,aha-acc-hf-2022,esc-cvd-ckd-2026,esc-cardiac-rehabilitation-2026',
    )
    expect(screen.getByTestId('mock-cdss-result')).not.toHaveTextContent('kdigo-ckd-2024')
  })

  it('marks the pathway this record activates', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
      .toHaveAttribute('data-applicable', 'true')
  })

  it('marks no pathway as a pilot, because the listed one is released', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    // The 試辦 chip is drawn from `pack.enabled`, and returns with the next
    // pathway the package ships disabled.
    expect(screen.queryByTestId('cdss-disease-switch-pilot-heart-failure-cdss'))
      .not.toBeInTheDocument()
  })

  it('keeps the released pathway listed when Beta features are off', () => {
    useBetaFeaturesStore.setState({ enabledByUser: {} })

    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent('心衰竭臨床決策支援')
  })
})

describe('Live personalized-guidance on a record with no heart-failure diagnosis', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
    enableBetaFeatures()
    mockUsePatient.mockReturnValue({
      patient: { id: 'ckd-only-patient', resourceType: 'Patient', age: 74 },
      loading: false,
      error: null,
    })
    // CKD only: no governed heart-failure diagnosis. Since the packs stopped
    // gating on the diagnosis code, that record no longer closes the
    // heart-failure pathway — it only decides how far it runs.
    mockUseClinicalData.mockReturnValue({
      conditions: [],
      encounters: [{
        id: 'encounter-ckd-only',
        status: 'finished',
        period: { start: '2026-06-25T00:00:00+08:00' },
        reasonCode: [{
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'N18.32',
            display: 'Chronic kidney disease, stage 3b',
          }],
        }],
      }],
      observations: [{
        id: 'egfr-ckd-only',
        resourceType: 'Observation',
        status: 'final',
        effectiveDateTime: '2026-05-01',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '77147-7',
            display: 'Glomerular filtration rate',
          }],
        },
        valueQuantity: {
          value: 34,
          unit: 'mL/min/1.73m2',
          system: 'http://unitsofmeasure.org',
          code: 'mL/min/1.73m2',
        },
      }],
      medications: [],
      allergies: [],
      carePlans: [{
        id: 'pre-esrd',
        status: 'active',
        title: '末期腎臟病前期（Pre-ESRD）照護計畫',
      }],
      procedures: [],
      immunizations: [],
      isLoading: false,
      isFetching: false,
      error: null,
      hasBlockingQueryIssues: false,
    })
  })

  it('leaves the pathway reachable when the record carries no heart-failure code', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    // 「沒有 I50」 is not 「沒有心衰竭」: the heart-failure pathway evaluates this
    // record too, and its first module returns the reading to the clinician.
    expect(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
      .toHaveAttribute('data-applicable', 'true')
  })

  it('opens on the pathway and builds it instead of an unactivated state', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '心衰竭臨床決策支援',
    )
    expect(screen.queryByTestId('clinical-decision-support-state')).not.toBeInTheDocument()
  })
})
