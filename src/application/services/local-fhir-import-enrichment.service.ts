import { enrichBundleWithNhiDrugTerminology } from '@/src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service'

/**
 * Application boundary for source-agnostic local FHIR enrichment.
 * Additional import enrichers can be composed here without coupling feature
 * code to concrete infrastructure services.
 */
export async function enrichLocalFhirImport(
  bundle: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await enrichBundleWithNhiDrugTerminology(bundle)
  return result.bundle
}
