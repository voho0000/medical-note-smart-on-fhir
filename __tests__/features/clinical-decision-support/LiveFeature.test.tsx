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

  it('switches from CKD guidance to diabetes guidance and keeps sources separate', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    const diabetesButton = screen.getByTestId('cdss-disease-switch-dm-ckd-cdss')
    const ckdButton = screen.getByTestId('cdss-disease-switch-ckd-cdss')
    // Only CKD and diabetes are surfaced while they are being refined; the
    // other packs are built and tested but held back.
    for (const held of ['hyperlipidemia', 'hypertension', 'cirrhosis', 'ckd-anemia']) {
      expect(screen.queryByTestId(`cdss-disease-switch-${held}-cdss`)).not.toBeInTheDocument()
    }

    // CKD sits first in the switcher, so it is the pathway the tab opens on.
    expect(ckdButton.compareDocumentPosition(diabetesButton))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(ckdButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '慢性腎臟病個人化照護指引',
    )
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'kdigo-ckd-2024,taiwan-ckd-2025,taiwan-nhi-diabetes',
    )
    expect(screen.getByTestId('mock-cdss-result')).not.toHaveTextContent('ada-2026')

    fireEvent.click(diabetesButton)

    expect(diabetesButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent('糖尿病個人化照護指引')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      'ada-2026,taiwan-t2dm-2022,taiwan-nhi-diabetes',
    )
  })

  it('marks every pathway this record activates', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    for (const packId of ['dm-ckd-cdss', 'ckd-cdss']) {
      expect(screen.getByTestId(`cdss-disease-switch-${packId}`))
        .toHaveAttribute('data-applicable', 'true')
    }
  })
})

describe('Live personalized-guidance default selection', () => {
  beforeEach(() => {
    mockUsePatient.mockReturnValue({
      patient: { id: 'ckd-only-patient', resourceType: 'Patient', age: 74 },
      loading: false,
      error: null,
    })
    // CKD only: no governed diabetes diagnosis and no diagnostic-range HbA1c.
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

    // CKD-only record: the diabetes pathway stays reachable but is marked as
    // not activated, so the clinician can see that at a glance.
    expect(screen.getByTestId('cdss-disease-switch-dm-ckd-cdss'))
      .toHaveAttribute('data-applicable', 'false')
    expect(screen.getByTestId('cdss-disease-switch-ckd-cdss'))
      .toHaveAttribute('data-applicable', 'true')
  })

  it('opens on a pathway the record activates instead of the fixed default', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    // Previously this opened on the diabetes pack and showed "本次未啟動糖尿病
    // 決策路徑", leaving the clinician to click through every disease.
    expect(screen.getByTestId('cdss-disease-switch-ckd-cdss'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mock-cdss-result')).toHaveTextContent(
      '慢性腎臟病個人化照護指引',
    )
  })

  it('shows the pack-owned explanation when a chosen pathway is not activated', () => {
    render(<LiveClinicalDecisionSupportFeature />)

    fireEvent.click(screen.getByTestId('cdss-disease-switch-dm-ckd-cdss'))

    const state = screen.getByTestId('clinical-decision-support-state')
    expect(state).toHaveTextContent('本次未啟動糖尿病決策路徑')
    expect(state).toHaveTextContent('這不代表病人沒有糖尿病')
  })
})
