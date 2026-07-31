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
          {
            coding: [{
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'E78.5',
              display: 'Hyperlipidemia',
            }],
          },
          {
            coding: [{
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'K74.60',
              display: 'Cirrhosis of liver',
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

  it('switches from diabetes guidance to CKD guidance and keeps sources separate', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const diabetesButton = screen.getByTestId('cdss-disease-switch-dm-ckd-cdss')
    const ckdButton = screen.getByTestId('cdss-disease-switch-ckd-cdss')
    const lipidButton = screen.getByTestId('cdss-disease-switch-hyperlipidemia-cdss')
    const cirrhosisButton = screen.getByTestId('cdss-disease-switch-cirrhosis-cdss')

    expect(screen.queryByTestId('cdss-disease-switch-hypertension-cdss')).not.toBeInTheDocument()
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

    fireEvent.click(lipidButton)

    expect(lipidButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '高血脂個人化照護指引',
    )
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'aha-acc-dyslipidemia-2026,taiwan-lipid-2022',
    )

    fireEvent.click(cirrhosisButton)

    expect(cirrhosisButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '肝硬化個人化照護指引',
    )
  })
})
