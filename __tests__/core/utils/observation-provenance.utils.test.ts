import { buildLabPivots, formatValue } from '@/src/shared/utils/lab-pivot.utils'
import {
  getNhiMedicloudOriginalInstitution,
  isAdultPreventiveHealthExamResource,
  isInferredObservationUnit,
  isNhiMedicloudObservation,
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

  it('detects MediCloud only from the exact extension URL and coding.code', () => {
    const observation = {
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
        valueCodeableConcept: {
          coding: [{ code: 'nhi-medicloud', display: '完全不同的顯示文字' }],
        },
      }],
    }

    expect(isNhiMedicloudObservation(observation)).toBe(true)
    expect(isNhiMedicloudObservation({
      extension: [{
        url: 'https://example.test/wrong-extension',
        valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
      }],
    })).toBe(false)
    expect(isNhiMedicloudObservation({
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
        valueCodeableConcept: { coding: [{ code: 'other', display: 'nhi-medicloud' }] },
      }],
    })).toBe(false)
  })

  it('uses a supplied original institution but never treats the NHI authority as the laboratory', () => {
    const extension = [{
      url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
      valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
    }]

    expect(getNhiMedicloudOriginalInstitution({
      extension,
      performer: [{ display: '臺北榮民總醫院' }],
    })).toBe('臺北榮民總醫院')
    expect(getNhiMedicloudOriginalInstitution({
      extension,
      performer: [{ display: '衛生福利部中央健康保險署' }],
    })).toBeUndefined()
  })

  it('carries MediCloud provenance into cumulative-lab cells', () => {
    const pivots = buildLabPivots([{
      id: 'medicloud-glucose',
      code: {
        text: 'Glucose',
        coding: [{ system: 'http://loinc.org', code: '2345-7' }],
      },
      effectiveDateTime: '2026-09-14T08:00:00+08:00',
      valueQuantity: { value: 108, unit: 'mg/dL' },
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
        valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
      }],
    }])

    const markedCells = Object.values(pivots)
      .flatMap((pivot) => pivot.rows)
      .flatMap((row) => [...row.values.values()])
      .filter((cell) => cell.sourceProvenance === 'nhi-medicloud')

    expect(markedCells).toHaveLength(1)
    expect(markedCells[0].sourceInstitution).toBeUndefined()
  })

  it('does not label a mixed same-day cell as wholly MediCloud and retains each value source', () => {
    const base = {
      code: { text: 'Glucose', coding: [{ system: 'http://loinc.org', code: '2345-7' }] },
      effectiveDateTime: '2026-09-14T08:00:00+08:00',
    }
    const extension = [{
      url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
      valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
    }]
    const pivots = buildLabPivots([
      { ...base, id: 'cloud', extension, valueQuantity: { value: 108, unit: 'mg/dL' } },
      { ...base, id: 'local', valueQuantity: { value: 96, unit: 'mg/dL' } },
    ])
    const cell = Object.values(pivots).flatMap((pivot) => pivot.rows)
      .flatMap((row) => [...row.values.values()])[0]

    expect(cell.sourceProvenance).toBeUndefined()
    expect(cell.sourceRecords?.map((record) => record.provenance))
      .toEqual(['nhi-medicloud', undefined])
  })
})
