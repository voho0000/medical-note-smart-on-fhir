/// <reference lib="webworker" />

import {
  SDK_JSON_PACKAGE_VERSION,
  convertSdkJsonToFhir,
  parseJsonBytes,
  type SdkConversionReport,
} from '@/vendor/nhi-fhir-bridge-sdk-json/browser.js'
import type { ClinicalSourceMetadata } from '@/src/core/entities/clinical-data.entity'
import type { PreparedLocalImport } from '../services/local-import-file.service'

declare const self: DedicatedWorkerGlobalScope
const MAX_SDK_IMPORT_BYTES = 32 * 1024 * 1024

function isFhirBundle(value: unknown): value is Record<string, unknown> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { resourceType?: unknown }).resourceType === 'Bundle'
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

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer }>) => {
  try {
    const parsed = parseJsonBytes(event.data.bytes)
    let result: PreparedLocalImport
    if (isFhirBundle(parsed)) {
      result = { bundle: parsed }
    } else {
      if (event.data.bytes.byteLength > MAX_SDK_IMPORT_BYTES) {
        throw new Error('SDK JSON exceeds the 32 MB conversion limit')
      }
      const converted = convertSdkJsonToFhir(parsed, { identifierMode: 'masked' })
      result = {
        bundle: converted.bundle,
        sourceMetadata: sdkMetadata(converted.report, converted.bundle),
      }
    }
    self.postMessage({ ok: true, result })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown conversion error'
    self.postMessage({
      ok: false,
      error: `不支援的資料格式；請選擇 FHIR Bundle 或健康存摺 SDK JSON。(${detail})`,
    })
  }
}

export {}
