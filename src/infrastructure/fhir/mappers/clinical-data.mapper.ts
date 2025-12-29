// FHIR Clinical Data Mapper
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ProcedureEntity,
  EncounterEntity
} from '@/src/core/entities/clinical-data.entity'

export class ClinicalDataMapper {
  static toCondition(fhirResource: any): ConditionEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      clinicalStatus: fhirResource.clinicalStatus?.coding?.[0]?.code,
      verificationStatus: fhirResource.verificationStatus?.coding?.[0]?.code,
      recordedDate: fhirResource.recordedDate || fhirResource.dateRecorded
    }
  }

  static toMedication(fhirResource: any): MedicationEntity {
    return {
      id: fhirResource.id || '',
      medicationCodeableConcept: fhirResource.medicationCodeableConcept,
      status: fhirResource.status,
      intent: fhirResource.intent,
      authoredOn: fhirResource.authoredOn,
      dosageInstruction: fhirResource.dosageInstruction
    }
  }

  static toAllergy(fhirResource: any): AllergyEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      clinicalStatus: fhirResource.clinicalStatus?.coding?.[0]?.code,
      verificationStatus: fhirResource.verificationStatus?.coding?.[0]?.code,
      criticality: fhirResource.criticality,
      reaction: fhirResource.reaction,
      recordedDate: fhirResource.recordedDate || fhirResource.recorded
    }
  }

  static toObservation(fhirResource: any): ObservationEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      valueQuantity: fhirResource.valueQuantity,
      valueString: fhirResource.valueString,
      component: fhirResource.component,
      effectiveDateTime: fhirResource.effectiveDateTime,
      status: fhirResource.status,
      category: fhirResource.category
    }
  }

  static toDiagnosticReport(fhirResource: any, observations: ObservationEntity[]): DiagnosticReportEntity {
    const report: DiagnosticReportEntity = {
      id: fhirResource.id || '',
      code: fhirResource.code,
      result: fhirResource.result,
      conclusion: fhirResource.conclusion,
      effectiveDateTime: fhirResource.effectiveDateTime,
      status: fhirResource.status,
      issued: fhirResource.issued,
      category: fhirResource.category,
      conclusionCode: fhirResource.conclusionCode,
      note: fhirResource.note,
      presentedForm: fhirResource.presentedForm
    }

    // Attach related observations with expansion of hasMember
    if (fhirResource.result && observations.length > 0) {
      const resultIds = fhirResource.result
        .map((ref: any) => ref.reference?.split('/').pop())
        .filter(Boolean)
      
      // Create a map of observations by ID for easy lookup
      const obsMap = new Map(observations.map(obs => [obs.id, obs]))
      
      // Get the actual observation objects
      const reportObservations = resultIds
        .map((id: string) => obsMap.get(id))
        .filter(Boolean)
      
      // Expand any observations that have members
      const expandedObservations = reportObservations.flatMap((obs: any) => {
        if (!obs?.hasMember?.length) return [obs]
        
        const members = obs.hasMember
          .map((m: any) => {
            const memberId = m.reference?.split('/').pop()
            return memberId ? obsMap.get(memberId) : null
          })
          .filter(Boolean)
          
        return [obs, ...members]
      })
      
      report._observations = expandedObservations as ObservationEntity[]
    }

    return report
  }

  static toProcedure(fhirResource: any): ProcedureEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      status: fhirResource.status,
      performedDateTime: fhirResource.performedDateTime,
      performedPeriod: fhirResource.performedPeriod
    }
  }

  static toEncounter(fhirResource: any): EncounterEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      class: fhirResource.class,
      type: fhirResource.type,
      period: fhirResource.period,
      reasonCode: fhirResource.reasonCode
    }
  }
}
