import { buildPersonalizedEducation } from '../engine'
import { createPatientEducationContext } from '../patient-context'
import type { PatientEducationContextInput } from '../patient-context'

function buildInput(): PatientEducationContextInput {
  return {
    patient: {
      resourceType: 'Patient',
      id: 'patient-1',
      birthDate: '1932-01-15',
    },
    conditions: [],
    encounters: [
      {
        id: 'encounter-1',
        status: 'finished',
        reasonCode: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: 'E11.22',
              },
            ],
          },
        ],
      },
    ],
    observations: [
      {
        id: 'hba1c',
        status: 'final',
        code: {
          coding: [{ system: 'http://loinc.org', code: '4548-4' }],
        },
        valueQuantity: { value: 6.6, unit: '%' },
        effectiveDateTime: '2026-06-02T00:00:00+08:00',
      },
      ...[36.3, 35, 33, 32].map((value, index) => ({
        id: `egfr-${index}`,
        status: 'final',
        code: {
          coding: [{ system: 'http://loinc.org', code: '77147-7' }],
        },
        valueQuantity: { value, unit: 'mL/min/1.73m2' },
        effectiveDateTime: `2026-0${index + 1}-02T00:00:00+08:00`,
      })),
    ],
    medications: [
      {
        id: 'forxiga',
        status: 'active',
        authoredOn: '2026-06-25T00:00:00+08:00',
        medicationCodeableConcept: {
          coding: [
            {
              system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
              code: 'BC26476100',
            },
          ],
        },
      },
    ],
  }
}

describe('personalized education engine', () => {
  it('requires a governed diagnosis instead of inferring from lab or medicine', () => {
    const input = buildInput()
    input.encounters = []

    expect(
      buildPersonalizedEducation(createPatientEducationContext(input)).plan,
    ).toBeNull()
  })

  it('builds the coherent DM story from loaded patient facts', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(buildInput()),
    ).plan!

    expect(plan.sections.map((section) => section.id)).toEqual([
      'a1c',
      'kidney',
      'dapagliflozin',
    ])
    expect(plan.facts.map((fact) => fact.id)).toEqual([
      'diagnosis',
      'hba1c',
      'egfr',
      'dapagliflozin',
    ])

    const copy = JSON.stringify({ facts: plan.facts, sections: plan.sections })
    expect(copy.match(/6\.6/g)).toHaveLength(1)
    expect(copy).toContain('低於常見的 7% 參考值')
    expect(copy).toContain('血糖長期偏高會傷害腎臟的小血管')
    expect(copy).toContain('不把它說成你正在服用')
    expect(copy).toContain('立即撥打 119')
  })

  it('ignores refuted diagnoses and incompatible eGFR trend units', () => {
    const input = buildInput()
    input.encounters = []
    input.conditions = [
      {
        id: 'refuted',
        verificationStatus: 'refuted',
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'E11.9',
            },
          ],
        },
      },
    ]
    expect(
      buildPersonalizedEducation(createPatientEducationContext(input)).plan,
    ).toBeNull()

    const mixed = buildInput()
    mixed.observations.find((item) => item.id === 'egfr-0')!.valueQuantity = {
      value: 36.3,
      unit: 'mL/min',
    }
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(mixed),
    ).plan!
    const detail = plan.facts.find((fact) => fact.id === 'egfr')?.detail
    expect(detail).toContain('35 → 33 → 32 mL/min/1.73m2')
    expect(detail).not.toContain('36.3')
  })

  it('removes medication-specific content when no governed medicine exists', () => {
    const input = buildInput()
    input.medications = []
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(input),
    ).plan!

    expect(plan.title).toBe('你的糖尿病照護，先看這 2 件事')
    expect(plan.actionChoices.map((choice) => choice.id)).not.toContain(
      'medication',
    )
    expect(JSON.stringify(plan)).not.toContain('核對福適佳')
  })

  it('maps focused lessons to directly supporting sources', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(buildInput()),
    ).plan!
    const lessons = new Map(
      plan.lessonGroups
        .flatMap((group) => group.lessons)
        .map((lesson) => [lesson.id, lesson.sourceIds]),
    )

    expect(lessons.get('meal')).toEqual([
      'niddkHealthyLiving',
      'niddkKidney',
    ])
    expect(lessons.get('feet')).toEqual(['niddkFeet'])
    expect(lessons.get('eyes')).toEqual(['niddkEyes'])
  })
})
