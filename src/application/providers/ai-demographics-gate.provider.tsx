"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAiDataSource } from '@/src/application/hooks/ai-generation/ai-data-source'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { useLocalPatientProfile } from '@/src/application/hooks/patient/use-local-patient-profile.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import type {
  PatientEntity,
  UserEnteredPatientProfile,
} from '@/src/core/entities/patient.entity'
import {
  applyUserEnteredPatientProfile,
  createUserEnteredPatientProfile,
  isValidPatientBirthDate,
} from '@/src/core/entities/patient.entity'

interface AiDemographicsGateValue {
  /** False when the loaded patient still lacks valid sex or birth year/date. */
  demographicsReadyForAi: boolean
  /** Opens the required profile editor when needed and resolves after save/cancel. */
  requestDemographicsForAi: () => Promise<boolean>
  dialog: {
    open: boolean
    importId: string | null
    profile: UserEnteredPatientProfile | null
    saving: boolean
    close: () => void
    save: (profile: UserEnteredPatientProfile | null) => Promise<void>
  }
}

const DEFAULT_GATE: AiDemographicsGateValue = {
  demographicsReadyForAi: true,
  requestDemographicsForAi: async () => true,
  dialog: {
    open: false,
    importId: null,
    profile: null,
    saving: false,
    close: () => undefined,
    save: async () => undefined,
  },
}

const AiDemographicsGateContext =
  createContext<AiDemographicsGateValue>(DEFAULT_GATE)

export function hasAiReadyPatientDemographics(
  patient: Pick<PatientEntity, 'gender' | 'birthDate'> | null,
  profile: UserEnteredPatientProfile | null,
): boolean {
  const gender = profile?.gender ?? patient?.gender
  const birthDate = profile?.birthDate ?? patient?.birthDate
  return Boolean(
    (gender === 'male' || gender === 'female' || gender === 'other')
    && birthDate
    && isValidPatientBirthDate(birthDate),
  )
}

export function AiDemographicsGateProvider({
  children,
}: {
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const { patient } = usePatient()
  const dataSource = useAiDataSource()
  const medcloudAutoLaunch = isMedcloudLaunchRoute()
  // The persisted auto-generate switch is the only trigger for a background
  // run, so it is also what decides whether missing demographics are blocking.
  const autoGenerateEnabled = useSummaryPrefsStore((s) => s.autoGenerate)
  const isLocalBundle =
    dataSource.source === 'local' || dataSource.source === 'demo'
  const localProfile = useLocalPatientProfile(isLocalBundle)
  const scopeId = localProfile.importId
    ?? (patient ? `${dataSource.source}:${patient.id}` : null)
  const [sessionProfileState, setSessionProfileState] = useState<{
    scopeId: string
    profile: UserEnteredPatientProfile
  } | null>(null)
  const sessionProfile = scopeId && sessionProfileState?.scopeId === scopeId
    ? sessionProfileState.profile
    : null
  const effectiveProfile = localProfile.available
    ? localProfile.profile
    : sessionProfile
  // The controlled one-click route must stay question-free. Missing
  // structured demographics remain missing in the generated context; this
  // bypass does not invent or persist patient fields.
  const demographicsReadyForAi = medcloudAutoLaunch ||
    !patient || hasAiReadyPatientDemographics(patient, effectiveProfile)
  const editorProfile = useMemo<UserEnteredPatientProfile | null>(() => {
    const sourceGender =
      patient?.gender === 'male'
      || patient?.gender === 'female'
      || patient?.gender === 'other'
        ? patient.gender
        : undefined
    const sourceBirthDate =
      patient?.birthDate && isValidPatientBirthDate(patient.birthDate)
        ? patient.birthDate
        : undefined
    const name = effectiveProfile?.name
    const gender = effectiveProfile?.gender ?? sourceGender
    const birthDate = effectiveProfile?.birthDate ?? sourceBirthDate
    if (!name && !gender && !birthDate) return null
    return {
      source: 'user-entered',
      ...(name ? { name } : {}),
      ...(gender ? { gender } : {}),
      ...(birthDate ? { birthDate } : {}),
      updatedAt:
        effectiveProfile?.updatedAt ?? '1970-01-01T00:00:00.000Z',
    }
  }, [effectiveProfile, patient])
  const [dialogScopeId, setDialogScopeId] = useState<string | null>(null)
  const [autoDismissedScopeId, setAutoDismissedScopeId] =
    useState<string | null>(null)
  const pendingRequestRef = useRef<{
    promise: Promise<boolean>
    resolve: (accepted: boolean) => void
    scopeId: string
  } | null>(null)

  const settlePendingRequest = useCallback((accepted: boolean) => {
    const pending = pendingRequestRef.current
    pendingRequestRef.current = null
    pending?.resolve(accepted)
  }, [])

  const requestDemographicsForAi = useCallback((): Promise<boolean> => {
    if (demographicsReadyForAi) return Promise.resolve(true)
    if (!patient || !scopeId) return Promise.resolve(false)
    if (dataSource.source === 'local' && !localProfile.available) {
      return Promise.resolve(false)
    }
    if (pendingRequestRef.current) return pendingRequestRef.current.promise

    let resolveRequest!: (accepted: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
      resolveRequest = resolve
    })
    pendingRequestRef.current = {
      promise,
      resolve: resolveRequest,
      scopeId,
    }
    setDialogScopeId(scopeId)
    return promise
  }, [
    dataSource.source,
    demographicsReadyForAi,
    localProfile.available,
    patient,
    scopeId,
  ])

  const closeDialog = useCallback(() => {
    setDialogScopeId(null)
    setAutoDismissedScopeId(autoGenerateEnabled ? scopeId : null)
    settlePendingRequest(false)
  }, [autoGenerateEnabled, scopeId, settlePendingRequest])

  const saveRequiredProfile = useCallback(async (
    next: UserEnteredPatientProfile | null,
  ) => {
    if (!patient || !next || !hasAiReadyPatientDemographics(patient, next)) return
    const overlayProfile = createUserEnteredPatientProfile({
      name: next.name,
      gender:
        next.gender === patient.gender && !effectiveProfile?.gender
          ? undefined
          : next.gender,
      birthDate:
        next.birthDate === patient.birthDate && !effectiveProfile?.birthDate
          ? undefined
          : next.birthDate,
    })

    if (localProfile.available) {
      await localProfile.saveProfile(overlayProfile)
    } else if (scopeId && overlayProfile) {
      setSessionProfileState({ scopeId, profile: overlayProfile })
      queryClient.setQueryData<PatientEntity | null>(
        ['patient'],
        (current) => current
          ? applyUserEnteredPatientProfile(current, overlayProfile)
          : current,
      )
    }
    setDialogScopeId(null)
    settlePendingRequest(true)
  }, [
    effectiveProfile,
    localProfile,
    patient,
    queryClient,
    scopeId,
    settlePendingRequest,
  ])

  // Every patient/data scope gets its own decision. Never carry a cancelled
  // prompt or unresolved manual generation request into the next patient.
  useEffect(() => {
    const pending = pendingRequestRef.current
    if (pending && pending.scopeId !== scopeId) {
      settlePendingRequest(false)
    }
  }, [scopeId, settlePendingRequest])

  // Turning automatic summaries off resets a previous dismissal. If the user
  // later opts in again for the same import, the requirement is shown again.
  useEffect(() => {
    if (autoGenerateEnabled || autoDismissedScopeId !== scopeId) return
    const timer = window.setTimeout(() => {
      setAutoDismissedScopeId(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    autoGenerateEnabled,
    autoDismissedScopeId,
    scopeId,
  ])

  // With automatic generation switched on, prompt for any missing demographics
  // before either automatic summary pipeline is allowed to start.
  useEffect(() => {
    if (
      !autoGenerateEnabled ||
      // Background auto-run is disabled on the Medcloud route, so this prompt
      // there would be a modal with nothing waiting behind it.
      medcloudAutoLaunch ||
      demographicsReadyForAi ||
      !scopeId ||
      (dataSource.source === 'local' && !localProfile.available) ||
      autoDismissedScopeId === scopeId
    ) return
    const timer = window.setTimeout(() => {
      void requestDemographicsForAi()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    autoGenerateEnabled,
    autoDismissedScopeId,
    dataSource.source,
    demographicsReadyForAi,
    localProfile.available,
    medcloudAutoLaunch,
    requestDemographicsForAi,
    scopeId,
  ])

  useEffect(() => () => settlePendingRequest(false), [settlePendingRequest])

  const value = useMemo<AiDemographicsGateValue>(() => ({
    demographicsReadyForAi,
    requestDemographicsForAi,
    dialog: {
      open:
        Boolean(scopeId) &&
        dialogScopeId === scopeId &&
        !demographicsReadyForAi,
      importId: scopeId,
      profile: editorProfile,
      saving: localProfile.saving,
      close: closeDialog,
      save: saveRequiredProfile,
    },
  }), [
    closeDialog,
    demographicsReadyForAi,
    dialogScopeId,
    editorProfile,
    localProfile.saving,
    requestDemographicsForAi,
    saveRequiredProfile,
    scopeId,
  ])

  return (
    <AiDemographicsGateContext.Provider value={value}>
      {children}
    </AiDemographicsGateContext.Provider>
  )
}

export function useAiDemographicsGate(): AiDemographicsGateValue {
  return useContext(AiDemographicsGateContext)
}
