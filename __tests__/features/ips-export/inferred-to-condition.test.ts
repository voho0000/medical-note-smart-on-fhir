import { inferredToCondition } from '@/features/ips-export/utils/inference-engine'
import { buildIpsBundle } from '@/features/ips-export/utils/ips-builder'
import { INFERENCE_TAG, IPS_SECTION, SYSTEM } from '@/features/ips-export/utils/ips-constants'
import type { InferredProblem } from '@/features/ips-export/utils/inferred-problems-types'
import type { ClinicalDataCollection, ConditionEntity } from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { FhirResource, IpsCompositionSection } from '@/features/ips-export/utils/ips-types'

const PATIENT: PatientEntity = {
  id: 'pat-1',
  resourceType: 'Patient',
  name: [{ given: ['Test'], family: 'Patient' }],
  gender: 'male',
  birthDate: '1970-02-02',
}

function emptyCollection(extraConditions: ConditionEntity[] = []): ClinicalDataCollection {
  return {
    conditions: extraConditions,
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
    procedures: [],
    encounters: [],
    documentReferences: [],
    compositions: [],
    immunizations: [],
    consents: [],
    devices: [],
    carePlans: [],
  }
}

function makeProblem(partial: Partial<InferredProblem> = {}): InferredProblem {
  return {
    id: 'inferred-0',
    labelZh: '第二型糖尿病',
    labelEn: 'Type 2 diabetes',
    inferenceConfidence: 'high',
    coding: {
      system: SYSTEM.snomed,
      code: '44054006',
      display: 'Diabetes mellitus type II',
      confidence: 'high',
      icd10: 'E11.9',
    },
    strategy: 'B',
    needsManualCoding: false,
    evidence: [
      { kind: 'encounter-icd', label: 'E11.9 第二型糖尿病', icd10: 'E11.9', count: 4, date: '2025-01-01' },
    ],
    rationale: 'Recurrent outpatient E11.9 + chronic metformin.',
    ...partial,
  }
}

describe('inferredToCondition', () => {
  it('produces a namespaced synthetic id and active/provisional status', () => {
    const c = inferredToCondition(makeProblem())
    expect(c.id).toBe('urn:ips-inferred:inferred-0')
    expect(c.clinicalStatus).toBe('active')
    expect(c.verificationStatus).toBe('provisional')
    expect(c.code?.text).toBe('第二型糖尿病')
  })

  it('carries the ICD-10 coding and attaches _sct only when coded', () => {
    const c = inferredToCondition(makeProblem())
    expect(c.code?.coding?.[0]).toEqual({
      system: SYSTEM.icd10,
      code: 'E11.9',
      display: 'Type 2 diabetes',
    })
    expect(c._sct?.code).toBe('44054006')
    expect(c._sct?.confidence).toBe('high')
  })

  it('omits _sct and ICD coding for an uncoded (text-only) problem', () => {
    const c = inferredToCondition(
      makeProblem({
        coding: null,
        strategy: 'none',
        evidence: [{ kind: 'discharge-excerpt', label: 'narrative only' }],
      }),
    )
    expect(c._sct).toBeUndefined()
    expect(c.code?.coding).toBeUndefined()
    expect(c.code?.text).toBe('第二型糖尿病')
  })

  it('records the _inferred audit marker (strategy + evidence + rationale)', () => {
    const c = inferredToCondition(makeProblem())
    expect(c._inferred?.strategy).toBe('B')
    expect(c._inferred?.inferenceConfidence).toBe('high')
    expect(c._inferred?.evidence[0]).toMatchObject({ kind: 'encounter-icd', icd10: 'E11.9', count: 4 })
    expect(c._inferred?.rationale).toContain('metformin')
  })

  it('flags needsManualCoding for a Strategy-A problem', () => {
    const c = inferredToCondition(
      makeProblem({
        strategy: 'A',
        needsManualCoding: true,
        coding: {
          system: SYSTEM.snomed,
          code: '99999999',
          display: 'Made up',
          confidence: 'low',
          needsManualCoding: true,
        },
      }),
    )
    expect(c._inferred?.needsManualCoding).toBe(true)
    expect(c._sct?.confidence).toBe('low')
  })
})

describe('inferredToCondition → buildIpsBundle (no FHIR special-casing)', () => {
  function problemListSection(bundle: ReturnType<typeof buildIpsBundle>) {
    const composition = bundle.entry[0].resource as FhirResource
    const sections = (composition.section as IpsCompositionSection[]) ?? []
    return sections.find((s) => s.code?.coding?.some((c) => c.code === IPS_SECTION.problemList.loinc))
  }

  it('dual-codes a confirmed inferred problem through the EXISTING pipeline', () => {
    const condition = inferredToCondition(makeProblem())
    const bundle = buildIpsBundle({ patient: PATIENT, data: emptyCollection([condition]) })

    // The Problem List section must exist and reference a Condition.
    const section = problemListSection(bundle)
    expect(section).toBeDefined()

    const conditionEntry = bundle.entry.find(
      (e) => (e.resource as FhirResource).resourceType === 'Condition',
    )
    expect(conditionEntry).toBeDefined()
    const resource = conditionEntry!.resource as FhirResource
    const code = resource.code as { coding?: Array<{ system?: string; code?: string }> }

    // Dual-coding: SNOMED prepended, ICD-10 kept — produced by the existing
    // problemCode() with ZERO inference-specific branching.
    expect(code.coding?.[0]).toMatchObject({ system: SYSTEM.snomed, code: '44054006' })
    expect(code.coding?.some((c) => c.system === SYSTEM.icd10 && c.code === 'E11.9')).toBe(true)

    // Auditability: the synthetic condition carries the `ai-inferred` meta.tag so
    // a downstream reader can distinguish AI-synthesized problems from ingested
    // ones (mapProblemList emits the tag solely from the `_inferred` marker).
    const meta = resource.meta as { tag?: Array<{ system?: string; code?: string }> }
    expect(
      meta.tag?.some((tg) => tg.system === INFERENCE_TAG.system && tg.code === INFERENCE_TAG.code),
    ).toBe(true)
  })

  it('does NOT tag an ordinary (non-inferred) source condition', () => {
    const source: ConditionEntity = {
      id: 'cond-src',
      resourceType: 'Condition',
      code: { text: '高血壓', coding: [{ system: SYSTEM.icd10, code: 'I10', display: 'Hypertension' }] },
      clinicalStatus: 'active',
    }
    const bundle = buildIpsBundle({ patient: PATIENT, data: emptyCollection([source]) })
    const conditionEntry = bundle.entry.find(
      (e) => (e.resource as FhirResource).resourceType === 'Condition',
    )
    const meta = (conditionEntry!.resource as FhirResource).meta as
      | { tag?: Array<{ system?: string; code?: string }> }
      | undefined
    expect(
      (meta?.tag ?? []).some(
        (tg) => tg.system === INFERENCE_TAG.system && tg.code === INFERENCE_TAG.code,
      ),
    ).toBe(false)
  })
})
