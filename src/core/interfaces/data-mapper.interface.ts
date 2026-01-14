// Data Mapper Interface
// Defines the contract for mapping from any data source to domain entities
// This allows supporting multiple hospital data formats (FHIR, HL7, custom APIs, etc.)

import type { ObservationEntity } from '../entities/observation.entity'
import type { DiagnosticReportEntity } from '../entities/diagnostic-report.entity'
import type { ProcedureEntity } from '../entities/procedure.entity'
import type { MedicationEntity } from '../entities/medication.entity'
import type { ConditionEntity } from '../entities/condition.entity'
import type { AllergyEntity } from '../entities/allergy.entity'

/**
 * Generic data mapper interface
 * Each hospital/data source should implement this interface
 */
export interface IDataMapper<TSourceType = any> {
  /**
   * Identifier for this mapper (e.g., 'fhir', 'vgh-custom', 'hospital-a')
   */
  readonly sourceType: string
  
  /**
   * Map source observation to domain entity
   */
  mapObservation(source: TSourceType): ObservationEntity
  
  /**
   * Map source diagnostic report to domain entity
   */
  mapDiagnosticReport(source: TSourceType): DiagnosticReportEntity
  
  /**
   * Map source procedure to domain entity
   */
  mapProcedure(source: TSourceType): ProcedureEntity
  
  /**
   * Map source medication to domain entity
   */
  mapMedication(source: TSourceType): MedicationEntity
  
  /**
   * Map source condition to domain entity
   */
  mapCondition(source: TSourceType): ConditionEntity
  
  /**
   * Map source allergy to domain entity
   */
  mapAllergy(source: TSourceType): AllergyEntity
}

/**
 * Mapper registry for managing multiple data source mappers
 */
export class DataMapperRegistry {
  private mappers = new Map<string, IDataMapper>()
  
  /**
   * Register a mapper for a specific data source
   */
  register(mapper: IDataMapper): void {
    this.mappers.set(mapper.sourceType, mapper)
  }
  
  /**
   * Get mapper for a specific data source
   */
  getMapper(sourceType: string): IDataMapper | undefined {
    return this.mappers.get(sourceType)
  }
  
  /**
   * Get all registered mappers
   */
  getAllMappers(): IDataMapper[] {
    return Array.from(this.mappers.values())
  }
}

// Singleton instance
export const dataMapperRegistry = new DataMapperRegistry()
