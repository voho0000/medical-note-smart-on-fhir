import { prioritizeClinicalDataForTokenBudget } from '@/src/core/utils/prioritized-clinical-context.utils'
import { buildSourceCatalog } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

function dateAt(dayOffset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + dayOffset)).toISOString()
}

describe('prioritized clinical context', () => {
  it('reserves full custom documents without sacrificing required safety records when they overflow', () => {
    const compositions = [1, 2, 3].map(id => ({
      id: `manual-${id}`, title: 'Discharge summary', date: dateAt(id),
      section: [{ text: { div: `<div>BEGIN-${id} ${'clinical detail '.repeat(2000)} END-${id}</div>` } }],
    }))
    const input = {
      compositions,
      allergies: [{ id: 'required-allergy', code: { text: 'Synthetic allergy' } }],
      procedures: [{ id: 'optional-old', code: { text: 'Historical procedure' } }],
    }
    const result = prioritizeClinicalDataForTokenBudget(input, 700, 100_000, Date.UTC(2026, 8, 3), { preserveDocuments: true })
    expect(result.data.compositions).toEqual(compositions)
    expect(result.documentTokenBudget).toBeUndefined()
    expect(result.data.allergies).toEqual(input.allergies)
    expect(result.data.procedures).toEqual([])
    expect(result.retainedEstimatedTokens).toBeGreaterThan(700)
    expect(prioritizeClinicalDataForTokenBudget(input, 700, 100_000).data.compositions).toHaveLength(1)
  })

  it('reduces a 75k selection toward 50k by retaining newer records first', () => {
    const observations = Array.from({ length: 60 }, (_, index) => ({
      id: `normal-${index}`,
      code: { text: 'Creatinine' },
      effectiveDateTime: dateAt(index),
      valueQuantity: { value: 1 + index / 100, unit: 'mg/dL' },
      interpretation: { coding: [{ code: 'N' }] },
      note: [{ text: `routine normal result ${'detail '.repeat(80)}` }],
    }))
    observations.splice(20, 0, {
      id: 'abnormal-critical',
      code: { text: 'Potassium' },
      effectiveDateTime: dateAt(20),
      valueQuantity: { value: 6.8, unit: 'mmol/L' },
      interpretation: { coding: [{ code: 'HH' }] },
      note: [{ text: 'critical result' }],
    })

    const result = prioritizeClinicalDataForTokenBudget(
      {
        observations,
        vitalSigns: [],
        conditions: [{ id: 'condition-active', code: { text: 'CKD' } }],
        allergies: [{ id: 'allergy-1', code: { text: 'Penicillin' } }],
        medications: [{
          id: 'med-active',
          status: 'active',
          authoredOn: '2026-01-01',
          medicationCodeableConcept: { text: 'Losartan' },
        }],
      },
      50_000,
      75_000,
      Date.UTC(2026, 2, 1),
    )

    const retainedIds = new Set(result.data.observations?.map((value) => value.id))
    expect(retainedIds).toContain('abnormal-critical')
    expect(retainedIds).toContain('normal-59')
    expect(retainedIds).not.toContain('normal-0')
    expect(result.retainedEstimatedTokens / result.originalEstimatedTokens)
      .toBeGreaterThan(0.55)
    expect(result.retainedEstimatedTokens / result.originalEstimatedTokens)
      .toBeLessThan(0.8)
  })

  it('keeps mandatory facts and rebuilds the source catalog from retained records', () => {
    const abnormal = {
      id: 'lab-abnormal',
      code: { text: 'Hemoglobin' },
      effectiveDateTime: '2026-02-01',
      valueQuantity: { value: 6.5, unit: 'g/dL' },
      interpretation: { coding: [{ code: 'LL' }] },
    }
    const latestNormal = {
      id: 'lab-latest',
      code: { text: 'Creatinine' },
      effectiveDateTime: '2026-02-02',
      valueQuantity: { value: 1.1, unit: 'mg/dL' },
      interpretation: { coding: [{ code: 'N' }] },
    }
    const oldNormal = {
      id: 'lab-old',
      code: { text: 'Creatinine' },
      effectiveDateTime: '2020-01-01',
      valueQuantity: { value: 1, unit: 'mg/dL' },
      interpretation: { coding: [{ code: 'N' }] },
      note: [{ text: 'old normal '.repeat(2_000) }],
    }
    const result = prioritizeClinicalDataForTokenBudget(
      {
        conditions: [{ id: 'condition-active', code: { text: 'CKD' } }],
        allergies: [{ id: 'allergy-1', code: { text: 'Penicillin' } }],
        medications: [
          {
            id: 'med-active',
            status: 'active',
            medicationCodeableConcept: { text: 'Losartan' },
          },
          {
            id: 'med-old',
            status: 'stopped',
            authoredOn: '2018-01-01',
            medicationCodeableConcept: { text: 'Old medicine' },
            dosageInstruction: [{ text: 'historical '.repeat(2_000) }],
          },
        ],
        observations: [oldNormal, latestNormal, abnormal],
        vitalSigns: [],
        diagnosticReports: [{
          id: 'report-1',
          code: { text: 'CBC' },
          effectiveDateTime: '2026-02-01',
          result: [
            { reference: 'Observation/lab-abnormal' },
            { reference: 'Observation/lab-old' },
          ],
        }],
        encounters: [
          { id: 'enc-old', period: { start: '2018-01-01' }, reasonCode: [{ text: 'old '.repeat(2_000) }] },
          { id: 'enc-new', period: { start: '2026-02-01' }, reasonCode: [{ text: 'Follow-up' }] },
        ],
      },
      5_000,
      75_000,
      Date.UTC(2026, 2, 1),
    )

    expect(result.data.conditions?.map((value) => value.id)).toEqual(['condition-active'])
    expect(result.data.allergies?.map((value) => value.id)).toEqual(['allergy-1'])
    expect(result.data.medications?.map((value) => value.id)).toEqual(['med-active'])
    expect(result.data.observations?.map((value) => value.id)).toEqual([
      'lab-latest',
      'lab-abnormal',
    ])
    expect(result.data.encounters?.map((value) => value.id)).toEqual(['enc-new'])
    expect(result.data.diagnosticReports?.map((value) => value.id)).toEqual(['report-1'])
    expect(result.data.diagnosticReports?.[0]?.result).toEqual([
      { reference: 'Observation/lab-abnormal' },
    ])

    const catalogIds = new Set(buildSourceCatalog(result.data).map((entry) => entry.resourceId))
    expect(catalogIds).toEqual(new Set([
      'condition-active',
      'allergy-1',
      'med-active',
      'lab-latest',
      'lab-abnormal',
      'enc-new',
      'report-1',
    ]))
  })
})
