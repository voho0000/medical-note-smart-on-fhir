// FHIR Clinical Data Mapper
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ProcedureEntity,
  EncounterEntity,
  DocumentReferenceEntity,
  CompositionEntity
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
      category: fhirResource.category,
      encounter: fhirResource.encounter
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
      presentedForm: fhirResource.presentedForm,
      encounter: fhirResource.encounter
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
      performedPeriod: fhirResource.performedPeriod,
      encounter: fhirResource.encounter
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

  static toDocumentReference(fhirResource: any): DocumentReferenceEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      type: fhirResource.type,
      category: fhirResource.category,
      subject: fhirResource.subject,
      date: fhirResource.date,
      author: fhirResource.author,
      description: fhirResource.description,
      content: fhirResource.content,
      context: fhirResource.context
    }
  }

  static toComposition(fhirResource: any): CompositionEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      type: fhirResource.type,
      category: fhirResource.category,
      subject: fhirResource.subject,
      encounter: fhirResource.encounter,
      date: fhirResource.date,
      author: fhirResource.author,
      title: fhirResource.title,
      section: fhirResource.section
    }
  }
}
