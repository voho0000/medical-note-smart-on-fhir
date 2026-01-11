/**
 * Application Hook: Clinical Data Mapper
 * 
 * Facade hook for mapping clinical data.
 * Isolates features from core service details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing services
 */

import { ClinicalDataMapper } from '@/src/core/services/clinical-data-mapper.service'

export function useClinicalDataMapper() {
  // Return the static class reference (ClinicalDataMapper uses static methods)
  return ClinicalDataMapper
}
