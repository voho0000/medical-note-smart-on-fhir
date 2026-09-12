import { fireEvent, render, screen } from '@testing-library/react'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import {
  GUEST_BETA_FEATURES_KEY,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'

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
  }: {
    result: {
      title: string
      knowledgePacks?: Array<{ id: string }>
    }
    layout?: string
  }) => (
    <div data-testid="mock-cdss-result" data-layout={layout}>
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

  it('offers both faces of the heart-failure guidance, and remembers the choice', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'flow')
    fireEvent.click(screen.getByTestId('cdss-layout-switch-board'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'board')
    expect(screen.getByTestId('cdss-layout-switch-board')).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(window.localStorage.getItem('cdss-layout-preference') ?? '{}'))
      .toMatchObject({ state: { layout: 'board' } })
    fireEvent.click(screen.getByTestId('cdss-layout-switch-flow'))
    expect(screen.getByTestId('mock-cdss-result')).toHaveAttribute('data-layout', 'flow')
    // The switcher offers the visit flow and the original board; neither the
    // retired direction C nor the module-first 「classic」 face is in the header.
    expect(screen.queryByTestId('cdss-layout-switch-classic')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cdss-layout-switch-c')).not.toBeInTheDocument()
  })

  it('lists heart failure alone and no pack the package does not ship', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const heartFailureButton = screen.getByTestId('cdss-disease-switch-heart-failure-cdss')
    // Heart failure is the only pathway this host lists. This record carries
    // governed CKD, diabetes and hyperlipidemia diagnoses as well, and none of
    // them opens a switch — a pack the package does not ship, or one the host
    // does not list, is not reachable from here.
    for (const unlisted of ['ckd', 'dm-ckd', 'hyperlipidemia', 'cirrhosis', 'ckd-anemia']) {
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
