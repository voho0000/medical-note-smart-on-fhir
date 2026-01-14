// FHIR Data Mapper Implementation
// Maps FHIR R4 resources to domain entities

import type { IDataMapper } from '@/src/core/interfaces/data-mapper.interface'
import type { ObservationEntity } from '@/src/core/entities/observation.entity'
import type { DiagnosticReportEntity } from '@/src/core/entities/diagnostic-report.entity'
import type { ProcedureEntity } from '@/src/core/entities/procedure.entity'
import type { MedicationEntity } from '@/src/core/entities/medication.entity'
import type { ConditionEntity } from '@/src/core/entities/condition.entity'
import type { AllergyEntity } from '@/src/core/entities/allergy.entity'
import type * as FHIR from '@/src/shared/types/fhir.types'

/**
 * FHIR R4 Data Mapper
 * Converts FHIR resources to domain entities
 */
export class FhirDataMapper implements IDataMapper<any> {
  readonly sourceType = 'fhir'
  
  mapObservation(fhir: FHIR.Observation): ObservationEntity {
    return {
      id: fhir.id || '',
      code: fhir.code?.coding?.[0]?.code || '',
      displayName: fhir.code?.text || fhir.code?.coding?.[0]?.display || 'Unknown',
      category: this.extractCategories(fhir.category),
      status: fhir.status || 'unknown',
      effectiveDate: fhir.effectiveDateTime ? new Date(fhir.effectiveDateTime) : undefined,
      issuedDate: fhir.issued ? new Date(fhir.issued) : undefined,
      
      value: fhir.valueQuantity ? {
        value: fhir.valueQuantity.value || 0,
        unit: fhir.valueQuantity.unit
      } : fhir.valueString ? {
        value: fhir.valueString
      } : undefined,
      
      components: fhir.component?.map(comp => ({
        code: comp.code?.coding?.[0]?.code || '',
        displayName: comp.code?.text || comp.code?.coding?.[0]?.display,
        value: comp.valueQuantity ? {
          value: comp.valueQuantity.value || 0,
          unit: comp.valueQuantity.unit
        } : { value: comp.valueString || '' },
        interpretation: comp.interpretation?.text || comp.interpretation?.coding?.[0]?.display,
        referenceRange: comp.referenceRange?.[0] ? {
          low: comp.referenceRange[0].low?.value,
          high: comp.referenceRange[0].high?.value,
          text: comp.referenceRange[0].text
        } : undefined
      })),
      
      interpretation: fhir.interpretation?.text || fhir.interpretation?.coding?.[0]?.display,
      referenceRange: fhir.referenceRange?.[0] ? {
        low: fhir.referenceRange[0].low?.value,
        high: fhir.referenceRange[0].high?.value,
        text: fhir.referenceRange[0].text
      } : undefined,
      
      notes: fhir.note?.map(n => n.text).filter(Boolean) as string[],
      bodySite: fhir.bodySite?.text || fhir.bodySite?.coding?.[0]?.display,
      method: fhir.method?.text || fhir.method?.coding?.[0]?.display,
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  mapDiagnosticReport(fhir: FHIR.DiagnosticReport): DiagnosticReportEntity {
    const category = Array.isArray(fhir.category) ? fhir.category : fhir.category ? [fhir.category] : []
    
    return {
      id: fhir.id || '',
      code: fhir.code?.coding?.[0]?.code || '',
      displayName: fhir.code?.text || fhir.code?.coding?.[0]?.display || 'Unknown',
      category: this.extractCategories(category),
      status: fhir.status || 'unknown',
      effectiveDate: fhir.effectiveDateTime ? new Date(fhir.effectiveDateTime) : undefined,
      issuedDate: fhir.issued ? new Date(fhir.issued) : undefined,
      
      conclusion: fhir.conclusion,
      conclusionCodes: fhir.conclusionCode?.map(cc => cc.text || cc.coding?.[0]?.display || '').filter(Boolean),
      
      observationIds: fhir.result?.map(ref => ref.reference?.split('/').pop()).filter(Boolean) as string[],
      
      notes: fhir.note?.map(n => n.text).filter(Boolean) as string[],
      presentedForms: fhir.presentedForm?.map(form => ({
        contentType: form.contentType || '',
        title: form.title,
        data: form.data
      })),
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  mapProcedure(fhir: FHIR.Procedure): ProcedureEntity {
    return {
      id: fhir.id || '',
      code: fhir.code?.coding?.[0]?.code || '',
      displayName: fhir.code?.text || fhir.code?.coding?.[0]?.display || 'Unknown',
      category: fhir.category?.text || fhir.category?.coding?.[0]?.display,
      status: fhir.status || 'unknown',
      performedDate: fhir.performedDateTime ? new Date(fhir.performedDateTime) : undefined,
      performedPeriod: fhir.performedPeriod ? {
        start: fhir.performedPeriod.start ? new Date(fhir.performedPeriod.start) : undefined,
        end: fhir.performedPeriod.end ? new Date(fhir.performedPeriod.end) : undefined
      } : undefined,
      
      performers: fhir.performer?.map(p => 
        p.actor?.display || p.actor?.reference?.split('/').pop() || ''
      ).filter(Boolean),
      location: fhir.location?.display,
      reasonCodes: fhir.reasonCode?.map(rc => rc.text || rc.coding?.[0]?.display || '').filter(Boolean),
      bodySites: fhir.bodySite?.map(bs => bs.text || bs.coding?.[0]?.display || '').filter(Boolean),
      outcome: fhir.outcome?.text || fhir.outcome?.coding?.[0]?.display,
      
      followUp: fhir.followUp?.map(fu => fu.text || fu.coding?.[0]?.display || '').filter(Boolean),
      complications: fhir.complication?.map(c => c.text || c.coding?.[0]?.display || '').filter(Boolean),
      
      notes: fhir.note?.map(n => n.text).filter(Boolean) as string[],
      reportIds: fhir.report?.map(ref => ref.reference?.split('/').pop()).filter(Boolean) as string[],
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  mapMedication(fhir: FHIR.MedicationRequest): MedicationEntity {
    return {
      id: fhir.id || '',
      code: fhir.medicationCodeableConcept?.coding?.[0]?.code || '',
      displayName: fhir.medicationCodeableConcept?.text || fhir.medicationCodeableConcept?.coding?.[0]?.display || 'Unknown',
      status: fhir.status || 'unknown',
      authoredDate: fhir.authoredOn ? new Date(fhir.authoredOn) : undefined,
      effectiveDate: fhir.effectiveDateTime ? new Date(fhir.effectiveDateTime) : undefined,
      
      dosageInstructions: fhir.dosageInstruction?.map(di => ({
        text: di.text,
        timing: di.timing?.repeat ? {
          frequency: di.timing.repeat.frequency,
          period: di.timing.repeat.period,
          periodUnit: di.timing.repeat.periodUnit
        } : undefined,
        route: di.route?.text || di.route?.coding?.[0]?.display,
        doseQuantity: di.doseAndRate?.[0]?.doseQuantity ? {
          value: di.doseAndRate[0].doseQuantity.value || 0,
          unit: di.doseAndRate[0].doseQuantity.unit || ''
        } : undefined
      })),
      
      dispenseRequest: fhir.dispenseRequest ? {
        validityPeriod: fhir.dispenseRequest.validityPeriod ? {
          start: fhir.dispenseRequest.validityPeriod.start ? new Date(fhir.dispenseRequest.validityPeriod.start) : undefined,
          end: fhir.dispenseRequest.validityPeriod.end ? new Date(fhir.dispenseRequest.validityPeriod.end) : undefined
        } : undefined,
        expectedSupplyDuration: fhir.dispenseRequest.expectedSupplyDuration ? {
          value: fhir.dispenseRequest.expectedSupplyDuration.value || 0,
          unit: fhir.dispenseRequest.expectedSupplyDuration.unit || ''
        } : undefined
      } : undefined,
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  mapCondition(fhir: FHIR.Condition): ConditionEntity {
    const clinicalStatus = typeof fhir.clinicalStatus === 'string' 
      ? fhir.clinicalStatus 
      : fhir.clinicalStatus?.coding?.[0]?.code || 'unknown'
    
    const verificationStatus = typeof fhir.verificationStatus === 'string'
      ? fhir.verificationStatus
      : fhir.verificationStatus?.coding?.[0]?.code
    
    return {
      id: fhir.id || '',
      code: fhir.code?.coding?.[0]?.code || '',
      displayName: fhir.code?.text || fhir.code?.coding?.[0]?.display || 'Unknown',
      category: fhir.category?.map(c => c.text || c.coding?.[0]?.display || '').filter(Boolean),
      clinicalStatus,
      verificationStatus,
      severity: fhir.severity?.text || fhir.severity?.coding?.[0]?.display,
      
      onsetDate: fhir.onsetDateTime ? new Date(fhir.onsetDateTime) : undefined,
      abatementDate: fhir.abatementDateTime ? new Date(fhir.abatementDateTime) : undefined,
      recordedDate: fhir.recordedDate ? new Date(fhir.recordedDate) : undefined,
      
      bodySites: fhir.bodySite?.map(bs => bs.text || bs.coding?.[0]?.display || '').filter(Boolean),
      stage: fhir.stage?.[0]?.summary?.text || fhir.stage?.[0]?.summary?.coding?.[0]?.display,
      evidence: fhir.evidence?.flatMap(e => 
        e.code?.map(c => c.text || c.coding?.[0]?.display || '') || []
      ).filter(Boolean),
      
      notes: fhir.note?.map(n => n.text).filter(Boolean) as string[],
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  mapAllergy(fhir: FHIR.AllergyIntolerance): AllergyEntity {
    const clinicalStatus = fhir.clinicalStatus?.coding?.[0]?.code || 'unknown'
    const verificationStatus = fhir.verificationStatus?.coding?.[0]?.code
    
    return {
      id: fhir.id || '',
      code: fhir.code?.coding?.[0]?.code || '',
      displayName: fhir.code?.text || fhir.code?.coding?.[0]?.display || 'Unknown',
      type: fhir.type as 'allergy' | 'intolerance' | undefined,
      category: fhir.category,
      criticality: fhir.criticality as any,
      clinicalStatus,
      verificationStatus,
      
      onsetDate: fhir.onsetDateTime ? new Date(fhir.onsetDateTime) : undefined,
      recordedDate: fhir.recordedDate ? new Date(fhir.recordedDate) : undefined,
      lastOccurrence: fhir.lastOccurrence ? new Date(fhir.lastOccurrence) : undefined,
      
      reactions: fhir.reaction?.map(r => ({
        substance: r.substance?.text || r.substance?.coding?.[0]?.display,
        manifestations: r.manifestation?.map(m => m.text || m.coding?.[0]?.display || '').filter(Boolean) || [],
        description: r.description,
        onset: r.onset ? new Date(r.onset) : undefined,
        severity: r.severity as any,
        exposureRoute: r.exposureRoute?.text || r.exposureRoute?.coding?.[0]?.display
      })),
      
      notes: fhir.note?.map(n => n.text).filter(Boolean) as string[],
      
      sourceSystem: 'fhir',
      sourceId: fhir.id
    }
  }
  
  // Helper methods
  private extractCategories(categories?: FHIR.CodeableConcept[]): string[] {
    if (!categories) return []
    return categories
      .map(c => c.text || c.coding?.[0]?.display || c.coding?.[0]?.code || '')
      .filter(Boolean)
  }
}

// Create and export singleton instance
export const fhirDataMapper = new FhirDataMapper()
