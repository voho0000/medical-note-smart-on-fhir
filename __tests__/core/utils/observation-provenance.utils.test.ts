import { formatValue } from '@/src/shared/utils/lab-pivot.utils'
import { isInferredObservationUnit } from '@/src/shared/utils/observation-provenance.utils'

describe('SDK Observation provenance', () => {
  const inferred = {
    meta: {
      tag: [{
        system: 'https://nhi-fhir-bridge.github.io/CodeSystem/sdk-unit-origin',
        code: 'bridge-inferred',
      }],
    },
    valueQuantity: { value: 98, unit: 'mg/dL' },
  }

  it('detects only the explicit Bridge unit-origin tag', () => {
    expect(isInferredObservationUnit(inferred)).toBe(true)
    expect(isInferredObservationUnit({
      meta: { tag: [{ system: 'other', code: 'bridge-inferred' }] },
    })).toBe(false)
  })

  it('carries the inferred marker into cumulative-lab cells', () => {
    expect(formatValue(inferred).unitInferred).toBe(true)
  })
})
