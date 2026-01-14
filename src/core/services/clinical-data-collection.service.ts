// Clinical Data Collection Service
// Provides utility methods for working with ClinicalDataCollection
// Following Dependency Inversion Principle - depends on abstractions not concrete implementations

import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

/**
 * ClinicalDataCollectionService - 臨床資料集合服務
 * 
 * 提供 ClinicalDataCollection 的工具方法：
 * - 建立空集合
 * - 驗證資料
 * - 檢查是否有資料
 * 
 * 注意：這不是 Mapper，不做資料轉換
 * - FhirMapper: 將 FHIR 資源轉換為 Domain Entity
 * - Repository: 從 Server 取得資料
 * - 這個 Service: 提供 Collection 的工具方法
 */
export class ClinicalDataCollectionService {
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
      encounters: data.encounters || [],
      documentReferences: data.documentReferences || [],
      compositions: data.compositions || []
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
      encounters: [],
      documentReferences: [],
      compositions: []
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
      collection.encounters.length > 0 ||
      collection.documentReferences.length > 0 ||
      collection.compositions.length > 0
    )
  }
}
