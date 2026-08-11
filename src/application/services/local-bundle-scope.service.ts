import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

/**
 * Application-layer view of the patient import owned by this browser tab.
 * Feature code uses this facade so tab ownership does not leak persistence
 * details across the feature/infrastructure boundary.
 */
export function getActiveLocalBundleImportId(): string | null {
  return LocalBundleService.getActiveImportId()
}
