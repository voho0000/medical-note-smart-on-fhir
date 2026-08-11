"use client"

import { useCallback, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { UserEnteredPatientProfile } from '@/src/core/entities/patient.entity'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { serializeLocalBundleMutation } from '@/src/infrastructure/fhir/services/local-bundle-mutation-queue'
import { purgeAiResultCaches } from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  notifyBundleChangeSettled,
  notifyBundleChanged,
} from '@/src/shared/utils/reset-on-bundle-change'

interface LocalProfileState {
  importId: string
  profile: UserEnteredPatientProfile | null
}

const subscribeToClientReady = () => () => {}
const getClientReadySnapshot = () => true
const getServerReadySnapshot = () => false

export function useLocalPatientProfile(enabled?: boolean) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [savedState, setSavedState] = useState<LocalProfileState | null>(null)
  const clientReady = useSyncExternalStore(
    subscribeToClientReady,
    getClientReadySnapshot,
    getServerReadySnapshot,
  )
  const effectiveEnabled = clientReady && (enabled ?? shouldUseLocalBundle())
  const importId = effectiveEnabled ? LocalBundleService.getActiveImportId() : null
  const persistedProfile = effectiveEnabled
    ? LocalBundleService.getUserEnteredPatientProfile()
    : null
  const profile = importId && savedState?.importId === importId
    ? savedState.profile
    : persistedProfile

  const saveProfile = useCallback(async (
    next: UserEnteredPatientProfile | null,
  ) => {
    setSaving(true)
    try {
      await serializeLocalBundleMutation(async () => {
        await LocalBundleService.setUserEnteredPatientProfile(next)
        purgeAiResultCaches()
        notifyBundleChanged()
        try {
          await queryClient.invalidateQueries()
        } finally {
          notifyBundleChangeSettled()
        }
      })
      const activeImportId = LocalBundleService.getActiveImportId()
      if (activeImportId) {
        setSavedState({ importId: activeImportId, profile: next })
      }
    } finally {
      setSaving(false)
    }
  }, [queryClient])

  return {
    available: effectiveEnabled && Boolean(importId),
    importId,
    profile,
    saving,
    saveProfile,
  }
}
