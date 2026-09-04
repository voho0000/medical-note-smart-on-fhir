/**
 * Wiring, not rules.
 *
 * The CDSS adapters and the pack rules now live in `@voho0000/personalized-care-fhir`
 * and `@voho0000/personalized-care`, and are tested there. What only the app can
 * prove is that its own composition root
 * (`features/clinical-decision-support/guideline-packs/registry`) actually ran
 * `registerCarePacks`, that the app's entity shapes still satisfy the package's
 * host-resource interfaces, and that the two halves meet: profile in, modules out.
 */
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { DEFAULT_CARE_PACK_ID } from '@voho0000/personalized-care'
import {
  getApplicableClinicalGuidelinePacks,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type {
  EncounterEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

const patient: PatientEntity = {
  id: 'wiring-patient',
  resourceType: 'Patient',
  age: 70,
}

const ckdEncounter: EncounterEntity = {
  id: 'wiring-encounter',
  status: 'finished',
  period: { start: '2026-06-25T00:00:00+08:00' },
  reasonCode: [{
    coding: [{
      system: ICD10_SYSTEM,
      code: 'N18.32',
      display: 'Chronic kidney disease, stage 3b',
    }],
  }],
}

const egfr: ObservationEntity = {
  id: 'wiring-egfr',
  resourceType: 'Observation',
  status: 'final',
  effectiveDateTime: '2026-05-01',
  code: {
    coding: [{
      system: LOINC_SYSTEM,
      code: '77147-7',
      display: 'Glomerular filtration rate',
    }],
  },
  valueQuantity: {
    value: 34,
    unit: 'mL/min/1.73m2',
    system: UCUM_SYSTEM,
    code: 'mL/min/1.73m2',
  },
}

function buildProfile() {
  return createFhirCdssPatientProfile({
    patient,
    conditions: [],
    encounters: [ckdEncounter],
    observations: [egfr],
    medications: [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-29T00:00:00Z'),
  })
}

describe('CDSS package wiring', () => {
  it('registers the bundled care packs through the app composition root', () => {
    expect(getEnabledClinicalGuidelinePacks().length).toBeGreaterThan(0)
    expect(getDefaultClinicalGuidelinePack().id).toBe(DEFAULT_CARE_PACK_ID)
  })

  it('turns app entities into a profile the default pack can build modules from', () => {
    const profile = buildProfile()

    expect(getApplicableClinicalGuidelinePacks(profile).map((pack) => pack.id))
      .toContain('ckd-cdss')

    const result = getDefaultClinicalGuidelinePack().build({ profile, locale: 'zh-TW' })
    const moduleIds = [
      ...result.recommendations.map((item) => item.id),
      ...(result.automatedChecks ?? []).map((item) => item.id),
    ]
    expect(moduleIds.length).toBeGreaterThan(0)
    expect(result.recommendations.every((item) => item.title.length > 0)).toBe(true)
  })
})
