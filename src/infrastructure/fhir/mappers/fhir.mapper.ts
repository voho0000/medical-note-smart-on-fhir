// FHIR Mapper
// Maps FHIR R4 resources to domain entities
// Implements IDataMapper interface for multi-hospital support
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
import type { IDataMapper } from '@/src/core/interfaces/data-mapper.interface'
import { dataMapperRegistry } from '@/src/core/interfaces/data-mapper.interface'

// Source system identifier for FHIR data
const FHIR_SOURCE_SYSTEM = 'fhir'

/**
 * FhirMapper - FHIR R4 資料轉換器
 * 
 * 實作 IDataMapper 接口，將 FHIR R4 資源轉換為 Domain Entities
 * 
 * 使用方式：
 * 1. 透過 registry: dataMapperRegistry.getMapper('fhir')
 * 2. 透過 singleton: fhirMapper.mapObservation(resource)
 * 3. 透過 static 方法: FhirMapper.toObservation(resource) (向後相容)
 */
export class FhirMapper implements IDataMapper {
  readonly sourceType = FHIR_SOURCE_SYSTEM

  // Instance methods for IDataMapper interface
  mapCondition(source: any): ConditionEntity {
    return FhirMapper.toCondition(source)
  }

  mapMedication(source: any): MedicationEntity {
    return FhirMapper.toMedication(source)
  }

  mapAllergy(source: any): AllergyEntity {
    return FhirMapper.toAllergy(source)
  }

  mapObservation(source: any): ObservationEntity {
    return FhirMapper.toObservation(source)
  }

  mapDiagnosticReport(source: any, observations?: ObservationEntity[]): DiagnosticReportEntity {
    return FhirMapper.toDiagnosticReport(source, observations || [])
  }

  mapProcedure(source: any): ProcedureEntity {
    return FhirMapper.toProcedure(source)
  }

  mapEncounter(source: any): EncounterEntity {
    return FhirMapper.toEncounter(source)
  }

  mapDocumentReference(source: any): DocumentReferenceEntity {
    return FhirMapper.toDocumentReference(source)
  }

  mapComposition(source: any): CompositionEntity {
    return FhirMapper.toComposition(source)
  }

  // Static methods for backward compatibility
  static toCondition(fhirResource: any): ConditionEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      clinicalStatus: fhirResource.clinicalStatus?.coding?.[0]?.code,
      verificationStatus: fhirResource.verificationStatus?.coding?.[0]?.code,
      recordedDate: fhirResource.recordedDate || fhirResource.dateRecorded,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }

  static toMedication(fhirResource: any): MedicationEntity {
    return {
      id: fhirResource.id || '',
      medicationCodeableConcept: fhirResource.medicationCodeableConcept,
      status: fhirResource.status,
      intent: fhirResource.intent,
      authoredOn: fhirResource.authoredOn,
      dosageInstruction: fhirResource.dosageInstruction,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      recordedDate: fhirResource.recordedDate || fhirResource.recorded,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      encounter: fhirResource.encounter,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      encounter: fhirResource.encounter,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      encounter: fhirResource.encounter,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }

  static toEncounter(fhirResource: any): EncounterEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      class: fhirResource.class,
      type: fhirResource.type,
      period: fhirResource.period,
      reasonCode: fhirResource.reasonCode,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      context: fhirResource.context,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
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
      section: fhirResource.section,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }
}

// Singleton instance for the mapper registry pattern
export const fhirDataMapper = new FhirMapper()

// Auto-register to the mapper registry
dataMapperRegistry.register(fhirDataMapper)
