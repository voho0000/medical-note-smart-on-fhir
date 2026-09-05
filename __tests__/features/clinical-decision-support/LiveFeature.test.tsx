import { fireEvent, render, screen } from '@testing-library/react'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'

// The switcher lists heart failure then CKD; heart failure is still unreleased,
// so it is visible only to a Beta-features browser — which is the only kind
// that reaches this tab at all, since the tab itself is `beta: true`.
function enableBetaFeatures(): void {
  useBetaFeaturesStore.getState().setBetaFeaturesEnabled('switch-user', true)
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
  }: {
    result: {
      title: string
      knowledgePacks?: Array<{ id: string }>
    }
  }) => (
    <div data-testid="mock-cdss-result">
      <span>{result.title}</span>
      <span>{result.knowledgePacks?.map((source) => source.id).join(',')}</span>
    </div>
  ),
}))

describe('Live personalized-guidance disease switch', () => {
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

  it('switches from heart-failure guidance to CKD guidance and keeps sources separate', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const heartFailureButton = screen.getByTestId('cdss-disease-switch-heart-failure-cdss')
    const ckdButton = screen.getByTestId('cdss-disease-switch-ckd-cdss')
    // Heart failure and CKD are the two pathways this host lists. Every other
    // pack the package ships is built and tested but not offered here — this
    // record carries governed diabetes and hyperlipidemia diagnoses, and
    // neither opens a switch.
    for (const unlisted of ['dm-ckd', 'hyperlipidemia', 'hypertension', 'cirrhosis', 'ckd-anemia']) {
      expect(screen.queryByTestId(`cdss-disease-switch-${unlisted}-cdss`)).not.toBeInTheDocument()
    }

    // Heart failure sits first in the switcher, and this record activates it,
    // so it is the pathway the tab opens on.
    expect(heartFailureButton.compareDocumentPosition(ckdButton))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(heartFailureButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '心衰竭個人化照護指引',
    )
    expect(screen.getByTestId('mock-cdss-result')).not.toHaveTextContent('kdigo-ckd-2024')

    fireEvent.click(ckdButton)

    expect(ckdButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent('慢性腎臟病個人化照護指引')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'kdigo-ckd-2024,kdigo-anemia-2026,taiwan-ckd-2025,taiwan-nhi-diabetes',
    )
  })

  it('marks every pathway this record activates', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    for (const packId of ['heart-failure-cdss', 'ckd-cdss']) {
      expect(screen.getByTestId(`cdss-disease-switch-${packId}`))
        .toHaveAttribute('data-applicable', 'true')
    }
  })

  it('marks the unreleased pathway as a pilot', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.getByTestId('cdss-disease-switch-pilot-heart-failure-cdss'))
      .toHaveTextContent('試辦')
    expect(screen.queryByTestId('cdss-disease-switch-pilot-ckd-cdss')).not.toBeInTheDocument()
  })

  it('collapses to the released pathway when Beta features are off', () => {
    useBetaFeaturesStore.setState({ enabledByUser: {} })

    render(<LiveClinicalDecisionSupportFeature />)

    expect(screen.queryByTestId('cdss-disease-switch-heart-failure-cdss'))
      .not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-disease-switch-ckd-cdss'))
      .toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Live personalized-guidance default selection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
    enableBetaFeatures()
    mockUsePatient.mockReturnValue({
      patient: { id: 'ckd-only-patient', resourceType: 'Patient', age: 74 },
      loading: false,
      error: null,
    })
    // CKD only: no governed heart-failure diagnosis, so the pathway that leads
    // the switcher is the one this record does not activate.
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

  it('dims a pathway this record does not activate', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    // CKD-only record: the heart-failure pathway stays reachable but is marked
    // as not activated, so the clinician can see that at a glance.
    expect(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))
      .toHaveAttribute('data-applicable', 'false')
    expect(screen.getByTestId('cdss-disease-switch-ckd-cdss'))
      .toHaveAttribute('data-applicable', 'true')
  })

  it('opens on a pathway the record activates instead of the first listed one', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    // Heart failure leads the switcher, but this record does not activate it,
    // so the tab opens on CKD rather than on "本次未啟動心衰竭決策路徑".
    expect(screen.getByTestId('cdss-disease-switch-ckd-cdss'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '慢性腎臟病個人化照護指引',
    )
  })

  it('shows the pack-owned explanation when a chosen pathway is not activated', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    fireEvent.click(screen.getByTestId('cdss-disease-switch-heart-failure-cdss'))

    const state = screen.getByTestId('clinical-decision-support-state')
    expect(state).toHaveTextContent('本次未啟動心衰竭決策路徑')
    expect(state).toHaveTextContent('LVEF 或 BNP 單獨不會用來啟動或排除診斷')
  })
})
