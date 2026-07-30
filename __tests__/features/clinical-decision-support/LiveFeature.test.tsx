import { fireEvent, render, screen } from '@testing-library/react'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'

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
        id: 'encounter-dm-ckd',
        status: 'finished',
        period: { start: '2026-06-25T00:00:00+08:00' },
        reasonCode: [
          {
            coding: [{
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'E11.9',
              display: 'Type 2 diabetes mellitus',
            }],
          },
          {
            coding: [{
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'N18.32',
              display: 'Chronic kidney disease, stage 3b',
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

  it('switches from diabetes guidance to CKD guidance and keeps sources separate', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const diabetesButton = screen.getByTestId('cdss-disease-switch-dm-ckd-cdss')
    const ckdButton = screen.getByTestId('cdss-disease-switch-ckd-cdss')

    expect(diabetesButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent('糖尿病個人化照護指引')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'ada-2026,taiwan-t2dm-2022,taiwan-nhi-diabetes',
    )

    fireEvent.click(ckdButton)

    expect(ckdButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '慢性腎臟病個人化照護指引',
    )
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'kdigo-ckd-2024,taiwan-ckd-2025,taiwan-nhi-diabetes',
    )
    expect(screen.getByTestId('mock-cdss-result')).not.toHaveTextContent('ada-2026')
  })
})
