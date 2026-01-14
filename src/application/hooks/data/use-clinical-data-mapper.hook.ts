/**
 * Application Hook: Clinical Data Collection Service
 * 
 * Facade hook for clinical data collection utilities.
 * Isolates features from core service details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing services
 */

import { ClinicalDataCollectionService } from '@/src/core/services/clinical-data-collection.service'

export function useClinicalDataCollection() {
  // Return the static class reference (uses static methods)
  return ClinicalDataCollectionService
}

// Backward compatibility alias
export const useClinicalDataMapper = useClinicalDataCollection
