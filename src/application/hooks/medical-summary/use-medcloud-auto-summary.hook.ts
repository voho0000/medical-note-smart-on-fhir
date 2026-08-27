'use client'

import { useEffect } from 'react'
import { useMedcloudLaunchStore } from '@/src/application/launch/medcloud-launch.store'

interface UseMedcloudAutoSummaryOptions {
  hasPatient: boolean
  summaryModelId: string | null
  dataReady: boolean
  isGenerating: boolean
  isRestoring: boolean
  modelId: string
  generate: () => Promise<void>
}

/** Claim and run each successfully received Extension launch exactly once.
 * Keeping the request in a small in-memory store lets it safely arrive before
 * the lazy Medical Summary feature or the complete FHIR dataset is ready. */
export function useMedcloudAutoSummary({
  hasPatient,
  summaryModelId,
  dataReady,
  isGenerating,
  isRestoring,
  modelId,
  generate,
}: UseMedcloudAutoSummaryOptions): void {
  const request = useMedcloudLaunchStore((state) => state.pendingSummary)
  const claimSummary = useMedcloudLaunchStore((state) => state.claimSummary)

  useEffect(() => {
    if (
      !request ||
      !hasPatient ||
      !dataReady ||
      isRestoring ||
      modelId !== request.modelId
    ) return
    if (summaryModelId === request.modelId) {
      claimSummary(request.messageId)
      return
    }
    if (isGenerating) return
    if (!claimSummary(request.messageId)) return
    void generate().catch(() => undefined)
  }, [
    claimSummary,
    dataReady,
    generate,
    hasPatient,
    isGenerating,
    isRestoring,
    modelId,
    request,
    summaryModelId,
  ])
}
