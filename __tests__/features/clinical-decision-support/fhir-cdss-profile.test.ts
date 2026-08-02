import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import type {
  ConditionEntity,
  EncounterEntity,
  ImmunizationEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

const patient: PatientEntity = {
  id: 'patient-from-any-facility',
  resourceType: 'Patient',
}

const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

function observation(
  id: string,
  overrides: Partial<ObservationEntity>,
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-06-01',
    ...overrides,
  }
}

function profile(
  observations: ObservationEntity[],
  medications: MedicationEntity[] = [],
) {
  return createFhirCdssPatientProfile({
    patient,
    conditions: [],
    encounters: [],
    observations,
    medications,
    allergies: [],
    carePlans: [],
    now: new Date('2026-07-29T00:00:00Z'),
  })
}

describe('FHIR CDSS UACR normalization across patients and facilities', () => {
  it.each(['14959-1', '9318-7'])(
    'uses a quantitative UACR with standard LOINC code %s',
    (loinc) => {
      const result = profile([
        observation('standard-uacr', {
          code: {
            coding: [{
              system: LOINC_SYSTEM,
              code: loinc,
              display: 'Microalbumin/Creatinine [Mass Ratio] in Urine',
            }],
          },
          valueQuantity: {
            value: 80,
            unit: 'mg/g',
            system: UCUM_SYSTEM,
            code: 'mg/g',
          },
        }),
      ])

      expect(result.facts.urineAlbuminRatio).toMatchObject({
        numericValue: 80,
        unit: 'mg/g',
        date: '2026-06-01',
      })
      expect(result.observationContexts?.uacr.useState).toBe('quantitative_comparable')
    },
  )

  it('recognizes a registered standard test code without relying on its display name', () => {
    const result = profile([
      observation('standard-code-uacr', {
        code: {
          text: '檢驗結果',
          coding: [{
            system: 'https://hospital.example/standard-lab-codes',
            code: 'UACR',
          }],
        },
        valueQuantity: {
          value: 55,
          unit: 'mg/g',
          system: UCUM_SYSTEM,
          code: 'mg/g',
        },
      }),
    ])

    expect(result.facts.urineAlbuminRatio.numericValue).toBe(55)
    expect(result.observationContexts?.uacr.useState).toBe('quantitative_comparable')
  })

  it('keeps a semiquantitative UACR visible without inventing a quantitative value', () => {
    const result = profile([
      observation('semiquant-uacr', {
        code: {
          text: '尿液白蛋白／肌酸酐比（半定量）',
          coding: [{ system: LOINC_SYSTEM, code: '14959-1' }],
        },
        valueString: '1+ (80)',
      }),
    ])

    expect(result.facts.urineAlbuminRatio).toMatchObject({
      zh: expect.stringContaining('半定量 UACR：1+ (80)'),
      date: '2026-06-01',
    })
    expect(result.facts.urineAlbuminRatio.numericValue).toBeUndefined()
    expect(result.observationContexts?.uacr.useState).toBe('not_quantitative_comparable')
  })

  it('captures the lower bound from a 2+ semiquantitative UACR', () => {
    const result = profile([
      observation('semiquant-uacr-2-plus', {
        code: { text: 'ACR' },
        valueString: '2+ (＞=300)',
      }),
    ])

    expect(result.observationContexts?.uacr.readings?.[0]).toMatchObject({
      kind: 'semiquantitative',
      lowerBoundMgG: 300,
    })
  })

  it('captures a strict >300 mg/g semiquantitative UACR as a conservative lower bound', () => {
    const result = profile([
      observation('semiquant-uacr-above-300', {
        code: { text: 'ACR 半定量' },
        valueString: '2+ (>300 mg/g)',
      }),
    ])

    expect(result.observationContexts?.uacr.readings?.[0]).toMatchObject({
      kind: 'semiquantitative',
      displayValue: '2+ (>300 mg/g)',
      lowerBoundMgG: 300,
    })
    expect(result.facts.urineAlbuminRatio.numericValue).toBeUndefined()
  })

  it('accepts ug/mg creatinine as numerically equivalent to mg/g', () => {
    const result = profile([
      observation('equivalent-unit-uacr', {
        code: { text: 'ACR' },
        valueQuantity: {
          value: 36.44,
          unit: 'ug/mg Creatinine',
          system: UCUM_SYSTEM,
        },
      }),
    ])

    expect(result.facts.urineAlbuminRatio).toMatchObject({
      numericValue: 36.44,
      unit: 'mg/g',
    })
    expect(result.observationContexts?.uacr.useState).toBe('quantitative_comparable')
  })

  it('keeps the newest ACR current and the latest quantitative result separate', () => {
    const result = profile([
      observation('quantitative-uacr', {
        effectiveDateTime: '2024-06-10',
        code: { text: 'ACR' },
        valueQuantity: {
          value: 36.44,
          unit: 'µg/mg Creatinine',
          system: UCUM_SYSTEM,
        },
      }),
      observation('newer-semiquant-uacr', {
        effectiveDateTime: '2026-01-14',
        code: { text: 'UACR（半定量）' },
        valueString: '1+ (80)',
      }),
    ])

    expect(result.facts.urineAlbuminRatio).toMatchObject({
      zh: expect.stringContaining('半定量 UACR：1+ (80)'),
      date: '2026-01-14',
    })
    expect(result.facts.urineAlbuminRatio.numericValue).toBeUndefined()
    expect(result.facts.urineAlbuminRatio.sources?.[0].resourceId).toBe('newer-semiquant-uacr')
    expect(result.facts.urineAlbuminRatioQuantitative).toMatchObject({
      numericValue: 36.44,
      unit: 'mg/g',
      date: '2024-06-10',
    })
    expect(result.facts.urineAlbuminOverview.zh).toBe(
      '1+ (80) · 2026-01-14 ｜ 最近定量：36.44 mg/g · 2024-06-10',
    )
    expect(result.facts.urineAlbuminOverview.sources?.map((source) => source.resourceId)).toEqual([
      'newer-semiquant-uacr',
      'quantitative-uacr',
    ])
    expect(result.observationContexts?.uacr).toMatchObject({
      useState: 'not_quantitative_comparable',
      latestReading: {
        kind: 'semiquantitative',
        date: '2026-01-14',
      },
      latestQuantitativeReading: {
        kind: 'quantitative',
        date: '2024-06-10',
        numericValueMgG: 36.44,
      },
    })
  })

  it('supports an unambiguous local-code test name from another facility', () => {
    const result = profile([
      observation('local-code-uacr', {
        code: {
          text: 'Urine albumin/creatinine ratio',
          coding: [{
            system: 'https://hospital.example/lab-codes',
            code: 'LOCAL-ACR',
          }],
        },
        valueQuantity: {
          value: 42,
          unit: 'mg/g',
          system: UCUM_SYSTEM,
          code: 'mg/g',
        },
      }),
    ])

    expect(result.facts.urineAlbuminRatio.numericValue).toBe(42)
    expect(result.observationContexts?.uacr.useState).toBe('quantitative_comparable')
  })

  it('does not mistake separate serum albumin and creatinine tests for UACR', () => {
    const result = profile([
      observation('serum-albumin', {
        code: { text: 'Serum albumin' },
        valueQuantity: { value: 4.1, unit: 'g/dL' },
      }),
      observation('serum-creatinine', {
        code: { text: 'Serum creatinine' },
        valueQuantity: { value: 1.2, unit: 'mg/dL' },
      }),
    ])

    expect(result.facts.urineAlbuminRatio).toBeUndefined()
    expect(result.observationContexts?.uacr).toBeUndefined()
  })

  it('does not treat a UACR record in a non-comparable unit as mg/g', () => {
    const result = profile([
      observation('wrong-unit-uacr', {
        code: { text: 'UACR' },
        valueQuantity: {
          value: 80,
          unit: 'mg/L',
          system: UCUM_SYSTEM,
          code: 'mg/L',
        },
      }),
    ])

    expect(result.facts.urineAlbuminRatio.numericValue).toBeUndefined()
    expect(result.observationContexts?.uacr.useState).toBe('not_quantitative_comparable')
  })

  it('uses the latest governed UACR record rather than a patient-specific value', () => {
    const result = profile([
      observation('older-uacr', {
        effectiveDateTime: '2026-01-10',
        code: { text: 'UACR' },
        valueQuantity: { value: 35, unit: 'mg/g' },
      }),
      observation('latest-uacr', {
        effectiveDateTime: '2026-06-20',
        code: { text: '尿白蛋白／肌酸酐比' },
        valueQuantity: { value: 67, unit: 'mg/g' },
      }),
    ])

    expect(result.facts.urineAlbuminRatio).toMatchObject({
      numericValue: 67,
      date: '2026-06-20',
    })
    expect(result.facts.urineAlbuminRatio.sources?.[0].resourceId).toBe('latest-uacr')
  })

  it('leaves UACR absent when the patient has no matching record', () => {
    const result = profile([])

    expect(result.facts.urineAlbuminRatio).toBeUndefined()
    expect(result.observationContexts?.uacr).toBeUndefined()
  })

  it('labels the earliest prescription as observed history rather than the true treatment start', () => {
    const forxiga = (
      id: string,
      authoredOn: string,
      diagnosisCode: string,
      status: string,
    ): MedicationEntity => ({
      id,
      status,
      authoredOn,
      medicationCodeableConcept: {
        coding: [{
          system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
          code: 'BC26476100',
          display: 'Forxiga 10 mg',
        }],
      },
      reasonCode: [{
        coding: [{
          system: 'http://hl7.org/fhir/sid/icd-10-cm',
          code: diagnosisCode,
        }],
      }],
    })

    const result = profile([], [
      forxiga('unrelated-old-order', '2025-01-28', 'U07.1', 'completed'),
      forxiga('ckd-first-order', '2026-04-28', 'N18.32', 'completed'),
      forxiga('ckd-current-order', '2026-06-25', 'N18.32', 'active'),
    ])

    expect(result.coverageContexts?.taiwanNhiSglt2).toMatchObject({
      prescriptionDate: '2026-06-25',
      earliestObservedPrescriptionDate: '2026-04-28',
      indicationRoute: 'ckd',
    })
    expect(
      result.coverageContexts?.taiwanNhiSglt2?.confirmedTreatmentStartDate,
    ).toBeUndefined()
  })
})

describe('FHIR CDSS governed eGFR normalization', () => {
  it.each([
    ['69405-9', 'mL/min/1.73m2', undefined],
    ['69405-9', 'mL/min/{1.73_m2}', 'mL/min/{1.73_m2}'],
    ['77147-7', 'mL/min/1.73m²', undefined],
    ['77147-7', 'mL/min/{1.73m2}', 'mL/min/{1.73m2}'],
    ['77147-7', 'mL/min/1.73m^2', 'mL/min/1.73m^2'],
  ])(
    'accepts LOINC %s with equivalent UCUM representation %s',
    (loinc, unit, code) => {
      const result = profile([
        observation(`egfr-${loinc}-${unit}`, {
          code: { coding: [{ system: LOINC_SYSTEM, code: loinc }] },
          valueQuantity: {
            value: 34,
            unit,
            system: UCUM_SYSTEM,
            ...(code ? { code } : {}),
          },
        }),
      ])

      expect(result.facts.eGFR).toMatchObject({
        numericValue: 34,
        date: '2026-06-01',
      })
    },
  )

  it('builds a current trend and CKD eligibility from LOINC 69405-9 results', () => {
    const dates = [
      ['2025-09-10', 35],
      ['2025-12-12', 34],
      ['2026-02-15', 33],
      ['2026-04-20', 32],
      ['2026-06-25', 34],
    ] as const
    const result = profile(dates.map(([effectiveDateTime, value], index) => (
      observation(`egfr-69405-${index}`, {
        effectiveDateTime,
        code: { coding: [{ system: LOINC_SYSTEM, code: '69405-9' }] },
        valueQuantity: {
          value,
          unit: 'mL/min/{1.73_m2}',
          system: UCUM_SYSTEM,
          code: 'mL/min/{1.73_m2}',
        },
      })
    )))

    expect(result.facts.eGFR.numericValue).toBe(34)
    expect(result.facts.eGFRTrend.sources).toHaveLength(4)
    expect(result.facts.ckdChronicity).toBeDefined()
    expect(result.diseasePackEligibility?.['ckd-poc']).toMatchObject({
      basis: 'chronic_labs',
      code: '69405-9',
    })
  })

  it('rejects an otherwise matching eGFR value with a non-UCUM system', () => {
    const result = profile([
      observation('egfr-wrong-system', {
        code: { coding: [{ system: LOINC_SYSTEM, code: '69405-9' }] },
        valueQuantity: {
          value: 34,
          unit: 'mL/min/1.73m2',
          system: 'https://example.org/local-units',
        },
      }),
    ])

    expect(result.facts.eGFR).toBeUndefined()
  })
})

describe('FHIR CDSS hypoglycemia-risk medication classification', () => {
  function medication(
    id: string,
    display: string,
    status = 'active',
    category = 'ANTIDIABETIC AGENTS',
  ): MedicationEntity {
    return {
      id,
      status,
      authoredOn: '2026-06-25',
      medicationCodeableConcept: {
        coding: [{ display }],
        text: display,
      },
      category: [{ coding: [{ display: category }], text: category }],
      _sourceResourceType: 'MedicationRequest',
    }
  }

  it('identifies active insulin and sulfonylurea prescriptions without treating them as confirmed use', () => {
    const result = profile([], [
      medication('insulin', 'Insulin glargine (Lantus)'),
      medication('sulfonylurea', 'Glimepiride 2 mg'),
    ])

    expect(result.medicationClassContexts).toMatchObject({
      insulin: {
        state: 'active-order-unconfirmed',
        medicationNames: ['Insulin glargine (Lantus)'],
      },
      sulfonylurea: {
        state: 'active-order-unconfirmed',
        medicationNames: ['Glimepiride 2 mg'],
      },
    })
    expect(result.facts.hypoglycemiaRiskMedications.zh).toContain('Insulin glargine')
    expect(result.facts.hypoglycemiaRiskMedications.zh).toContain('Glimepiride')
    expect(result.facts.hypoglycemiaRiskMedications.sources).toHaveLength(2)
  })

  it('does not ask for manual confirmation when only a recognized SGLT2 inhibitor is active', () => {
    const result = profile([], [
      medication('forxiga', 'Forxiga 10 mg (dapagliflozin)'),
    ])

    expect(result.medicationClassContexts).toMatchObject({
      insulin: { state: 'not-found' },
      sulfonylurea: { state: 'not-found' },
    })
    expect(result.facts.hypoglycemiaRiskMedications.zh).toBe(
      '現有資料未見胰島素或磺醯脲',
    )
  })

  it('does not treat a completed sulfonylurea prescription as current use', () => {
    const result = profile([], [
      medication('old-su', 'Gliclazide 30 mg', 'completed'),
    ])

    expect(result.medicationClassContexts?.sulfonylurea?.state).toBe(
      'historical-record-current-status-unknown',
    )
    expect(result.facts.hypoglycemiaRiskMedications.zh).toBe(
      '歷史胰島素／磺醯脲處方：Gliclazide 30 mg',
    )
  })

  it('marks the assessment uncertain only when an active antidiabetic ingredient is unmapped', () => {
    const result = profile([], [
      medication('unmapped', '院內降糖複方 X'),
    ])

    expect(result.medicationClassContexts).toMatchObject({
      insulin: { state: 'uncertain' },
      sulfonylurea: { state: 'uncertain' },
    })
    expect(result.facts.hypoglycemiaRiskMedications.zh).toContain('無法辨識成分')
  })

  it('classifies kidney- and cardiovascular-protective medication classes', () => {
    const result = profile([], [
      medication('sglt2', 'Forxiga 10 mg (dapagliflozin)'),
      medication('statin', 'Atorvastatin 40 mg', 'active', 'LIPID MODIFYING AGENTS'),
      medication('arb', 'Losartan 50 mg', 'active', 'ANTIHYPERTENSIVE AGENTS'),
      medication('finerenone', 'Kerendia 10 mg (finerenone)', 'active', 'OTHER'),
    ])

    expect(result.medicationClassContexts).toMatchObject({
      'sglt2-inhibitor': { state: 'active-order-unconfirmed' },
      statin: { state: 'active-order-unconfirmed' },
      'ace-inhibitor-or-arb': { state: 'active-order-unconfirmed' },
      finerenone: { state: 'active-order-unconfirmed' },
    })
    expect(result.facts.statinTherapy.zh).toContain('Atorvastatin')
    expect(result.facts.aceArbTherapy.zh).toContain('Losartan')
  })

  it('keeps historical ARB and statin prescriptions visible with dates and data coverage', () => {
    const result = profile([], [
      {
        ...medication('old-statin', 'Rosuvastatin 10 mg', 'completed', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2025-05-20',
      },
      {
        ...medication('old-arb', 'Valsartan 80 mg', 'completed', 'ANTIHYPERTENSIVE AGENTS'),
        authoredOn: '2026-04-12',
      },
      {
        ...medication('coverage-end', 'Metformin 500 mg', 'active'),
        authoredOn: '2026-06-25',
      },
    ])

    expect(result.medicationClassContexts).toMatchObject({
      statin: {
        state: 'historical-record-current-status-unknown',
        lastPrescriptionDate: '2025-05-20',
        dataWindowStartDate: '2025-05-20',
        dataWindowEndDate: '2026-06-25',
      },
      'ace-inhibitor-or-arb': {
        state: 'historical-record-current-status-unknown',
        lastPrescriptionDate: '2026-04-12',
        dataWindowStartDate: '2025-05-20',
        dataWindowEndDate: '2026-06-25',
      },
    })
    expect(result.facts.statinTherapy.zh).toContain('最近 2025-05-20')
    expect(result.facts.statinTherapy.zh).toContain('1 筆處方')
    expect(result.facts.statinTherapy.zh).not.toContain('用藥資料範圍')
    expect(result.facts.aceArbTherapy.zh).toContain('Valsartan')
  })

  it('deduplicates repeated historical prescriptions in the summary while preserving every source', () => {
    const result = profile([], [
      {
        ...medication('old-statin-1', 'Rosuvastatin 10 mg', 'completed', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2025-03-20',
      },
      {
        ...medication('old-statin-2', '  Rosuvastatin   10 mg  ', 'completed', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2025-05-20',
      },
      {
        ...medication('old-statin-3', 'ROSUVASTATIN 10 MG', 'completed', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2025-04-20',
      },
    ])

    expect(result.medicationClassContexts?.statin).toMatchObject({
      state: 'historical-record-current-status-unknown',
      medicationNames: ['Rosuvastatin 10 mg'],
      lastPrescriptionDate: '2025-05-20',
    })
    expect(result.facts.statinTherapy.zh).toBe(
      '歷史處方：Rosuvastatin 10 mg（3 筆處方 · 最近 2025-05-20）',
    )
    expect(result.facts.statinTherapy.sources).toHaveLength(3)
  })

  it('uses the governed English ingredient name in physician medication evidence', () => {
    const historicalValsartan: MedicationEntity = {
      ...medication('historical-valsartan', '得安穩膜衣錠160毫克', 'completed', 'CARDIOVASCULAR'),
      authoredOn: '2026-04-25',
      medicationCodeableConcept: {
        text: '得安穩膜衣錠160毫克',
        coding: [{
          system: 'https://www.whocc.no/atc',
          code: 'C09CA03',
          display: '得安穩膜衣錠160毫克',
        }],
      },
      drugTerminology: {
        source: 'nhi-official-drug-master',
        snapshotId: 'test-snapshot',
        officialNameZh: '得安穩膜衣錠160毫克',
        officialNameEn: 'DIOVAN FILM-COATED TABLETS 160MG',
        ingredientText: 'VALSARTAN 160 MG',
      },
    }

    const result = profile([], [historicalValsartan])

    expect(result.medicationClassContexts?.['ace-inhibitor-or-arb']).toMatchObject({
      medicationNames: ['VALSARTAN 160 MG'],
    })
    expect(result.facts.aceArbTherapy.zh).toBe(
      '歷史處方：VALSARTAN 160 MG（1 筆處方 · 最近 2026-04-25）',
    )
    expect(result.facts.aceArbTherapy.zh).not.toContain('得安穩')
    expect(result.facts.aceArbTherapy.sources).toHaveLength(1)
    expect(result.facts.aceArbTherapy.sources?.[0]).toMatchObject({
      resourceType: 'MedicationRequest',
      value: 'VALSARTAN 160 MG',
    })
  })

  it('prefers a current class record without mixing historical names into current use', () => {
    const result = profile([], [
      {
        ...medication('old-statin', 'Rosuvastatin 10 mg', 'completed', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2025-05-20',
      },
      {
        ...medication('current-statin', 'Atorvastatin 20 mg', 'active', 'LIPID MODIFYING AGENTS'),
        authoredOn: '2026-06-25',
      },
    ])

    expect(result.medicationClassContexts?.statin).toMatchObject({
      state: 'active-order-unconfirmed',
      medicationNames: ['Atorvastatin 20 mg'],
      lastPrescriptionDate: '2026-06-25',
    })
    expect(result.facts.statinTherapy.zh).toContain('Atorvastatin 20 mg')
    expect(result.facts.statinTherapy.zh).not.toContain('Rosuvastatin 10 mg')
  })
})

describe('FHIR CDSS cardiorenal personalization inputs', () => {
  it('extracts ASCVD, heart failure, hypertension, potassium, and lipids from governed data', () => {
    const encounters: EncounterEntity[] = [{
      id: 'encounter-cardiorenal',
      status: 'finished',
      period: { start: '2026-02-10' },
      reasonCode: [
        {
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'I25.9',
            display: 'Chronic ischemic heart disease',
          }],
        },
        {
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'I11.0',
            display: 'Hypertensive heart disease with heart failure',
          }],
        },
      ],
    }]
    const conditions: ConditionEntity[] = [{
      id: 'dm-condition',
      clinicalStatus: 'active',
      code: {
        coding: [{
          system: 'http://hl7.org/fhir/sid/icd-10-cm',
          code: 'E11.9',
          display: 'Type 2 diabetes mellitus',
        }],
      },
    }]
    const result = createFhirCdssPatientProfile({
      patient,
      conditions,
      encounters,
      observations: [
        observation('potassium', {
          code: { coding: [{ system: LOINC_SYSTEM, code: '2823-3' }] },
          valueQuantity: { value: 3.7, unit: 'mEq/L' },
        }),
        observation('total-cholesterol', {
          code: { coding: [{ system: LOINC_SYSTEM, code: '2093-3' }] },
          valueQuantity: { value: 174, unit: 'mg/dL' },
        }),
        observation('ldl', {
          code: { coding: [{ system: LOINC_SYSTEM, code: '13457-7' }] },
          valueQuantity: { value: 88, unit: 'mg/dL' },
        }),
      ],
      medications: [],
      allergies: [],
      carePlans: [],
      now: new Date('2026-07-29T00:00:00Z'),
    })

    expect(result.facts).toMatchObject({
      ascvdDiagnosis: { zh: expect.stringContaining('Chronic ischemic heart disease') },
      heartFailureDiagnosis: { zh: expect.stringContaining('Hypertensive heart disease') },
      hypertensionDiagnosis: { zh: expect.stringContaining('Hypertensive heart disease') },
      potassium: { numericValue: 3.7 },
      totalCholesterol: { numericValue: 174 },
      LDL: { numericValue: 88 },
    })
  })
})

describe('FHIR CDSS P1 freshness and preventive-care normalization', () => {
  const now = new Date('2026-07-29T00:00:00Z')

  function preventiveProfile(input: {
    observations?: ObservationEntity[]
    procedures?: ProcedureEntity[]
    conditions?: ConditionEntity[]
    immunizations?: ImmunizationEntity[]
  }) {
    return createFhirCdssPatientProfile({
      patient,
      conditions: input.conditions ?? [],
      encounters: [],
      observations: input.observations ?? [],
      medications: [],
      allergies: [],
      carePlans: [],
      procedures: input.procedures ?? [],
      immunizations: input.immunizations ?? [],
      now,
    })
  }

  it('uses a separate clinically governed interval for each measurement', () => {
    const result = preventiveProfile({
      observations: [
        observation('hba1c-current', {
          effectiveDateTime: '2026-06-01',
          code: { coding: [{ system: LOINC_SYSTEM, code: '4548-4' }] },
          valueQuantity: { value: 6.8, unit: '%' },
        }),
        observation('ldl-due', {
          effectiveDateTime: '2025-06-01',
          code: { coding: [{ system: LOINC_SYSTEM, code: '13457-7' }] },
          valueQuantity: { value: 92, unit: 'mg/dL' },
        }),
        observation('egfr-due', {
          effectiveDateTime: '2026-01-01',
          code: { coding: [{ system: LOINC_SYSTEM, code: '77147-7' }] },
          valueQuantity: { value: 32, unit: 'mL/min/1.73m²' },
        }),
        observation('uacr-due', {
          effectiveDateTime: '2026-01-01',
          code: { coding: [{ system: LOINC_SYSTEM, code: '14959-1' }] },
          valueQuantity: { value: 80, unit: 'mg/g' },
        }),
      ],
    })

    expect(result.freshnessContexts).toMatchObject({
      HbA1c: { state: 'current', intervalDays: 180 },
      LDL: { state: 'due', intervalDays: 365 },
      eGFR: { state: 'overdue', intervalDays: 122 },
      quantitativeUacr: { state: 'overdue', intervalDays: 122 },
      bloodPressure: { state: 'missing', intervalDays: 180 },
    })
  })

  it('reads retinal, neuropathy, and foot completion dates and results from FHIR records', () => {
    const result = preventiveProfile({
      observations: [
        observation('monofilament-old', {
          effectiveDateTime: '2024-12-01',
          code: { text: '10-g monofilament neuropathy screening' },
          valueString: 'Protective sensation intact',
        }),
      ],
      procedures: [
        {
          id: 'retinal-photo',
          status: 'completed',
          performedDateTime: '2026-02-01',
          code: {
            text: 'Fundus photography',
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '92250',
            }],
          },
          note: [{ text: 'No diabetic retinopathy' }],
        },
        {
          id: 'foot-exam',
          status: 'completed',
          performedDateTime: '2026-07-01',
          code: {
            text: 'Comprehensive diabetic foot exam',
            coding: [{
              system: 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets',
              code: 'G0245',
            }],
          },
          note: [{ text: 'Skin intact; pedal pulses palpable' }],
        },
      ],
    })

    expect(result.screeningContexts).toMatchObject({
      'retinal-exam': {
        state: 'current',
        intervalDays: 730,
        date: '2026-02-01',
        result: 'No diabetic retinopathy',
      },
      'neuropathy-exam': {
        state: 'overdue',
        intervalDays: 365,
        date: '2024-12-01',
      },
      'foot-exam': {
        state: 'current',
        intervalDays: 365,
        date: '2026-07-01',
      },
    })
    expect(result.facts.retinalExam.sources?.[0]).toMatchObject({
      resourceType: 'Procedure',
      resourceId: 'retinal-photo',
    })
    expect(result.facts.neuropathyExam.zh).toContain('Protective sensation intact')
  })

  it('shortens the foot interval when governed high-risk foot evidence is present', () => {
    const result = preventiveProfile({
      conditions: [{
        id: 'pvd',
        clinicalStatus: 'active',
        code: {
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.51',
            display: 'Type 2 diabetes with peripheral angiopathy',
          }],
        },
      }],
      procedures: [{
        id: 'foot-exam-high-risk',
        status: 'completed',
        performedDateTime: '2026-04-01',
        code: { text: 'Comprehensive diabetic foot examination' },
      }],
    })

    expect(result.screeningContexts?.['foot-exam']).toMatchObject({
      highRisk: true,
      intervalDays: 0,
      state: 'overdue',
    })
  })

  it('normalizes vaccine types and preserves exact Immunization sources', () => {
    const result = preventiveProfile({
      immunizations: [
        {
          id: 'flu-2025',
          status: 'completed',
          occurrenceDateTime: '2025-10-01',
          vaccineCode: {
            coding: [{
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '140',
              display: 'Influenza, seasonal',
            }],
          },
        },
        {
          id: 'pcv20',
          status: 'completed',
          occurrenceDateTime: '2025-01-10',
          vaccineCode: {
            text: 'PCV20',
            coding: [{
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '216',
              display: 'Pneumococcal conjugate PCV20',
            }],
          },
        },
      ],
    })

    expect(result.screeningContexts).toMatchObject({
      'influenza-vaccine': { state: 'current', date: '2025-10-01' },
      'covid-vaccine': { state: 'missing' },
      'pneumococcal-vaccine': { state: 'current', date: '2025-01-10' },
    })
    expect(result.facts.pneumococcalVaccine.sources?.[0]).toMatchObject({
      resourceType: 'Immunization',
      resourceId: 'pcv20',
    })
  })
})

describe('FHIR DCSI automatic evidence extraction', () => {
  const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'

  function activeCondition(id: string, code: string, display: string): ConditionEntity {
    return {
      id,
      clinicalStatus: 'active',
      recordedDate: '2026-05-01',
      code: {
        coding: [{ system: ICD10_SYSTEM, code, display }],
      },
    }
  }

  function dcsiProfile(input: {
    conditions?: ConditionEntity[]
    encounters?: EncounterEntity[]
    observations?: ObservationEntity[]
    procedures?: ProcedureEntity[]
  }) {
    return createFhirCdssPatientProfile({
      patient,
      conditions: input.conditions ?? [],
      encounters: input.encounters ?? [],
      observations: input.observations ?? [],
      medications: [],
      allergies: [],
      carePlans: [],
      procedures: input.procedures ?? [],
      now: new Date('2026-07-29T00:00:00Z'),
    })
  }

  it('scores all seven domains from governed diagnoses and laboratory evidence', () => {
    const result = dcsiProfile({
      conditions: [
        activeCondition('eye', 'E11.3593', 'Proliferative diabetic retinopathy'),
        activeCondition('nerve', 'E11.40', 'Diabetic neuropathy'),
        activeCondition('stroke', 'I63.9', 'Cerebral infarction'),
        activeCondition('heart', 'I50.9', 'Heart failure'),
        activeCondition('pvd', 'I73.9', 'Peripheral vascular disease'),
        activeCondition('metabolic', 'E11.641', 'Hypoglycemia with coma'),
      ],
      observations: [
        observation('egfr-severe', {
          effectiveDateTime: '2026-06-01',
          code: { coding: [{ system: LOINC_SYSTEM, code: '77147-7' }] },
          valueQuantity: {
            value: 25,
            unit: 'mL/min/1.73m²',
            system: UCUM_SYSTEM,
          },
        }),
      ],
    })

    expect(result.dcsiDomainContexts).toMatchObject({
      ophthalmic: { score: 2 },
      nephropathy: { score: 2, basis: 'governed-lab' },
      neuropathy: { score: 1, diabetesAttribution: 'explicit' },
      cerebrovascular: { score: 2 },
      cardiovascular: { score: 2, diabetesAttribution: 'not-established' },
      'peripheral-vascular': { score: 1 },
      metabolic: { score: 2 },
    })
    expect(
      Object.values(result.dcsiDomainContexts ?? {})
        .reduce((sum, context) => sum + (context?.score ?? 0), 0),
    ).toBe(12)
  })

  it('keeps only the highest severity within a domain', () => {
    const result = dcsiProfile({
      conditions: [
        activeCondition('angina', 'I20.9', 'Angina'),
        activeCondition('heart-failure', 'I50.9', 'Heart failure'),
      ],
    })

    expect(result.dcsiDomainContexts?.cardiovascular).toMatchObject({ score: 2 })
    expect(result.facts.dcsiCardiovascularEvidence.sources).toEqual([
      expect.objectContaining({ resourceId: 'heart-failure' }),
    ])
  })

  it('accepts dotless ICD-10-CM codes from a recognized Taiwan code system', () => {
    const result = dcsiProfile({
      conditions: [{
        id: 'dotless-neuropathy',
        clinicalStatus: 'active',
        recordedDate: '2026-05-01',
        code: {
          coding: [{
            system: 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/icd-10-cm-2021-tw',
            code: 'E1140',
            display: '第二型糖尿病併神經病變',
          }],
        },
      }],
    })

    expect(result.dcsiDomainContexts?.neuropathy).toMatchObject({
      score: 1,
      basis: 'governed-code',
      diabetesAttribution: 'explicit',
    })
    expect(result.facts.dcsiNeuropathyEvidence.zh).not.toContain('歸因未確認')
  })

  it('keeps every DCSI-supporting ICD code from the same encounter', () => {
    const result = dcsiProfile({
      conditions: [activeCondition('diabetes', 'E11.9', 'Type 2 diabetes')],
      encounters: [{
        id: 'retina-visit',
        status: 'finished',
        period: { start: '2026-06-10' },
        reasonCode: [
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'H35.351',
              display: 'Cystoid macular degeneration, right eye',
            }],
          },
          {
            coding: [{
              system: ICD10_SYSTEM,
              code: 'H35.81',
              display: 'Retinal edema',
            }],
          },
        ],
      }],
    })

    expect(result.facts.dcsiOphthalmicEvidence.sources).toHaveLength(1)
    expect(result.dcsiDomainContexts?.ophthalmic?.diabetesAttribution).toBe('not-established')
    expect(result.facts.dcsiOphthalmicEvidence.zh).toBe(
      '視網膜病變（糖尿病歸因未確認）',
    )
    expect(result.facts.dcsiOphthalmicEvidence.sources?.[0].coding).toEqual([
      expect.objectContaining({ code: 'H35.351' }),
      expect.objectContaining({ code: 'H35.81' }),
    ])
  })

  it('marks a nonspecific H49 nerve palsy without claiming diabetes causality', () => {
    const result = dcsiProfile({
      conditions: [activeCondition('diabetes', 'E11.9', 'Type 2 diabetes')],
      encounters: [{
        id: 'oculomotor-visit',
        status: 'finished',
        period: { start: '2026-06-10' },
        reasonCode: [{
          coding: [{
            system: ICD10_SYSTEM,
            code: 'H49.00',
            display: 'Third oculomotor nerve palsy, unspecified eye',
          }],
        }],
      }],
    })

    expect(result.dcsiDomainContexts?.neuropathy).toMatchObject({
      score: 1,
      diabetesAttribution: 'not-established',
    })
    expect(result.facts.dcsiNeuropathyEvidence.zh).toBe(
      '眼球運動神經麻痺（糖尿病歸因未確認）',
    )
  })

  it('uses a 12-month window for encounters but retains an explicitly active chronic condition', () => {
    const result = dcsiProfile({
      conditions: [{
        ...activeCondition(
          'old-active-cerebrovascular',
          'I65.23',
          'Bilateral carotid artery stenosis',
        ),
        recordedDate: '2020-01-01',
      }],
      encounters: [{
        id: 'old-tia-claim',
        status: 'finished',
        period: { start: '2024-01-01' },
        reasonCode: [{
          coding: [{ system: ICD10_SYSTEM, code: 'G45.9', display: 'TIA' }],
        }],
      }],
    })

    expect(result.dcsiDomainContexts?.cerebrovascular).toMatchObject({ score: 2 })
    expect(result.facts.dcsiCerebrovascularEvidence.sources).toEqual([
      expect.objectContaining({ resourceId: 'old-active-cerebrovascular' }),
    ])
  })

  it('recognizes dialysis and lower-extremity amputation procedures as severe evidence', () => {
    const result = dcsiProfile({
      conditions: [activeCondition('diabetes', 'E11.9', 'Type 2 diabetes')],
      procedures: [
        {
          id: 'dialysis',
          status: 'completed',
          performedDateTime: '2026-06-20',
          code: { text: 'Hemodialysis' },
        },
        {
          id: 'amputation',
          status: 'completed',
          performedDateTime: '2026-06-21',
          code: { text: 'Left toe amputation' },
        },
      ],
    })

    expect(result.dcsiDomainContexts).toMatchObject({
      nephropathy: { score: 2, basis: 'governed-procedure' },
      'peripheral-vascular': { score: 2, basis: 'governed-procedure' },
    })
    expect(result.facts.dcsiNephropathyEvidence.sources?.[0]).toMatchObject({
      resourceType: 'Procedure',
      resourceId: 'dialysis',
    })
  })

  it('does not convert absent complication evidence into zero scores', () => {
    const result = dcsiProfile({
      conditions: [activeCondition('diabetes-only', 'E11.9', 'Type 2 diabetes')],
    })

    expect(result.dcsiDomainContexts).toBeUndefined()
  })
})

describe('analyte recognition across source coding styles', () => {
  function egfrObservation(code: ObservationEntity['code']): ObservationEntity {
    return observation('egfr', {
      code,
      valueQuantity: { value: 32, unit: 'mL/min/1.73m2', system: UCUM_SYSTEM },
    })
  }

  // 33914-3 is what NHI-FHIR-Bridge below v1.3.2 sent for every eGFR and
  // 62238-1 is CKD-EPI. Neither was recognised, so the kidney modules reported
  // missing data for records the source had actually supplied.
  it.each([
    ['MDRD 77147-7', '77147-7'],
    ['legacy bridge 33914-3', '33914-3'],
    ['CKD-EPI 62238-1', '62238-1'],
    ['69405-9', '69405-9'],
  ])('reads eGFR from %s', (_label, loinc) => {
    const result = profile([
      egfrObservation({ coding: [{ system: LOINC_SYSTEM, code: loinc }] }),
    ])

    expect(result.facts.eGFR?.numericValue).toBe(32)
  })

  it('reads eGFR from a record that names the test without a LOINC', () => {
    const result = profile([egfrObservation({ text: 'eGFR' })])

    expect(result.facts.eGFR?.numericValue).toBe(32)
  })

  it('reads HbA1c from a method-specific LOINC', () => {
    const result = profile([
      observation('hba1c', {
        code: { coding: [{ system: LOINC_SYSTEM, code: '17856-6' }] },
        valueQuantity: { value: 8.1, unit: '%', system: UCUM_SYSTEM },
      }),
    ])

    expect(result.facts.HbA1c?.numericValue).toBe(8.1)
  })

  it('still rejects a value whose unit does not match the analyte', () => {
    const result = profile([
      egfrObservation({ coding: [{ system: LOINC_SYSTEM, code: '33914-3' }] }),
      observation('egfr-bad-unit', {
        code: { coding: [{ system: LOINC_SYSTEM, code: '33914-3' }] },
        effectiveDateTime: '2026-06-20',
        valueQuantity: { value: 999, unit: 'mg/dL', system: UCUM_SYSTEM },
      }),
    ])

    expect(result.facts.eGFR?.numericValue).toBe(32)
  })
})
