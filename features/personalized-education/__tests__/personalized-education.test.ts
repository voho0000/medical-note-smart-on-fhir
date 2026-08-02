import { buildPersonalizedEducation } from '../engine'
import { createPatientEducationContext } from '../patient-context'
import { getEnabledDiseasePacks } from '../disease-packs/registry'
import {
  buildEducationCareSummary,
  getEducationContentSchema,
  resolveEducationModules,
  selectEducationHandoutModules,
} from '../presentation-schema'
import type {
  EducationModuleDefinition,
  EducationModuleGroupDefinition,
} from '../presentation-schema'
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
  it('requires every enabled disease pack to register a fixed presentation schema', () => {
    for (const pack of getEnabledDiseasePacks()) {
      expect(() => getEducationContentSchema(pack.id)).not.toThrow()
    }
  })

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
    expect(copy).toContain('這項衛教依照病歷中')
    expect(copy).toContain('這筆紀錄整理')
    expect(copy).not.toContain('不把它說成你正在服用')
    expect(copy).not.toContain('不代表已確認服用')
    // Emergency guidance belongs to the module's safety slot, not the section
    // action, so it renders in a fixed red block instead of beside daily tips.
    expect(copy).not.toContain('立即撥打 119')
    expect(
      getEducationContentSchema('dm').modules
        .find((module: EducationModuleDefinition) => module.id === 'a1c')
        ?.library.safety,
    ).toContain('立即撥打 119')
    expect(plan.actionChoices.find((choice) => choice.id === 'medication')).toEqual({
      id: 'medication',
      label: '查看福適佳的用藥安全提醒',
      detail: '依病歷中的處方或用藥紀錄，先了解需要留意的警訊與特殊情境。',
    })
    expect(plan.actionChoices.find((choice) => choice.id === 'kidney')).toEqual({
      id: 'kidney',
      label: '查看腎功能的抽血與驗尿',
      detail: '先比較健康存摺已有的腎功能紀錄；若已有尿蛋白結果，再一起查看變化。',
    })
    expect(JSON.stringify(plan.actionChoices)).not.toContain('缺少的檢查列入下次追蹤')
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

  it('resolves the same fixed module architecture even when source sections are absent', () => {
    const fullPlan = buildPersonalizedEducation(
      createPatientEducationContext(buildInput()),
    ).plan!
    const sparseInput = buildInput()
    sparseInput.observations = []
    sparseInput.medications = []
    const sparsePlan = buildPersonalizedEducation(
      createPatientEducationContext(sparseInput),
    ).plan!
    const schema = getEducationContentSchema('dm')

    const moduleIds = (plan: typeof fullPlan) => resolveEducationModules(plan, schema)
      .map((educationModule) => educationModule.definition.id)

    const fullModuleIds = moduleIds(fullPlan)
    expect(moduleIds(sparsePlan)).toEqual(fullModuleIds)
    expect(fullModuleIds).toEqual(expect.arrayContaining([
      'diabetes-basics',
      'a1c',
      'meal-pattern',
      'home-glucose',
      'dapagliflozin',
      'hypoglycemia',
      'kidney',
      'diabetes-distress',
      'pregnancy',
      'hospital-transition',
    ]))

    expect(schema.groups.map((group: EducationModuleGroupDefinition) => group.id)).toEqual([
      'understanding',
      'daily-life',
      'monitoring',
      'medication',
      'urgent-care',
      'prevention',
      'wellbeing',
      'life-stages',
    ])
    for (const group of schema.groups) {
      expect(schema.modules.some((module: EducationModuleDefinition) => module.groupId === group.id)).toBe(true)
    }
  })

  it('builds the printable handout from all core modules plus record-supported modules', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(buildInput()),
    ).plan!
    const schema = getEducationContentSchema('dm')
    const resolved = resolveEducationModules(plan, schema)
    const handoutIds = selectEducationHandoutModules(resolved)
      .map((educationModule) => educationModule.definition.id)
    const olderAdultHandoutIds = selectEducationHandoutModules(resolved, { age: 94 })
      .map((educationModule) => educationModule.definition.id)

    expect(schema.modules).toHaveLength(48)
    expect(handoutIds).toHaveLength(23)
    expect(olderAdultHandoutIds).toHaveLength(24)
    expect(olderAdultHandoutIds).toContain('older-adults')
    expect(handoutIds).toEqual(expect.arrayContaining([
      'diabetes-basics',
      'personal-goals',
      'meal-pattern',
      'physical-activity',
      'screening-calendar',
      'medication-routine',
      'a1c',
      'dapagliflozin',
      'kidney',
      'heart-vessels',
      'eye-care',
      'neuropathy-foot',
      'oral-care',
    ]))
    expect(handoutIds).not.toEqual(expect.arrayContaining([
      'cgm',
      'insulin-injection',
      'pregnancy',
      'dialysis-transplant',
    ]))
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

describe('analyte recognition across real record shapes', () => {
  function withObservations(
    observations: PatientEducationContextInput['observations'],
  ): PatientEducationContextInput {
    return { ...buildInput(), observations }
  }

  function hba1cObservation(code: {
    coding?: Array<{ system?: string; code?: string; display?: string }>
    text?: string
  }) {
    return {
      id: 'hba1c',
      status: 'final',
      code,
      valueQuantity: { value: 6.6, unit: '%' },
      effectiveDateTime: '2026-06-02T00:00:00+08:00',
    }
  }

  // The pack used to require LOINC 4548-4 exactly. Every other shape below
  // occurs in real 健康存摺 extracts and silently produced no glucose card.
  it.each([
    ['LOINC 4548-4', { coding: [{ system: 'http://loinc.org', code: '4548-4' }] }],
    ['LOINC 17856-6', { coding: [{ system: 'http://loinc.org', code: '17856-6' }] }],
    ['LOINC 4549-2', { coding: [{ system: 'http://loinc.org', code: '4549-2' }] }],
    ['Chinese name only', { text: '糖化血色素' }],
    ['English display only', { coding: [{ display: 'HbA1c' }] }],
    [
      'local code plus LOINC',
      {
        coding: [
          { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-lab-code', code: '09006C' },
          { system: 'http://loinc.org', code: '4548-4' },
        ],
      },
    ],
  ])('builds the glucose section from %s', (_label, code) => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(withObservations([hba1cObservation(code)])),
    ).plan!

    expect(plan.sections.map((section) => section.id)).toContain('a1c')
    expect(plan.facts.find((fact) => fact.id === 'hba1c')?.value).toContain('6.6%')
  })

  // Bridge < v1.3.2 sent 33914-3 for every eGFR; CKD-EPI arrives as 62238-1.
  it.each([
    ['MDRD 77147-7', '77147-7'],
    ['legacy 33914-3', '33914-3'],
    ['CKD-EPI 62238-1', '62238-1'],
  ])('builds the kidney section from %s', (_label, loinc) => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(withObservations(
        [36.3, 35, 33, 32].map((value, index) => ({
          id: `egfr-${index}`,
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: loinc }] },
          valueQuantity: { value, unit: 'mL/min/1.73m2' },
          effectiveDateTime: `2026-0${index + 1}-02T00:00:00+08:00`,
        })),
      )),
    ).plan!

    expect(plan.sections.map((section) => section.id)).toContain('kidney')
    expect(plan.facts.find((fact) => fact.id === 'egfr')?.detail)
      .toContain('36.3 → 35 → 33 → 32')
  })

  it('never mixes MDRD and CKD-EPI results into one trend', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(withObservations([
        {
          id: 'egfr-mdrd',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '77147-7' }] },
          valueQuantity: { value: 48, unit: 'mL/min/1.73m2' },
          effectiveDateTime: '2026-01-02T00:00:00+08:00',
        },
        {
          id: 'egfr-epi-old',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '62238-1' }] },
          valueQuantity: { value: 35, unit: 'mL/min/1.73m2' },
          effectiveDateTime: '2026-05-02T00:00:00+08:00',
        },
        {
          id: 'egfr-epi-new',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '62238-1' }] },
          valueQuantity: { value: 32, unit: 'mL/min/1.73m2' },
          effectiveDateTime: '2026-06-02T00:00:00+08:00',
        },
      ])),
    ).plan!

    const detail = plan.facts.find((fact) => fact.id === 'egfr')?.detail
    expect(detail).toContain('35 → 32')
    expect(detail).not.toContain('48')
  })
})

describe('a record exported by NHI-FHIR-Bridge below v1.3.2', () => {
  // That bridge sent 33914-3 for every eGFR and carried the lab name in
  // code.text rather than a LOINC for many chemistry panels. Before analyte
  // resolution moved to the canonical key, such an export produced a plan with
  // no glucose and no kidney content at all.
  function legacyBridgeInput(): PatientEducationContextInput {
    const base = buildInput()
    return {
      ...base,
      observations: [
        {
          id: 'legacy-hba1c',
          status: 'final',
          code: { text: '糖化血色素' },
          valueQuantity: { value: 7.8, unit: '%' },
          effectiveDateTime: '2026-06-20T00:00:00+08:00',
        },
        ...[41, 38, 36, 34].map((value, index) => ({
          id: `legacy-egfr-${index}`,
          status: 'final',
          code: {
            coding: [{ system: 'http://loinc.org', code: '33914-3' }],
            text: 'eGFR',
          },
          valueQuantity: { value, unit: 'mL/min/1.73m2' },
          effectiveDateTime: `2026-0${index + 1}-15T00:00:00+08:00`,
        })),
      ],
    }
  }

  it('produces the same personalized sections as a current export', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(legacyBridgeInput()),
    ).plan!

    expect(plan.sections.map((section) => section.id)).toEqual([
      'a1c',
      'kidney',
      'dapagliflozin',
    ])
    expect(plan.facts.find((fact) => fact.id === 'hba1c')?.value).toContain('7.8%')
    expect(plan.facts.find((fact) => fact.id === 'egfr')?.detail)
      .toContain('41 → 38 → 36 → 34')
  })

  it('dates the summary from structured fact dates, including the eGFR trend', () => {
    const plan = buildPersonalizedEducation(
      createPatientEducationContext(legacyBridgeInput()),
    ).plan!
    const schema = getEducationContentSchema('dm')
    const summary = buildEducationCareSummary(
      plan,
      resolveEducationModules(plan, schema),
    )

    // The newest record of any kind, which here is the 2026-06-25 prescription.
    // The point of the assertion is the eGFR below: its date now participates
    // at all. While the date was scraped from prose, a trend-shaped eGFR fact
    // rendered no date and so could never be the answer, however recent it was.
    expect(summary.updatedThrough).toBe('2026/06/25')
    expect(plan.facts.find((fact) => fact.id === 'egfr')?.recordedOn)
      .toBe('2026-04-15')
  })
})
