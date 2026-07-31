import { fireEvent, render, screen } from '@testing-library/react'
import PersonalizedEducationFeature from '../Feature'
import { buildPersonalizedEducation } from '../engine'
import type { PatientEducationContext } from '../types'

const context: PatientEducationContext = {
  patientKey: 'patient-1',
  age: 94,
  diagnosisCodings: [
    {
      system: 'http://hl7.org/fhir/sid/icd-10-cm',
      code: 'E11.22',
    },
  ],
  observations: [
    {
      id: 'hba1c',
      codings: [{ system: 'http://loinc.org', code: '4548-4' }],
      value: 6.6,
      unit: '%',
      date: '2026-06-02',
      status: 'final',
    },
    ...[36.3, 35, 33, 32].map((value, index) => ({
      id: `egfr-${index}`,
      codings: [{ system: 'http://loinc.org', code: '77147-7' }],
      value,
      unit: 'mL/min/1.73m2',
      date: `2026-0${index + 1}-02`,
      status: 'final',
    })),
  ],
  medications: [
    {
      id: 'forxiga',
      codings: [
        {
          system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
          code: 'BC26476100',
        },
      ],
      status: 'active',
      authoredOn: '2026-06-25',
      source: '處方紀錄',
    },
  ],
}

describe('PersonalizedEducationFeature', () => {
  it('shows the useful patient story immediately without model setup', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: '你的糖尿病照護，先看這 3 件事',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/選擇模型|Gemini|產生內容/)).not.toBeInTheDocument()
  })

  it('lets the patient choose one concrete action', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const action = screen.getByRole('button', {
      name: /整理腎功能的抽血與驗尿/,
    })
    fireEvent.click(action)

    expect(action).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('你選的是：')).toBeInTheDocument()
  })

  it('shows the same citizen-readable content as a medical preview', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="medical"
      />,
    )

    expect(screen.getByText('民眾閱讀版預覽')).toBeInTheDocument()
    expect(screen.queryByText(/CDSS|照護指引/)).not.toBeInTheDocument()
  })
})
