// Example: Custom Hospital Data Mapper
// This is a template showing how to implement a mapper for a hospital with custom data format
// Replace this with actual implementation for each hospital

import type { IDataMapper } from '@/src/core/interfaces/data-mapper.interface'
import type { ObservationEntity } from '@/src/core/entities/observation.entity'
import type { DiagnosticReportEntity } from '@/src/core/entities/diagnostic-report.entity'
import type { ProcedureEntity } from '@/src/core/entities/procedure.entity'
import type { MedicationEntity } from '@/src/core/entities/medication.entity'
import type { ConditionEntity } from '@/src/core/entities/condition.entity'
import type { AllergyEntity } from '@/src/core/entities/allergy.entity'

// Example: Custom hospital data format
interface CustomHospitalObservation {
  obs_id: string
  obs_code: string
  obs_name: string
  obs_value: number | string
  obs_unit?: string
  obs_date: string
  obs_status: string
  // ... other custom fields
}

/**
 * Example Custom Hospital Data Mapper
 * Demonstrates how to implement a mapper for a hospital with non-FHIR format
 */
export class ExampleHospitalDataMapper implements IDataMapper<any> {
  readonly sourceType = 'example-hospital'
  
  mapObservation(source: CustomHospitalObservation): ObservationEntity {
    return {
      id: source.obs_id,
      code: source.obs_code,
      displayName: source.obs_name,
      status: this.mapStatus(source.obs_status),
      effectiveDate: new Date(source.obs_date),
      
      value: {
        value: source.obs_value,
        unit: source.obs_unit
      },
      
      sourceSystem: 'example-hospital',
      sourceId: source.obs_id
    }
  }
  
  mapDiagnosticReport(source: any): DiagnosticReportEntity {
    // Implement mapping logic for this hospital's report format
    return {
      id: source.id || '',
      code: source.code || '',
      displayName: source.name || 'Unknown',
      status: 'final',
      sourceSystem: 'example-hospital',
      sourceId: source.id
    }
  }
  
  mapProcedure(source: any): ProcedureEntity {
    // Implement mapping logic for this hospital's procedure format
    return {
      id: source.id || '',
      code: source.code || '',
      displayName: source.name || 'Unknown',
      status: 'completed',
      sourceSystem: 'example-hospital',
      sourceId: source.id
    }
  }
  
  mapMedication(source: any): MedicationEntity {
    // Implement mapping logic for this hospital's medication format
    return {
      id: source.id || '',
      code: source.code || '',
      displayName: source.name || 'Unknown',
      status: 'active',
      sourceSystem: 'example-hospital',
      sourceId: source.id
    }
  }
  
  mapCondition(source: any): ConditionEntity {
    // Implement mapping logic for this hospital's condition format
    return {
      id: source.id || '',
      code: source.code || '',
      displayName: source.name || 'Unknown',
      clinicalStatus: 'active',
      sourceSystem: 'example-hospital',
      sourceId: source.id
    }
  }
  
  mapAllergy(source: any): AllergyEntity {
    // Implement mapping logic for this hospital's allergy format
    return {
      id: source.id || '',
      code: source.code || '',
      displayName: source.name || 'Unknown',
      clinicalStatus: 'active',
      sourceSystem: 'example-hospital',
      sourceId: source.id
    }
  }
  
  // Helper method to map custom status to standard status
  private mapStatus(customStatus: string): string {
    const statusMap: Record<string, string> = {
      '完成': 'final',
      '進行中': 'preliminary',
      '已取消': 'cancelled',
      // Add more mappings as needed
    }
    return statusMap[customStatus] || 'unknown'
  }
}

// Usage example:
// import { dataMapperRegistry } from '@/src/core/interfaces/data-mapper.interface'
// import { ExampleHospitalDataMapper } from './example-hospital-data.mapper'
// 
// const exampleMapper = new ExampleHospitalDataMapper()
// dataMapperRegistry.register(exampleMapper)
