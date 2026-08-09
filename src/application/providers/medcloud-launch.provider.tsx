'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  createVghtpeTvghbrainRuntimeProfile,
  isVghtpeMedcloudLaunchUrl,
  MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
  parseMedcloudLaunchContext,
  type MedcloudLaunchContext,
  VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
  VGTPE_TVGHBRAIN_PROFILE_ID,
} from '@/src/application/launch/medcloud-launch-context'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { useModelPrefsStore } from '@/src/application/stores/model-prefs.store'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { useSafetyPrefsStore } from '@/src/application/stores/safety-prefs.store'

interface MedcloudLaunchProviderProps {
  children: ReactNode
  /** Test seam only; production always reads the current page URL. */
  launchHref?: string
}

const MAX_PROCESSED_MESSAGE_IDS = 32

export function MedcloudLaunchProvider({
  children,
  launchHref,
}: MedcloudLaunchProviderProps) {
  const credentialsHydrating = useAiConfigStore((state) => state.credentialsHydrating)
  const pendingContextRef = useRef<MedcloudLaunchContext | null>(null)
  const processedMessageIdsRef = useRef(new Set<string>())
  const resolvedLaunchHref = launchHref ?? (
    typeof window === 'undefined' ? '' : window.location.href
  )
  const launchOrigin = useMemo(() => {
    if (!isVghtpeMedcloudLaunchUrl(resolvedLaunchHref)) return null
    return new URL(resolvedLaunchHref).origin
  }, [resolvedLaunchHref])

  const acknowledge = useCallback((messageId: string) => {
    if (!launchOrigin || typeof window === 'undefined') return
    window.postMessage({
      source: 'mediprisma',
      type: MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
      version: 1,
      messageId,
    }, launchOrigin)
  }, [launchOrigin])

  const activate = useCallback((context: MedcloudLaunchContext) => {
    useAiConfigStore.getState().setRuntimeOpenAiCompatibleProfile(
      createVghtpeTvghbrainRuntimeProfile(context.credential),
    )

    // `medcloud2=auto` chooses the hospital model for every user-facing AI
    // surface but deliberately does not enable automatic generation. Existing
    // patient-data consent and manual/auto-run preferences remain authoritative.
    const modelId = VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID
    const modelPrefs = useModelPrefsStore.getState()
    modelPrefs.setModelFor('chat', modelId)
    modelPrefs.setModelFor('insights', modelId)
    useSummaryPrefsStore.getState().setModelId(modelId)
    useSafetyPrefsStore.getState().setModelId(modelId)

    const processed = processedMessageIdsRef.current
    processed.add(context.messageId)
    while (processed.size > MAX_PROCESSED_MESSAGE_IDS) {
      const oldest = processed.values().next().value as string | undefined
      if (!oldest) break
      processed.delete(oldest)
    }
    acknowledge(context.messageId)
  }, [acknowledge])

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
      activate(context)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [acknowledge, activate, credentialsHydrating, launchOrigin])

  useEffect(() => {
    if (credentialsHydrating || !launchOrigin) return
    const pending = pendingContextRef.current
    if (!pending) return
    pendingContextRef.current = null
    activate(pending)
  }, [activate, credentialsHydrating, launchOrigin])

  useEffect(() => {
    if (!launchOrigin) return
    const processedMessageIds = processedMessageIdsRef.current
    return () => {
      pendingContextRef.current = null
      processedMessageIds.clear()
      useAiConfigStore.getState().clearRuntimeOpenAiCompatibleProfile(
        VGTPE_TVGHBRAIN_PROFILE_ID,
      )
    }
  }, [launchOrigin])

  return children
}
