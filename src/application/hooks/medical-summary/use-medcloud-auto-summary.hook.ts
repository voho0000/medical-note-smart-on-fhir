'use client'

import { useEffect } from 'react'
import { VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID } from '@/src/application/launch/medcloud-launch-context'
import { useMedcloudLaunchStore } from '@/src/application/launch/medcloud-launch.store'

interface UseMedcloudAutoSummaryOptions {
  hasPatient: boolean
  hasTvghbrainSummary: boolean
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
  hasTvghbrainSummary,
  dataReady,
  isGenerating,
  isRestoring,
  modelId,
  generate,
}: UseMedcloudAutoSummaryOptions): void {
  const messageId = useMedcloudLaunchStore((state) => state.pendingSummaryMessageId)
  const claimSummary = useMedcloudLaunchStore((state) => state.claimSummary)

  useEffect(() => {
    if (
      !messageId ||
      !hasPatient ||
      !dataReady ||
      isRestoring ||
      modelId !== VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID
    ) return
    if (hasTvghbrainSummary) {
      claimSummary(messageId)
      return
    }
    if (isGenerating) return
    if (!claimSummary(messageId)) return
    void generate().catch(() => undefined)
  }, [
    claimSummary,
    dataReady,
    generate,
    hasPatient,
    hasTvghbrainSummary,
    isGenerating,
    isRestoring,
    messageId,
    modelId,
  ])
}
