export type SdkWarning = {
  code: string
  message: string
  group?: string
  path?: string
  count?: number
}

export type SdkSourceCapability = {
  key: string
  availability: 'provided' | 'not-provided' | 'not-distinguished' | 'embedded' | 'partial'
  sourceFields: string[]
  fhirImpact: string
}

export type SdkLabDuplicateMergeReport = {
  sourceCount: number
  convertedCount: number
  mergedCount: number
  conflictingValueGroupCount: number
}

export type SdkUnitInferenceReport = {
  policyVersion: string
  sourceQuantityCount: number
  sourceUnitCount: number
  inferredCount: number
  loincAdjustedCount: number
  mapperEvidenceCount: number
  fixedCount: number
  referenceRangeCount: number
  magnitudeCount: number
  unitlessCount: number
  unresolvedCount: number
  ambiguousScaleCount: number
  byLoinc: Record<string, {
    loinc: string
    inferred: number
    unitless: number
    unresolved: number
  }>
}

export type SdkConversionReport = {
  warnings: SdkWarning[]
  sourceCapabilities: readonly SdkSourceCapability[]
  resourceCounts: Record<string, number>
  entryCount: number
  labDuplicateMerge: SdkLabDuplicateMergeReport
  unitInference: SdkUnitInferenceReport
}

export type SdkConversionResult = {
  bundle: Record<string, unknown>
  report: SdkConversionReport
}

export const SDK_JSON_PACKAGE_VERSION: string
export function parseJsonBytes(input: ArrayBuffer | ArrayBufferView | string): unknown
export function convertSdkJsonToFhir(
  input: unknown,
  options?: {
    identifierMode?: 'source' | 'masked'
    timestamp?: string
    asOfDate?: string
    bridgeVersion?: string
  },
): SdkConversionResult
