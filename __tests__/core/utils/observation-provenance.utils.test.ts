import { formatValue } from '@/src/shared/utils/lab-pivot.utils'
import {
  isAdultPreventiveHealthExamResource,
  isInferredObservationUnit,
} from '@/src/shared/utils/observation-provenance.utils'

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

  it.each([
    'http://nhi-fhir-bridge/source-program',
    'https://cloud-wildcatch.invalid/fhir/source-program',
  ])('detects adult health exams from the %s tag', (system) => {
    expect(isAdultPreventiveHealthExamResource({
      meta: {
        tag: [{
          system,
          code: 'adult-preventive',
        }],
      },
    })).toBe(true)
  })

  it('does not infer adult health exams from unrelated tags', () => {
    expect(isAdultPreventiveHealthExamResource({
      meta: { tag: [{ system: 'other', code: 'adult-preventive' }] },
    })).toBe(false)
    expect(isAdultPreventiveHealthExamResource({
      meta: { tag: [{ system: 'http://nhi-fhir-bridge/source-program', code: 'other' }] },
    })).toBe(false)
  })
})
