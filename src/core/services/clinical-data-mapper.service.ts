// Clinical Data Mapper Service
// Abstracts the logic for transforming raw clinical data into ClinicalDataCollection
// Following Dependency Inversion Principle - depends on abstractions not concrete implementations

import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

/**
 * Service for mapping raw clinical data to standardized ClinicalDataCollection format
 * This abstraction allows for easier testing and future data source changes
 */
export class ClinicalDataMapper {
  /**
   * Transforms raw clinical data into ClinicalDataCollection
   * Handles fallback values and data normalization
   */
  static toClinicalDataCollection(data: any): ClinicalDataCollection {
    if (!data) {
      return this.getEmptyCollection()
    }

    return {
      conditions: data.conditions || [],
      medications: data.medications || [],
      allergies: data.allergies || [],
      diagnosticReports: data.diagnosticReports || [],
      observations: data.observations || data.vitalSigns || data.vitals || [],
      vitalSigns: data.vitalSigns || data.vitals || [],
      procedures: data.procedures || [],
      encounters: data.encounters || []
    }
  }

  /**
   * Returns an empty ClinicalDataCollection
   * Useful for initialization and error states
   */
  static getEmptyCollection(): ClinicalDataCollection {
    return {
      conditions: [],
      medications: [],
      allergies: [],
      diagnosticReports: [],
      observations: [],
      vitalSigns: [],
      procedures: [],
      encounters: []
    }
  }

  /**
   * Validates if clinical data has required fields
   */
  static isValid(data: any): boolean {
    return data !== null && data !== undefined && typeof data === 'object'
  }

  /**
   * Checks if clinical data collection has any data
   */
  static hasData(collection: ClinicalDataCollection): boolean {
    return (
      collection.conditions.length > 0 ||
      collection.medications.length > 0 ||
      collection.allergies.length > 0 ||
      collection.diagnosticReports.length > 0 ||
      collection.observations.length > 0 ||
      collection.vitalSigns.length > 0 ||
      collection.procedures.length > 0 ||
      collection.encounters.length > 0
    )
  }
}
