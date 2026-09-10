import { categorizeObservation } from '@/src/shared/utils/lab-categories'

// Shape taken from a real 2026-09 medcloud capture (values synthetic): the
// bridge ships hs-Troponin I with the high-sensitivity LOINC and the NHI order
// code, neither of which the chemistry panel recognised — the result landed in
// 其他 instead of 生化.
const hsTroponin = (code: Record<string, unknown>) => ({
  resourceType: 'Observation',
  status: 'final',
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'laboratory',
    }],
  }],
  code,
  valueQuantity: { value: 12, unit: 'ng/L' },
})

describe('hs-Troponin I categorisation', () => {
  it('routes the high-sensitivity LOINC into 生化', () => {
    const obs = hsTroponin({
      text: 'hs-Troponin I',
      coding: [{ system: 'http://loinc.org', code: '89579-7' }],
    })
    expect(categorizeObservation(obs)?.id).toBe('chem')
  })

  it('routes the NHI order code into 生化', () => {
    const obs = hsTroponin({
      text: 'hs-Troponin I',
      coding: [{ code: '09099C', display: '心肌旋轉蛋白Ｉ ;(Troponin I)' }],
    })
    expect(categorizeObservation(obs)?.id).toBe('chem')
  })

  it('routes on the source name alone, for captures that carry no coding', () => {
    expect(categorizeObservation(hsTroponin({ text: 'hs-Troponin I' }))?.id).toBe('chem')
  })

  it('still routes conventional troponin', () => {
    expect(categorizeObservation(hsTroponin({ text: 'Troponin I' }))?.id).toBe('chem')
    expect(categorizeObservation(hsTroponin({
      text: 'Troponin I',
      coding: [{ system: 'http://loinc.org', code: '10839-9' }],
    }))?.id).toBe('chem')
  })
})
