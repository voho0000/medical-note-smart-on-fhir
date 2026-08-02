import { calculateAge, type PatientEntity } from '@/src/core/entities/patient.entity'
import { getAnalyteCanonicalKey } from '@/src/shared/utils/lab-normalize'
import type {
  ConditionEntity,
  EncounterEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  EducationCoding,
  EducationMedication,
  EducationObservation,
  PatientEducationContext,
} from './types'

export interface PatientEducationContextInput {
  patient: PatientEntity
  conditions: ConditionEntity[]
  encounters: EncounterEntity[]
  observations: ObservationEntity[]
  medications: MedicationEntity[]
}

function flattenCodings(
  concepts: Array<{ coding?: EducationCoding[] } | undefined>,
): EducationCoding[] {
  return concepts.flatMap((concept) => concept?.coding ?? [])
}

function toObservation(observation: ObservationEntity): EducationObservation {
  return {
    id: observation.id,
    codings: observation.code?.coding ?? [],
    // Resolve analyte identity here rather than leaving packs to guess from a
    // single LOINC. The same analyte reaches us under several LOINCs depending
    // on the bridge version, and NHI records often carry only a local code or a
    // Chinese name — all of which this resolver already understands.
    canonicalKey: getAnalyteCanonicalKey(observation),
    value: observation.valueQuantity?.value,
    unit: observation.valueQuantity?.unit,
    date: observation.effectiveDateTime,
    status: observation.status,
  }
}

function toMedication(medication: MedicationEntity): EducationMedication {
  return {
    id: medication.id,
    codings: medication.medicationCodeableConcept?.coding ?? [],
    status: medication.status,
    authoredOn: medication.authoredOn,
    source: medication._sourceResourceType === 'MedicationStatement'
      ? '用藥陳述'
      : '處方紀錄',
  }
}

function isUsableCondition(condition: ConditionEntity): boolean {
  const verification = condition.verificationStatus?.toLowerCase()
  const clinical = condition.clinicalStatus?.toLowerCase()

  return !['refuted', 'entered-in-error'].includes(verification ?? '')
    && !['inactive', 'resolved', 'remission'].includes(clinical ?? '')
}

function isUsableEncounter(encounter: EncounterEntity): boolean {
  return !['entered-in-error', 'cancelled'].includes(
    encounter.status?.toLowerCase() ?? '',
  )
}

/**
 * Disease-neutral projection of the loaded record. It excludes names,
 * identifiers, contact details and free-text documents. Each disease pack
 * decides which governed codes are relevant.
 */
export function createPatientEducationContext(
  input: PatientEducationContextInput,
): PatientEducationContext {
  const diagnosisCodings = [
    ...flattenCodings(
      input.conditions
        .filter(isUsableCondition)
        .map((condition) => condition.code),
    ),
    ...flattenCodings(
      input.encounters
        .filter(isUsableEncounter)
        .flatMap((encounter) => encounter.reasonCode ?? []),
    ),
  ]

  return {
    patientKey: input.patient.id,
    age: input.patient.age ?? calculateAge(input.patient.birthDate),
    diagnosisCodings,
    observations: input.observations.map(toObservation),
    medications: input.medications.map(toMedication),
  }
}
