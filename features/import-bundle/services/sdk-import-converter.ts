import {
  SDK_JSON_PACKAGE_VERSION,
  convertSdkJsonToFhir,
  parseJsonBytes,
  type SdkConversionReport,
} from '@/vendor/nhi-fhir-bridge-sdk-json/browser.js'
import type { ClinicalSourceMetadata } from '@/src/core/entities/clinical-data.entity'
import { HEALTH_BANK_SDK_SECTION_SYSTEM } from '@/src/shared/utils/report-grouping-helpers'

const MAX_SDK_IMPORT_BYTES = 32 * 1024 * 1024

export interface PreparedLocalImport {
  bundle: Record<string, unknown>
  sourceMetadata?: ClinicalSourceMetadata
}

function isFhirBundle(value: unknown): value is Record<string, unknown> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { resourceType?: unknown }).resourceType === 'Bundle'
}

function preserveR8SourceSection(bundle: Record<string, unknown>): void {
  const entries = Array.isArray(bundle.entry) ? bundle.entry : []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const resource = (entry as { resource?: unknown }).resource
    if (!resource || typeof resource !== 'object') continue
    const report = resource as {
      resourceType?: unknown
      category?: unknown
    }
    if (report.resourceType !== 'DiagnosticReport') continue

    // In the SDK converter, r7 DiagnosticReports are laboratory reports; every
    // non-laboratory DiagnosticReport comes from r8. Preserve any useful
    // bridge classification such as PAT, then append the source-section marker
    // rather than inventing RAD when the official SDK section is ambiguous.
    const categories = Array.isArray(report.category)
      ? report.category
      : report.category ? [report.category] : []
    const categoryCodings = categories.flatMap((category) => {
      if (!category || typeof category !== 'object') return []
      const coding = (category as { coding?: unknown }).coding
      return Array.isArray(coding) ? coding : []
    })
    const isLaboratory = categoryCodings.some((coding) => {
      if (!coding || typeof coding !== 'object') return false
      const value = coding as { system?: unknown; code?: unknown }
      const system = typeof value.system === 'string' ? value.system.toLowerCase() : ''
      const code = typeof value.code === 'string' ? value.code.toLowerCase() : ''
      return (system.includes('v2-0074') && ['lab', 'hm', 'ch', 'mb'].includes(code))
        || code === 'laboratory'
    })
    if (isLaboratory) continue
    const hasR8Marker = categoryCodings.some((coding) => {
      if (!coding || typeof coding !== 'object') return false
      const value = coding as { system?: unknown; code?: unknown }
      return value.system === HEALTH_BANK_SDK_SECTION_SYSTEM && value.code === 'r8'
    })
    if (hasR8Marker) continue
    report.category = [...categories, {
      coding: [{
        system: HEALTH_BANK_SDK_SECTION_SYSTEM,
        code: 'r8',
        display: 'Imaging or pathology report',
      }],
      text: '影像或病理檢查報告',
    }]
  }
}

function sdkMetadata(
  report: SdkConversionReport,
  bundle: Record<string, unknown>,
): ClinicalSourceMetadata {
  return {
    source: 'health-bank-sdk-json',
    convertedAt: typeof bundle.timestamp === 'string'
      ? bundle.timestamp
      : new Date().toISOString(),
    converterVersion: SDK_JSON_PACKAGE_VERSION,
    resourceCounts: report.resourceCounts,
    warnings: report.warnings.map(({ code, count }) => ({
      code,
      ...(typeof count === 'number' ? { count } : {}),
    })),
    labDuplicateMerge: report.labDuplicateMerge,
    unitInference: {
      policyVersion: report.unitInference.policyVersion,
      inferredCount: report.unitInference.inferredCount,
      unitlessCount: report.unitInference.unitlessCount,
      unresolvedCount: report.unitInference.unresolvedCount,
    },
    sourceCapabilities: report.sourceCapabilities.map(({ key, availability }) => ({
      key,
      availability,
    })),
  }
}

export function convertLocalImportBytes(bytes: ArrayBuffer): PreparedLocalImport {
  const parsed = parseJsonBytes(bytes)
  if (isFhirBundle(parsed)) return { bundle: parsed }

  if (bytes.byteLength > MAX_SDK_IMPORT_BYTES) {
    throw new Error('SDK JSON exceeds the 32 MB conversion limit')
  }
  const converted = convertSdkJsonToFhir(parsed, { identifierMode: 'masked' })
  preserveR8SourceSection(converted.bundle)
  return {
    bundle: converted.bundle,
    sourceMetadata: sdkMetadata(converted.report, converted.bundle),
  }
}
