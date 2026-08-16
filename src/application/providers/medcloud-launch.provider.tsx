'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  createVghtpeTvghbrainRuntimeProfile,
  decryptVghtpeMedcloudCredential,
  isVghtpeMedcloudLaunchUrl,
  MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
  parseMedcloudLaunchContext,
  type MedcloudLaunchContext,
  VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
  VGTPE_TVGHBRAIN_PROFILE_ID,
} from '@/src/application/launch/medcloud-launch-context'
import { useMedcloudLaunchStore } from '@/src/application/launch/medcloud-launch.store'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import {
  MODEL_PREF_DEFAULTS,
  useModelPrefsStore,
} from '@/src/application/stores/model-prefs.store'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { useSafetyPrefsStore } from '@/src/application/stores/safety-prefs.store'
import { MEDICAL_SUMMARY_MODEL_ID } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { SAFETY_ALERTS_MODEL_ID } from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'

interface MedcloudLaunchProviderProps {
  children: ReactNode
  /** Test seam only; production always reads the current page URL. */
  launchHref?: string
}

const MAX_PROCESSED_MESSAGE_IDS = 32

/** A Medcloud model preference can outlive its runtime-only credential/profile
 * in persisted Zustand storage. Clear only that reserved profile id; ordinary
 * custom endpoints and user model choices remain untouched. */
function resetVghtpeRuntimeModelPreferences(): void {
  const modelPrefs = useModelPrefsStore.getState()
  if (modelPrefs.prefs.chat === VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID) {
    modelPrefs.setModelFor('chat', MODEL_PREF_DEFAULTS.chat)
  }
  if (modelPrefs.prefs.insights === VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID) {
    modelPrefs.setModelFor('insights', MODEL_PREF_DEFAULTS.insights)
  }

  const summaryPrefs = useSummaryPrefsStore.getState()
  if (summaryPrefs.modelId === VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID) {
    summaryPrefs.setModelId(MEDICAL_SUMMARY_MODEL_ID)
  }
  const safetyPrefs = useSafetyPrefsStore.getState()
  if (safetyPrefs.modelId === VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID) {
    safetyPrefs.setModelId(SAFETY_ALERTS_MODEL_ID)
  }
}

export function MedcloudLaunchProvider({
  children,
  launchHref,
}: MedcloudLaunchProviderProps) {
  const credentialsHydrating = useAiConfigStore((state) => state.credentialsHydrating)
  const chatModelId = useModelPrefsStore((state) => state.prefs.chat)
  const insightsModelId = useModelPrefsStore((state) => state.prefs.insights)
  const summaryModelId = useSummaryPrefsStore((state) => state.modelId)
  const safetyModelId = useSafetyPrefsStore((state) => state.modelId)
  const pendingContextRef = useRef<MedcloudLaunchContext | null>(null)
  const processedMessageIdsRef = useRef(new Set<string>())
  const processingMessageIdsRef = useRef(new Set<string>())
  const activationEpochRef = useRef(0)
  const resolvedLaunchHref = launchHref ?? (
    typeof window === 'undefined' ? '' : window.location.href
  )
  const launchOrigin = useMemo(() => {
    if (!isVghtpeMedcloudLaunchUrl(resolvedLaunchHref)) return null
    return new URL(resolvedLaunchHref).origin
  }, [resolvedLaunchHref])

  // Persist hydration can finish after this provider mounts. Watching all four
  // preferences makes a later non-parameter Extension launch recover as soon
  // as the stale runtime-only selection appears.
  useEffect(() => {
    if (launchOrigin) return
    resetVghtpeRuntimeModelPreferences()
  }, [chatModelId, insightsModelId, launchOrigin, safetyModelId, summaryModelId])

  const acknowledge = useCallback((messageId: string) => {
    if (!launchOrigin || typeof window === 'undefined') return
    window.postMessage({
      source: 'mediprisma',
      type: MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
      version: 1,
      messageId,
    }, launchOrigin)
  }, [launchOrigin])

  const activate = useCallback((context: MedcloudLaunchContext, apiKey: string) => {
    useAiConfigStore.getState().setRuntimeOpenAiCompatibleProfile(
      createVghtpeTvghbrainRuntimeProfile(apiKey),
    )

    // Select the runtime-only hospital connection everywhere first, then queue
    // one generation. The summary feature claims that delivery only after its
    // FHIR input and model/cache hydration are complete.
    const modelId = VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID
    const modelPrefs = useModelPrefsStore.getState()
    modelPrefs.setModelFor('chat', modelId)
    modelPrefs.setModelFor('insights', modelId)
    useSummaryPrefsStore.getState().setModelId(modelId)
    useSafetyPrefsStore.getState().setModelId(modelId)
    useMedcloudLaunchStore.getState().queueSummary(context.messageId)

    const processed = processedMessageIdsRef.current
    processed.add(context.messageId)
    while (processed.size > MAX_PROCESSED_MESSAGE_IDS) {
      const oldest = processed.values().next().value as string | undefined
      if (!oldest) break
      processed.delete(oldest)
    }
    acknowledge(context.messageId)
  }, [acknowledge])

  const processContext = useCallback(async (context: MedcloudLaunchContext) => {
    if (processedMessageIdsRef.current.has(context.messageId)) {
      acknowledge(context.messageId)
      return
    }
    const processing = processingMessageIdsRef.current
    if (processing.has(context.messageId)) return
    processing.add(context.messageId)
    const activationEpoch = activationEpochRef.current
    try {
      const apiKey = await decryptVghtpeMedcloudCredential(context.credential)
      if (!apiKey || activationEpoch !== activationEpochRef.current) return
      activate(context, apiKey)
    } catch {
      // Fail closed without exposing the credential through an exception or
      // leaving a partially installed runtime connection behind.
      useMedcloudLaunchStore.getState().clear()
      useAiConfigStore.getState().clearRuntimeOpenAiCompatibleProfile(
        VGTPE_TVGHBRAIN_PROFILE_ID,
      )
      resetVghtpeRuntimeModelPreferences()
    } finally {
      processing.delete(context.messageId)
    }
  }, [acknowledge, activate])

  useEffect(() => {
    if (!launchOrigin || typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        event.origin !== launchOrigin
      ) return
      const context = parseMedcloudLaunchContext(event.data)
      if (!context) return
      if (processedMessageIdsRef.current.has(context.messageId)) {
        acknowledge(context.messageId)
        return
      }
      if (credentialsHydrating) {
        pendingContextRef.current = context
        return
      }
      void processContext(context)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [acknowledge, credentialsHydrating, launchOrigin, processContext])

  useEffect(() => {
    if (credentialsHydrating || !launchOrigin) return
    const pending = pendingContextRef.current
    if (!pending) return
    pendingContextRef.current = null
    void processContext(pending)
  }, [credentialsHydrating, launchOrigin, processContext])

  useEffect(() => {
    if (!launchOrigin) return
    const processedMessageIds = processedMessageIdsRef.current
    const processingMessageIds = processingMessageIdsRef.current
    const clearSensitiveLaunchState = () => {
      activationEpochRef.current += 1
      pendingContextRef.current = null
      processedMessageIds.clear()
      processingMessageIds.clear()
      useMedcloudLaunchStore.getState().clear()
      useAiConfigStore.getState().clearRuntimeOpenAiCompatibleProfile(
        VGTPE_TVGHBRAIN_PROFILE_ID,
      )
      resetVghtpeRuntimeModelPreferences()
    }
    window.addEventListener('pagehide', clearSensitiveLaunchState)
    return () => {
      window.removeEventListener('pagehide', clearSensitiveLaunchState)
      clearSensitiveLaunchState()
    }
  }, [launchOrigin])

  return children
}
