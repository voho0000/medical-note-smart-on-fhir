// FHIR Mapper
// Maps FHIR R4 resources to domain entities
// Implements IDataMapper interface for multi-hospital support
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ImagingStudyEntity,
  ProcedureEntity,
  EncounterEntity,
  DocumentReferenceEntity,
  CompositionEntity,
  ImmunizationEntity,
  ConsentEntity,
  DeviceEntity,
  CarePlanEntity
} from '@/src/core/entities/clinical-data.entity'
import type { IDataMapper } from '@/src/core/interfaces/data-mapper.interface'
import { dataMapperRegistry } from '@/src/core/interfaces/data-mapper.interface'
import type {
  Condition,
  MedicationRequest,
  AllergyIntolerance,
  Observation,
  DiagnosticReport,
  ImagingStudy,
  Procedure,
  CodeableConcept,
  Reference,
} from '@/src/shared/types/fhir.types'

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
  mapCondition(source: Condition): ConditionEntity {
    return FhirMapper.toCondition(source)
  }

  mapMedication(source: MedicationRequest): MedicationEntity {
    return FhirMapper.toMedication(source)
  }

  mapAllergy(source: AllergyIntolerance): AllergyEntity {
    return FhirMapper.toAllergy(source)
  }

  mapObservation(source: Observation): ObservationEntity {
    return FhirMapper.toObservation(source)
  }

  mapDiagnosticReport(source: DiagnosticReport, observations?: ObservationEntity[]): DiagnosticReportEntity {
    return FhirMapper.toDiagnosticReport(source, observations || [])
  }

  mapImagingStudy(source: ImagingStudy): ImagingStudyEntity {
    return FhirMapper.toImagingStudy(source)
  }

  mapProcedure(source: Procedure): ProcedureEntity {
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
  static toCondition(fhirResource: Condition): ConditionEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      category: fhirResource.category,
      clinicalStatus: (fhirResource.clinicalStatus as CodeableConcept | undefined)?.coding?.[0]?.code,
      verificationStatus: (fhirResource.verificationStatus as CodeableConcept | undefined)?.coding?.[0]?.code,
      recordedDate: fhirResource.recordedDate || fhirResource.dateRecorded,
      onsetDateTime: fhirResource.onsetDateTime,
      encounter: fhirResource.encounter,
      // mCODE cancer-staging summary stamped by the Roche DIP expander. Must be
      // listed explicitly — the mapper drops any field not named here.
      _cancerStage: (fhirResource as { _cancerStage?: string })._cancerStage,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }

  static toMedication(fhirResource: MedicationRequest): MedicationEntity {
    return {
      id: fhirResource.id || '',
      medicationCodeableConcept: fhirResource.medicationCodeableConcept,
      status: fhirResource.status,
      intent: fhirResource.intent,
      authoredOn: fhirResource.authoredOn,
      dosageInstruction: fhirResource.dosageInstruction,
      encounter: fhirResource.encounter,
      dispenseRequest: fhirResource.dispenseRequest,
      courseOfTherapyType: fhirResource.courseOfTherapyType,
      category: fhirResource.category,
      requester: fhirResource.requester,
      reasonCode: fhirResource.reasonCode,
      // Passthrough of the source-resource marker stamped by LocalBundleService.parse
      // (MedicationRequest vs MedicationStatement). Bridge data omits it.
      _sourceResourceType: fhirResource._sourceResourceType,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }

  static toAllergy(fhirResource: AllergyIntolerance): AllergyEntity {
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

  static toObservation(fhirResource: Observation): ObservationEntity {
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      valueQuantity: fhirResource.valueQuantity,
      valueString: fhirResource.valueString,
      valueCodeableConcept: fhirResource.valueCodeableConcept,
      component: fhirResource.component,
      effectiveDateTime: fhirResource.effectiveDateTime,
      status: fhirResource.status,
      category: fhirResource.category,
      // Specimen is the authoritative blood/urine signal — bridge sets
      // specimen.display='Blood' for serum analytes and ='Urine' for
      // urinalysis. Without preserving this, categorizeObservation's
      // Pass 1 specimen routing AND its specimenSaysBlood guard (for
      // Pass 5 text-urine / Pass 6 qualitative fallbacks) both fail open,
      // causing blood-typing/antibody/antigen tests like ABO, ANA,
      // Influenza-Ag, SARS-CoV-2-Ag, 隱球菌抗原 with qualitative values
      // (`+`, `Negative`) to mis-route to the urinalysis tab.
      specimen: fhirResource.specimen,
      encounter: fhirResource.encounter,
      performer: fhirResource.performer,
      referenceRange: fhirResource.referenceRange,
      interpretation: fhirResource.interpretation,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }
  }

  static toDiagnosticReport(fhirResource: DiagnosticReport, observations: ObservationEntity[]): DiagnosticReportEntity {
    const report: DiagnosticReportEntity = {
      id: fhirResource.id || '',
      identifier: fhirResource.identifier,
      code: fhirResource.code,
      result: fhirResource.result,
      conclusion: fhirResource.conclusion,
      effectiveDateTime: fhirResource.effectiveDateTime,
      status: fhirResource.status,
      issued: fhirResource.issued,
      category: fhirResource.category,
      conclusionCode: fhirResource.conclusionCode,
      imagingStudy: fhirResource.imagingStudy,
      note: fhirResource.note,
      presentedForm: fhirResource.presentedForm,
      encounter: fhirResource.encounter,
      performer: fhirResource.performer,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id
    }

    // Attach related observations with expansion of hasMember
    if (fhirResource.result && observations.length > 0) {
      const resultIds = fhirResource.result
        .map((ref: Reference) => ref.reference?.split('/').pop())
        .filter(Boolean)
      
      // Create a map of observations by ID for easy lookup
      const obsMap = new Map(observations.map(obs => [obs.id, obs]))
      
      // Get the actual observation objects
      const reportObservations = resultIds
        .map((id) => (id ? obsMap.get(id) : undefined))
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

  static toImagingStudy(fhirResource: ImagingStudy): ImagingStudyEntity {
    return {
      id: fhirResource.id || '',
      identifier: fhirResource.identifier,
      status: fhirResource.status,
      modality: fhirResource.modality,
      subject: fhirResource.subject,
      encounter: fhirResource.encounter,
      started: fhirResource.started,
      basedOn: fhirResource.basedOn,
      referrer: fhirResource.referrer,
      interpreter: fhirResource.interpreter,
      endpoint: fhirResource.endpoint,
      numberOfSeries: fhirResource.numberOfSeries,
      numberOfInstances: fhirResource.numberOfInstances,
      procedureReference: fhirResource.procedureReference,
      procedureCode: fhirResource.procedureCode,
      location: fhirResource.location,
      reasonCode: fhirResource.reasonCode,
      reasonReference: fhirResource.reasonReference,
      note: fhirResource.note,
      description: fhirResource.description,
      series: fhirResource.series,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id,
    }
  }

  static toProcedure(fhirResource: Procedure): ProcedureEntity {
    const src = fhirResource as Procedure & {
      performer?: ProcedureEntity['performer']
      note?: ProcedureEntity['note']
      reasonCode?: ProcedureEntity['reasonCode']
      partOf?: ProcedureEntity['partOf']
    }
    return {
      id: fhirResource.id || '',
      code: fhirResource.code,
      status: fhirResource.status,
      performedDateTime: fhirResource.performedDateTime,
      performedPeriod: fhirResource.performedPeriod,
      encounter: fhirResource.encounter,
      // Operating hospital + NHI diagnosis reason (bridge ≥0.18.14). Without
      // these the procedure row showed no performer / reason. ≥0.18.15 moves the
      // reason from a note to a structured (bilingual) reasonCode.
      performer: src.performer,
      note: src.note,
      reasonCode: src.reasonCode,
      // Same-session linkage (bridge ≥0.20.x) — drives the collapsible grouping
      // of secondary procedures under their lead in the reports UI.
      partOf: src.partOf,
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
      serviceType: fhirResource.serviceType,
      period: fhirResource.period,
      reasonCode: fhirResource.reasonCode,
      reasonReference: fhirResource.reasonReference,
      diagnosis: fhirResource.diagnosis,
      participant: fhirResource.participant,
      location: fhirResource.location,
      serviceProvider: fhirResource.serviceProvider,
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

  static toImmunization(fhirResource: any): ImmunizationEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      vaccineCode: fhirResource.vaccineCode,
      occurrenceDateTime: fhirResource.occurrenceDateTime,
      performer: fhirResource.performer,
      note: fhirResource.note,
      manufacturer: fhirResource.manufacturer,
      lotNumber: fhirResource.lotNumber,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id,
    }
  }

  static toConsent(fhirResource: any): ConsentEntity {
    // FHIR R4 Consent. `provision` may be a single object (R4) — keep the
    // first level only; nested sub-provisions aren't surfaced in the card.
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      scope: fhirResource.scope,
      category: fhirResource.category,
      dateTime: fhirResource.dateTime,
      provision: fhirResource.provision
        ? {
            type: fhirResource.provision.type,
            period: fhirResource.provision.period,
          }
        : undefined,
      sourceAttachment: fhirResource.sourceAttachment,
      organization: fhirResource.organization,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id,
    }
  }

  static toDevice(fhirResource: any): DeviceEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      type: fhirResource.type,
      manufacturer: fhirResource.manufacturer,
      modelNumber: fhirResource.modelNumber,
      serialNumber: fhirResource.serialNumber,
      udiCarrier: fhirResource.udiCarrier,
      deviceName: fhirResource.deviceName,
      manufactureDate: fhirResource.manufactureDate,
      expirationDate: fhirResource.expirationDate,
      owner: fhirResource.owner,
      note: fhirResource.note,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id,
    }
  }

  static toCarePlan(fhirResource: any): CarePlanEntity {
    return {
      id: fhirResource.id || '',
      status: fhirResource.status,
      intent: fhirResource.intent,
      category: fhirResource.category,
      title: fhirResource.title,
      description: fhirResource.description,
      period: fhirResource.period,
      created: fhirResource.created,
      addresses: fhirResource.addresses,
      activity: fhirResource.activity,
      note: fhirResource.note,
      author: fhirResource.author,
      sourceSystem: FHIR_SOURCE_SYSTEM,
      sourceId: fhirResource.id,
    }
  }
}

// Singleton instance for the mapper registry pattern
export const fhirDataMapper = new FhirMapper()

// Auto-register to the mapper registry
dataMapperRegistry.register(fhirDataMapper)
