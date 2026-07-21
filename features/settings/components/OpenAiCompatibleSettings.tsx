"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  testOpenAiCompatibleAgentCapability,
  testOpenAiCompatibleConnection,
} from '@/src/application/composition.ai'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { InfoHint } from '@/src/shared/components/InfoHint'
import type {
  OpenAiCompatibleAgentCapability,
  OpenAiCompatibleAgentMode,
  OpenAiCompatibleConfig,
  OpenAiCompatibleContextWindowSource,
  OpenAiCompatibleProfile,
} from '@/src/shared/types/openai-compatible.types'
import {
  createEmptyOpenAiCompatibleConfig,
  MAX_OPENAI_COMPATIBLE_PROFILES,
  MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  normalizeOpenAiCompatibleAgentCapability,
  normalizeOpenAiCompatibleAgentCapabilityTestedAt,
  normalizeOpenAiCompatibleAgentMode,
  normalizeOpenAiCompatibleContextWindow,
  normalizeOpenAiCompatibleContextWindowSource,
  normalizeOpenAiCompatibleTransport,
  suggestedOpenAiCompatibleContextWindow,
} from '@/src/shared/types/openai-compatible.types'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { isUsableApiKey } from '@/src/shared/utils/api-key.utils'
import {
  formatOpenAiCompatibleChatCompletionsUrl,
  normalizeOpenAiCompatibleBaseUrl,
  OpenAiCompatibleUrlError,
} from '@/src/shared/utils/openai-compatible.utils'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  isOpenAiCompatibleAddProfileTarget,
  isOpenAiCompatibleContextWindowTarget,
  type SettingsNavigationTarget,
} from '@/src/application/providers/right-panel.provider'

interface TestState {
  tone: 'success' | 'warning' | 'error'
  text: string
  detail?: string
}

interface PersistedAgentTestState {
  profileId: string
  capability: 'verified' | 'unsupported'
  testedAt: number
  state: TestState
}

const MAX_AGENT_TEST_REASON_LENGTH = 240

function conciseAgentTestReason(reason: string | undefined): string | undefined {
  const normalized = reason?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (normalized.length <= MAX_AGENT_TEST_REASON_LENGTH) return normalized
  return `${normalized.slice(0, MAX_AGENT_TEST_REASON_LENGTH - 1).trimEnd()}…`
}

const SECONDARY_ACTION_BUTTON_CLASS = cn(
  'h-8 flex-1 border-teal-200 bg-teal-50/60 text-teal-800 shadow-none',
  'hover:border-teal-300 hover:bg-teal-100/70 hover:text-teal-900',
  'focus-visible:border-teal-500 focus-visible:ring-teal-500/25',
  'dark:border-teal-800/80 dark:bg-teal-950/25 dark:text-teal-200',
  'dark:hover:border-teal-700 dark:hover:bg-teal-950/50 dark:hover:text-teal-100',
  'sm:min-w-32 sm:flex-none',
)

const PRIMARY_ACTION_BUTTON_CLASS = cn(
  'h-8 flex-1 bg-teal-600 text-white shadow-sm shadow-teal-600/15',
  'hover:bg-teal-700 hover:shadow-md hover:shadow-teal-600/20',
  'focus-visible:border-teal-500 focus-visible:ring-teal-500/30',
  'dark:bg-teal-500 dark:text-teal-950 dark:shadow-teal-950/30',
  'dark:hover:bg-teal-400 dark:hover:text-teal-950',
  'sm:min-w-32 sm:flex-none',
)

const ACTION_INFO_CLASS = cn(
  'h-8 w-8 shrink-0 hover:bg-teal-50 hover:text-teal-700',
  'dark:hover:bg-teal-950/40 dark:hover:text-teal-300',
)

const COMPACT_INPUT_CLASS = 'h-9 py-1.5 text-base sm:h-8 sm:py-1 sm:text-sm'

function initialContextWindowSource(
  config: OpenAiCompatibleConfig,
): OpenAiCompatibleContextWindowSource {
  return normalizeOpenAiCompatibleContextWindowSource(
    config.contextWindowSource,
    Boolean(config.baseUrl && config.modelId),
  )
}

function initialAgentCapability(
  config: OpenAiCompatibleConfig,
): OpenAiCompatibleAgentCapability {
  return normalizeOpenAiCompatibleAgentCapabilityTestedAt(
    config.agentCapabilityTestedAt,
  ) === null
    ? 'unknown'
    : normalizeOpenAiCompatibleAgentCapability(config.agentCapability)
}

function profileEndpointLabel(profile: OpenAiCompatibleProfile): string {
  if (profile.baseUrl.startsWith('/')) return profile.baseUrl
  try {
    const url = new URL(profile.baseUrl)
    const pathname = url.pathname.replace(/\/+$/, '')
    return `${url.host}${pathname && pathname !== '/' ? pathname : ''}`
  } catch {
    return profile.baseUrl
  }
}

function profileOptionLabel(
  profile: OpenAiCompatibleProfile,
  profiles: readonly OpenAiCompatibleProfile[],
): string {
  const endpoint = profileEndpointLabel(profile)
  const matching = profiles.filter((candidate) => (
    candidate.modelId === profile.modelId && profileEndpointLabel(candidate) === endpoint
  ))
  const ordinal = matching.findIndex((candidate) => candidate.profileId === profile.profileId) + 1
  return `${matching.length > 1 ? `#${ordinal} ` : ''}${profile.modelId} · ${endpoint}`
}

interface OpenAiCompatibleSettingsProps {
  /** The outer local-model accordion must be visible before focusing a target. */
  navigationReady?: boolean
  settingsTarget?: SettingsNavigationTarget | null
  onSettingsTargetHandled?: () => void
}

export function OpenAiCompatibleSettings({
  navigationReady = true,
  settingsTarget = null,
  onSettingsTargetHandled,
}: OpenAiCompatibleSettingsProps = {}) {
  const { t } = useLanguage()
  const profiles = useAiConfigStore((state) => state.openAiCompatibleProfiles)
  const credentialsHydrating = useAiConfigStore((state) => state.credentialsHydrating)
  const addConfig = useAiConfigStore((state) => state.addOpenAiCompatibleConfig)
  const updateConfig = useAiConfigStore((state) => state.updateOpenAiCompatibleConfig)
  const setProfileEnabled = useAiConfigStore(
    (state) => state.setOpenAiCompatibleProfileEnabled,
  )
  const deleteConfig = useAiConfigStore((state) => state.deleteOpenAiCompatibleConfig)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    () => profiles[0]?.profileId ?? null,
  )
  const [creatingNew, setCreatingNew] = useState(() => profiles.length === 0)
  const newProfileRequestedRef = useRef(false)
  const addProfileTargetHandledRef = useRef(false)
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.profileId === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  )
  const saved = useMemo<OpenAiCompatibleConfig>(
    () => selectedProfile ?? createEmptyOpenAiCompatibleConfig(),
    [selectedProfile],
  )
  const savedEndpointUrl = formatOpenAiCompatibleChatCompletionsUrl(saved.baseUrl)
  const [baseUrl, setBaseUrl] = useState(savedEndpointUrl)
  const [modelId, setModelId] = useState(saved.modelId)
  const [contextWindowTokens, setContextWindowTokens] = useState(String(
    normalizeOpenAiCompatibleContextWindow(saved.contextWindowTokens, saved.modelId),
  ))
  const [contextWindowSource, setContextWindowSource] = useState<OpenAiCompatibleContextWindowSource>(
    initialContextWindowSource(saved),
  )
  const [detectedContextWindowTokens, setDetectedContextWindowTokens] = useState<number | null>(
    null,
  )
  const [apiKey, setApiKey] = useState(saved.apiKey ?? '')
  const [transport, setTransport] = useState(normalizeOpenAiCompatibleTransport(saved.transport))
  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [agentTesting, setAgentTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [agentTestState, setAgentTestState] = useState<TestState | null>(null)
  const [connectionTestPassed, setConnectionTestPassed] = useState(false)
  const [agentMode, setAgentMode] = useState<OpenAiCompatibleAgentMode>(
    normalizeOpenAiCompatibleAgentMode(saved.agentMode),
  )
  // An explicit standard-chat policy belongs to the exact connection identity.
  // When endpoint/model/transport/key changes we reset to auto; this flag lets
  // the store distinguish a policy the user deliberately selected again for the
  // edited draft from a stale mode carried over by an older caller.
  const [agentModeConfirmedForDraft, setAgentModeConfirmedForDraft] = useState(false)
  const [agentCapability, setAgentCapability] = useState<OpenAiCompatibleAgentCapability>(
    initialAgentCapability(saved),
  )
  const [agentCapabilityTestedAt, setAgentCapabilityTestedAt] = useState<number | null>(
    normalizeOpenAiCompatibleAgentCapabilityTestedAt(saved.agentCapabilityTestedAt),
  )
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const testRequestId = useRef(0)
  const agentTestRequestId = useRef(0)
  const persistedAgentTestStateRef = useRef<PersistedAgentTestState | null>(null)
  const busy = testing || agentTesting || saving || credentialsHydrating
  const targetProfileId = settingsTarget && typeof settingsTarget === 'object'
    ? settingsTarget.profileId
    : undefined

  useEffect(() => {
    if (credentialsHydrating || (creatingNew && newProfileRequestedRef.current)) return
    if (selectedProfileId && profiles.some((profile) => (
      profile.profileId === selectedProfileId
    ))) return
    // Hydration and deletion can replace the available profile list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProfileId(profiles[0]?.profileId ?? null)
    setCreatingNew(profiles.length === 0)
  }, [creatingNew, credentialsHydrating, profiles, selectedProfileId])

  useEffect(() => {
    if (
      !navigationReady ||
      !isOpenAiCompatibleContextWindowTarget(settingsTarget)
    ) return
    if (
      targetProfileId &&
      targetProfileId !== selectedProfileId &&
      profiles.some((profile) => profile.profileId === targetProfileId)
    ) {
      // External navigation identifies the model whose overflow warning the
      // user acted on; reveal that profile rather than whichever was last edited.
      newProfileRequestedRef.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreatingNew(false)
      setSelectedProfileId(targetProfileId)
    }
  }, [navigationReady, profiles, selectedProfileId, settingsTarget, targetProfileId])

  useEffect(() => {
    if (
      !navigationReady ||
      !isOpenAiCompatibleContextWindowTarget(settingsTarget)
    ) return
    if (targetProfileId && targetProfileId !== selectedProfileId) return

    const input = document.getElementById('openai-compatible-context-window')
    if (!(input instanceof HTMLInputElement)) return
    input.scrollIntoView?.({ block: 'center' })
    input.focus({ preventScroll: true })
    onSettingsTargetHandled?.()
  }, [
    navigationReady,
    onSettingsTargetHandled,
    selectedProfileId,
    settingsTarget,
    targetProfileId,
  ])

  useEffect(() => {
    testRequestId.current += 1
    agentTestRequestId.current += 1
    const persistedAgentTestState = persistedAgentTestStateRef.current
    persistedAgentTestStateRef.current = null
    const shouldKeepPersistedAgentTestState = Boolean(
      persistedAgentTestState &&
      selectedProfile?.profileId === persistedAgentTestState.profileId &&
      initialAgentCapability(saved) === persistedAgentTestState.capability &&
      normalizeOpenAiCompatibleAgentCapabilityTestedAt(
        saved.agentCapabilityTestedAt,
      ) === persistedAgentTestState.testedAt,
    )
    // The encrypted profile rehydrates asynchronously from the selected
    // browser storage, so the editable draft must follow that external store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseUrl(formatOpenAiCompatibleChatCompletionsUrl(saved.baseUrl))
    setModelId(saved.modelId)
    setContextWindowTokens(String(
      normalizeOpenAiCompatibleContextWindow(saved.contextWindowTokens, saved.modelId),
    ))
    setContextWindowSource(initialContextWindowSource(saved))
    setDetectedContextWindowTokens(null)
    setDiscoveredModels([])
    setTestState(null)
    setAgentTestState(
      shouldKeepPersistedAgentTestState ? persistedAgentTestState!.state : null,
    )
    setConnectionTestPassed(false)
    setAgentMode(normalizeOpenAiCompatibleAgentMode(saved.agentMode))
    setAgentModeConfirmedForDraft(false)
    setAgentCapability(initialAgentCapability(saved))
    setAgentCapabilityTestedAt(normalizeOpenAiCompatibleAgentCapabilityTestedAt(
      saved.agentCapabilityTestedAt,
    ))
    setApiKey(saved.apiKey ?? '')
    setTransport(normalizeOpenAiCompatibleTransport(saved.transport))
    setShowApiKey(false)
    setTesting(false)
    setAgentTesting(false)
  }, [saved, selectedProfile?.profileId])

  const modelOptionsId = 'openai-compatible-model-options'
  const draftChanged = useMemo(() => (
    baseUrl !== savedEndpointUrl ||
    modelId !== saved.modelId ||
    Number(contextWindowTokens) !== normalizeOpenAiCompatibleContextWindow(
      saved.contextWindowTokens,
      saved.modelId,
    ) ||
    contextWindowSource !== initialContextWindowSource(saved) ||
    apiKey !== (saved.apiKey ?? '') ||
    transport !== normalizeOpenAiCompatibleTransport(saved.transport) ||
    agentMode !== normalizeOpenAiCompatibleAgentMode(saved.agentMode) ||
    agentCapability !== initialAgentCapability(saved) ||
    agentCapabilityTestedAt !== normalizeOpenAiCompatibleAgentCapabilityTestedAt(
      saved.agentCapabilityTestedAt,
    )
  ), [
    agentCapability,
    agentCapabilityTestedAt,
    agentMode,
    apiKey,
    baseUrl,
    contextWindowSource,
    contextWindowTokens,
    modelId,
    saved,
    savedEndpointUrl,
    transport,
  ])

  const connectionDraftChanged = (
    baseUrl !== savedEndpointUrl ||
    modelId !== saved.modelId ||
    apiKey !== (saved.apiKey ?? '') ||
    transport !== normalizeOpenAiCompatibleTransport(saved.transport)
  )
  const connectionReadyToSave = (
    connectionTestPassed ||
    (!connectionDraftChanged && Boolean(saved.baseUrl && saved.modelId))
  )

  const invalidateAgentCapability = () => {
    agentTestRequestId.current += 1
    setAgentMode('auto')
    setAgentModeConfirmedForDraft(false)
    setAgentCapability('unknown')
    setAgentCapabilityTestedAt(null)
    setAgentTestState(null)
  }

  const normalizeDraft = (): OpenAiCompatibleConfig => {
    const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl)
    const normalizedTransport = normalizeOpenAiCompatibleTransport(transport)
    if (normalizedTransport === 'mediprisma-gateway') {
      if (!ENV_CONFIG.hasOpenAiCompatibleGateway) {
        throw new Error(t.settings.openAiCompatibleGatewayUnavailable)
      }
      if (!normalizedBaseUrl.startsWith('https://')) {
        throw new Error(t.settings.openAiCompatibleGatewayHttpsOnly)
      }
    }
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      normalizedBaseUrl.startsWith('http://')
    ) {
      throw new OpenAiCompatibleUrlError(
        'INSECURE_HTTP',
        t.settings.openAiCompatibleHttpsPageError,
      )
    }
    const normalizedModelId = modelId.trim()
    if (!normalizedModelId) throw new Error(t.settings.openAiCompatibleModelRequired)
    const normalizedContextWindow = Number(contextWindowTokens.replace(/,/g, '').trim())
    if (
      !Number.isInteger(normalizedContextWindow) ||
      normalizedContextWindow < MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW ||
      normalizedContextWindow > MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW
    ) {
      throw new Error(t.settings.openAiCompatibleContextWindowInvalid)
    }
    if (apiKey.trim() && !isUsableApiKey(apiKey)) {
      throw new Error(t.settings.invalidApiKey)
    }
    return {
      enabled: true,
      baseUrl: normalizedBaseUrl,
      modelId: normalizedModelId,
      apiKey: apiKey.trim() || null,
      transport: normalizedTransport,
      contextWindowTokens: normalizedContextWindow,
      contextWindowSource,
      agentMode,
      agentCapability,
      agentCapabilityTestedAt,
    }
  }

  const errorText = (error: unknown): string => {
    if (error instanceof OpenAiCompatibleUrlError) {
      const byCode: Partial<Record<typeof error.code, string>> = {
        EMPTY: t.settings.openAiCompatibleUrlRequired,
        INVALID_URL: t.settings.openAiCompatibleInvalidUrl,
        INVALID_PROTOCOL: t.settings.openAiCompatibleHttpsRequired,
        INSECURE_HTTP: t.settings.openAiCompatibleHttpsRequired,
        URL_CREDENTIALS: t.settings.openAiCompatibleNoUrlCredentials,
        URL_QUERY: t.settings.openAiCompatibleNoQuery,
        URL_FRAGMENT: t.settings.openAiCompatibleNoFragment,
      }
      return byCode[error.code] ?? error.message
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return t.settings.openAiCompatibleTimeout
    }
    return error instanceof Error ? error.message : t.settings.openAiCompatibleConnectionFailed
  }

  const isStaleOperation = (error: unknown) => (
    error instanceof Error && error.name === 'AbortError'
  )

  const confirmDiscardDraft = () => (
    !draftChanged || typeof window === 'undefined' ||
    window.confirm(t.settings.openAiCompatibleUnsavedConfirm)
  )

  const handleProfileSelection = (profileId: string) => {
    if (profileId === selectedProfileId || !confirmDiscardDraft()) return
    testRequestId.current += 1
    agentTestRequestId.current += 1
    newProfileRequestedRef.current = false
    setCreatingNew(false)
    setSelectedProfileId(profileId)
  }

  const handleAddProfile = () => {
    if (profiles.length >= MAX_OPENAI_COMPATIBLE_PROFILES) {
      toast.error(t.settings.openAiCompatibleProfileLimit)
      return
    }
    if (creatingNew || !confirmDiscardDraft()) return
    testRequestId.current += 1
    agentTestRequestId.current += 1
    newProfileRequestedRef.current = true
    setCreatingNew(true)
    setSelectedProfileId(null)
  }

  useEffect(() => {
    if (!isOpenAiCompatibleAddProfileTarget(settingsTarget)) {
      addProfileTargetHandledRef.current = false
      return
    }
    if (!navigationReady || addProfileTargetHandledRef.current) return
    addProfileTargetHandledRef.current = true

    if (profiles.length >= MAX_OPENAI_COMPATIBLE_PROFILES) {
      toast.error(t.settings.openAiCompatibleProfileLimit)
      onSettingsTargetHandled?.()
      return
    }
    if (
      !creatingNew &&
      draftChanged &&
      typeof window !== 'undefined' &&
      !window.confirm(t.settings.openAiCompatibleUnsavedConfirm)
    ) {
      onSettingsTargetHandled?.()
      return
    }
    if (!creatingNew) {
      testRequestId.current += 1
      newProfileRequestedRef.current = true
      // The target is a one-shot external navigation intent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreatingNew(true)
      setSelectedProfileId(null)
    }
    onSettingsTargetHandled?.()
  }, [
    creatingNew,
    draftChanged,
    navigationReady,
    onSettingsTargetHandled,
    profiles.length,
    settingsTarget,
    t.settings.openAiCompatibleProfileLimit,
    t.settings.openAiCompatibleUnsavedConfirm,
  ])

  const persistNormalizedDraft = async (
    next: OpenAiCompatibleConfig,
    agentTestStateToKeep: Omit<PersistedAgentTestState, 'profileId'> | null = null,
  ) => {
    const existingProfileId = selectedProfileId
    if (!existingProfileId) newProfileRequestedRef.current = true
    if (existingProfileId && agentTestStateToKeep) {
      persistedAgentTestStateRef.current = {
        profileId: existingProfileId,
        ...agentTestStateToKeep,
      }
    } else {
      persistedAgentTestStateRef.current = null
    }

    try {
      // Resolve only after the encrypted credential and profile are durably
      // written, so closing the page cannot race the API-key save.
      const profileId = existingProfileId
        ? (
            await updateConfig(existingProfileId, next, {
              confirmAgentModeForIdentityChange: agentModeConfirmedForDraft,
            }),
            existingProfileId
          )
        : await addConfig(next)
      if (!existingProfileId && agentTestStateToKeep) {
        persistedAgentTestStateRef.current = {
          profileId,
          ...agentTestStateToKeep,
        }
      }
      newProfileRequestedRef.current = false
      setCreatingNew(false)
      setSelectedProfileId(profileId)
      setBaseUrl(formatOpenAiCompatibleChatCompletionsUrl(next.baseUrl))
      setModelId(next.modelId)
      setContextWindowTokens(String(next.contextWindowTokens))
      setContextWindowSource(initialContextWindowSource(next))
      setApiKey(next.apiKey ?? '')
      setTransport(normalizeOpenAiCompatibleTransport(next.transport))
      setAgentMode(normalizeOpenAiCompatibleAgentMode(next.agentMode))
      setAgentModeConfirmedForDraft(false)
      setAgentCapability(initialAgentCapability(next))
      setAgentCapabilityTestedAt(normalizeOpenAiCompatibleAgentCapabilityTestedAt(
        next.agentCapabilityTestedAt,
      ))
      return profileId
    } catch (error) {
      persistedAgentTestStateRef.current = null
      throw error
    }
  }

  const handleSave = async () => {
    if (!connectionReadyToSave) {
      toast.error(t.settings.openAiCompatibleTestBeforeSave)
      return
    }

    let next: OpenAiCompatibleConfig
    try {
      next = normalizeDraft()
    } catch (error) {
      toast.error(errorText(error))
      return
    }

    testRequestId.current += 1
    setSaving(true)
    try {
      await persistNormalizedDraft(next)
      setTestState(null)
      setAgentTestState(null)
      toast.success(t.settings.openAiCompatibleSaved)
    } catch (error) {
      if (isStaleOperation(error)) return
      toast.error(t.settings.openAiCompatibleSecureSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const handleEnabledChange = async (enabled: boolean) => {
    if (!selectedProfileId || !confirmDiscardDraft()) return
    setSaving(true)
    try {
      await setProfileEnabled(selectedProfileId, enabled)
    } catch (error) {
      if (!isStaleOperation(error)) {
        toast.error(t.settings.openAiCompatibleSecureSaveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    const requestId = testRequestId.current + 1
    testRequestId.current = requestId
    setTesting(true)
    setTestState(null)
    setConnectionTestPassed(false)
    setDiscoveredModels([])
    setDetectedContextWindowTokens(null)
    try {
      const draft = normalizeDraft()
      const result = await testOpenAiCompatibleConnection(draft)
      if (requestId !== testRequestId.current) return
      setDiscoveredModels(result.models)
      setDetectedContextWindowTokens(result.detectedContextWindowTokens)
      if (result.detectedContextWindowTokens !== null) {
        if (contextWindowSource !== 'manual') {
          setContextWindowTokens(String(result.detectedContextWindowTokens))
          setContextWindowSource('detected')
        }
      }
      if (result.modelFound === false) {
        setConnectionTestPassed(false)
        setTestState({ tone: 'warning', text: t.settings.openAiCompatibleModelNotFound })
      } else {
        setConnectionTestPassed(true)
        const connectionText = result.usedChatProbe
          ? t.settings.openAiCompatibleProbeSuccess
          : t.settings.openAiCompatibleConnectionSuccess
        setTestState({
          tone: 'success',
          text: result.detectedContextWindowTokens === null
            ? `${connectionText} ${t.settings.openAiCompatibleContextWindowNotReported}`
            : connectionText,
        })
      }
    } catch (error) {
      if (requestId !== testRequestId.current) return
      setConnectionTestPassed(false)
      setTestState({
        tone: 'error',
        text: `${t.settings.openAiCompatibleConnectionFailed}: ${errorText(error)}`,
      })
    } finally {
      if (requestId === testRequestId.current) setTesting(false)
    }
  }

  const handleAgentCapabilityTest = async () => {
    if (!connectionReadyToSave) {
      toast.error(t.settings.openAiCompatibleAgentTestNeedsConnection)
      return
    }

    const requestId = agentTestRequestId.current + 1
    agentTestRequestId.current = requestId
    setAgentTesting(true)
    setAgentTestState(null)
    try {
      const testedDraft = normalizeDraft()
      const result = await testOpenAiCompatibleAgentCapability(testedDraft)
      if (requestId !== agentTestRequestId.current) return

      if (result.status === 'inconclusive') {
        setAgentTestState({
          tone: 'warning',
          text: t.settings.openAiCompatibleAgentTestInconclusive,
          detail: conciseAgentTestReason(result.reason),
        })
        return
      }

      const previousTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
        selectedProfile?.agentCapabilityTestedAt,
      )
      const now = Date.now()
      const testedAt = now === previousTestedAt ? now + 1 : now
      const resultState: TestState = result.status === 'verified'
        ? {
          tone: 'success',
          text: t.settings.openAiCompatibleAgentTestSuccess,
        }
        : {
          tone: 'warning',
          text: t.settings.openAiCompatibleAgentTestUnsupported,
          detail: conciseAgentTestReason(result.reason),
        }
      const next: OpenAiCompatibleConfig = {
        ...testedDraft,
        // Checking Agent support must not silently re-enable a profile that
        // the user deliberately disabled.
        enabled: selectedProfile?.enabled ?? true,
        agentCapability: result.status,
        agentCapabilityTestedAt: testedAt,
      }

      try {
        await persistNormalizedDraft(next, {
          capability: result.status,
          testedAt,
          state: resultState,
        })
        setTestState(null)
      } catch (error) {
        if (isStaleOperation(error)) return
        setAgentTestState({
          tone: 'error',
          text: t.settings.openAiCompatibleAgentTestSaveFailed,
        })
        toast.error(t.settings.openAiCompatibleSecureSaveFailed)
      }
    } catch {
      if (requestId !== agentTestRequestId.current) return
      setAgentTestState({
        tone: 'warning',
        text: t.settings.openAiCompatibleAgentTestInconclusive,
      })
    } finally {
      if (requestId === agentTestRequestId.current) setAgentTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedProfile) return
    const message = t.settings.openAiCompatibleDeleteConfirm.replace(
      '{model}',
      profileOptionLabel(selectedProfile, profiles),
    )
    if (typeof window !== 'undefined' && !window.confirm(message)) return

    testRequestId.current += 1
    agentTestRequestId.current += 1
    setTesting(false)
    setAgentTesting(false)
    setSaving(true)
    try {
      await deleteConfig(selectedProfile.profileId)
      const remaining = profiles.filter((profile) => (
        profile.profileId !== selectedProfile.profileId
      ))
      newProfileRequestedRef.current = remaining.length === 0
      setSelectedProfileId(remaining[0]?.profileId ?? null)
      setCreatingNew(remaining.length === 0)
      toast.success(t.settings.openAiCompatibleCleared)
    } catch (error) {
      if (!isStaleOperation(error)) {
        toast.error(t.settings.openAiCompatibleSecureSaveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/25 p-1.5">
        <Label htmlFor="openai-compatible-profile" className="sr-only">
          {t.settings.openAiCompatibleSelectProfile}
        </Label>
        <select
          id="openai-compatible-profile"
          value={selectedProfileId ?? ''}
          onChange={(event) => handleProfileSelection(event.target.value)}
          disabled={busy || profiles.length === 0}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:text-xs"
          aria-label={t.settings.openAiCompatibleSelectProfile}
        >
          {creatingNew && (
            <option value="">{t.settings.openAiCompatibleAddProfile}</option>
          )}
          {profiles.map((profile) => (
            <option key={profile.profileId} value={profile.profileId}>
              {profileOptionLabel(profile, profiles)}
            </option>
          ))}
        </select>
        <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
          {t.settings.openAiCompatibleProfileCount
            .replace('{count}', String(profiles.length))
            .replace('{max}', String(MAX_OPENAI_COMPATIBLE_PROFILES))}
        </span>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={handleAddProfile}
          disabled={busy || creatingNew || profiles.length >= MAX_OPENAI_COMPATIBLE_PROFILES}
          title={profiles.length >= MAX_OPENAI_COMPATIBLE_PROFILES
            ? t.settings.openAiCompatibleProfileLimit
            : t.settings.openAiCompatibleAddProfile}
          aria-label={t.settings.openAiCompatibleAddProfile}
          className="h-8 px-2"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{t.settings.openAiCompatibleAddProfile}</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          onClick={handleDelete}
          disabled={busy || !selectedProfile}
          aria-label={t.settings.openAiCompatibleClear}
          title={t.settings.openAiCompatibleClear}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="openai-compatible-base-url" className="text-xs">
              {t.settings.openAiCompatibleBaseUrl}
            </Label>
            <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
              <p className="text-xs">
                {transport === 'mediprisma-gateway'
                  ? t.settings.openAiCompatibleGatewayBaseUrlHint
                  : t.settings.openAiCompatibleBaseUrlHint}
              </p>
            </InfoHint>
          </div>
          <Input
            id="openai-compatible-base-url"
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value)
              setDetectedContextWindowTokens(null)
              setTestState(null)
              setConnectionTestPassed(false)
              invalidateAgentCapability()
            }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'https://openrouter.ai/api/v1/chat/completions'
              : 'https://llm.intra.example.org/v1/chat/completions'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            className={COMPACT_INPUT_CLASS}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="openai-compatible-model" className="text-xs">
            {t.settings.openAiCompatibleModelId}
          </Label>
          <Input
            id="openai-compatible-model"
            list={modelOptionsId}
            value={modelId}
            onChange={(event) => {
              const nextModelId = event.target.value
              setModelId(nextModelId)
              setDetectedContextWindowTokens(null)
              if (contextWindowSource !== 'manual') {
                setContextWindowTokens(String(
                  suggestedOpenAiCompatibleContextWindow(nextModelId),
                ))
                setContextWindowSource('suggested')
              }
              setTestState(null)
              setConnectionTestPassed(false)
              invalidateAgentCapability()
            }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'MODEL_NAME'
              : 'meta-llama/Llama-3.3-70B-Instruct'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            className={COMPACT_INPUT_CLASS}
          />
          <datalist id={modelOptionsId}>
            {discoveredModels.map((id) => <option key={id} value={id} />)}
          </datalist>
        </div>

        {!ENV_CONFIG.offlineMode && (
          <div className="space-y-1">
            <div className="grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <div className="flex shrink-0 items-center gap-1.5">
                <Label className="text-xs">{t.settings.openAiCompatibleTransport}</Label>
                <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
                  <p className="text-xs">
                    {transport === 'mediprisma-gateway'
                      ? t.settings.openAiCompatibleGatewayDescription
                      : t.settings.openAiCompatibleDirectDescription}
                  </p>
                </InfoHint>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-md border bg-muted/20 p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (transport === 'direct') return
                    setTransport('direct')
                    setDetectedContextWindowTokens(null)
                    setTestState(null)
                    setConnectionTestPassed(false)
                    invalidateAgentCapability()
                  }}
                  disabled={busy}
                  className={cn(
                    'flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                    transport === 'direct'
                      ? 'bg-background font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={transport === 'direct'}
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.settings.openAiCompatibleTransportDirect}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (transport === 'mediprisma-gateway') return
                    setTransport('mediprisma-gateway')
                    setDetectedContextWindowTokens(null)
                    setTestState(null)
                    setConnectionTestPassed(false)
                    invalidateAgentCapability()
                  }}
                  disabled={busy || !ENV_CONFIG.hasOpenAiCompatibleGateway}
                  className={cn(
                    'flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                    transport === 'mediprisma-gateway'
                      ? 'bg-background font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                    !ENV_CONFIG.hasOpenAiCompatibleGateway && 'cursor-not-allowed opacity-50',
                  )}
                  aria-pressed={transport === 'mediprisma-gateway'}
                  title={!ENV_CONFIG.hasOpenAiCompatibleGateway
                    ? t.settings.openAiCompatibleGatewayUnavailable
                    : undefined}
                >
                  <Cloud className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.settings.openAiCompatibleTransportGateway}</span>
                </button>
              </div>
              <p className={cn(
                'truncate text-[0.6875rem] leading-relaxed sm:col-start-2',
                transport === 'mediprisma-gateway'
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-muted-foreground',
              )} title={transport === 'mediprisma-gateway'
                ? t.settings.openAiCompatibleGatewayProvidersShort
                : t.settings.openAiCompatibleDirectStatus}>
                {transport === 'mediprisma-gateway'
                  ? t.settings.openAiCompatibleGatewayProvidersShort
                  : t.settings.openAiCompatibleDirectStatus}
              </p>
            </div>
          </div>
        )}

      </div>

      <div className="grid gap-2">
            <div className="grid gap-2">
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Label htmlFor="openai-compatible-context-window" className="text-xs">
                    {t.settings.openAiCompatibleContextWindow}
                  </Label>
                  <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
                    <p className="text-xs">{t.settings.openAiCompatibleContextWindowHint}</p>
                  </InfoHint>
                </div>
                <Input
                  id="openai-compatible-context-window"
                  type="number"
                  min={MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW}
                  max={MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW}
                  step={1024}
                  value={contextWindowTokens}
                  onChange={(event) => {
                    setContextWindowTokens(event.target.value)
                    setContextWindowSource('manual')
                  }}
                  inputMode="numeric"
                  disabled={busy}
                  className={COMPACT_INPUT_CLASS}
                />
                {detectedContextWindowTokens !== null && (
                  <div
                    className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground"
                    aria-live="polite"
                  >
                    <span>
                      {t.settings.openAiCompatibleContextWindowDetected.replace(
                        '{tokens}',
                        detectedContextWindowTokens.toLocaleString('en-US'),
                      )}
                    </span>
                    {Number(contextWindowTokens) !== detectedContextWindowTokens && (
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={busy}
                        onClick={() => {
                          setContextWindowTokens(String(detectedContextWindowTokens))
                          setContextWindowSource('detected')
                        }}
                      >
                        {t.settings.openAiCompatibleUseDetectedContextWindow}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Label htmlFor="openai-compatible-key" className="text-xs">
                    {t.settings.openAiCompatibleApiKey}
                  </Label>
                  <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
                    <p className="text-xs">
                      {transport === 'mediprisma-gateway'
                        ? t.settings.openAiCompatibleGatewayApiKeyHint
                        : t.settings.openAiCompatibleApiKeyHint}
                    </p>
                  </InfoHint>
                </div>
                <div className="relative">
                  <Input
                    id="openai-compatible-key"
                    name="openai-compatible-key"
                    type="text"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value)
                      setDetectedContextWindowTokens(null)
                      setTestState(null)
                      setConnectionTestPassed(false)
                      invalidateAgentCapability()
                    }}
                    placeholder={transport === 'mediprisma-gateway'
                      ? t.settings.openAiCompatibleGatewayApiKeyPlaceholder
                      : t.settings.openAiCompatibleApiKeyPlaceholder}
                    className={cn(
                      COMPACT_INPUT_CLASS,
                      'pr-9',
                      !showApiKey && '[-webkit-text-security:disc]',
                    )}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((current) => !current)}
                    disabled={busy}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showApiKey ? t.settings.hideKey : t.settings.showKey}
                  >
                    {showApiKey
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <fieldset
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 border-t pt-2"
              aria-labelledby="openai-compatible-agent-mode-label"
            >
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span
                    id="openai-compatible-agent-mode-label"
                    className="text-xs font-medium"
                  >
                    {t.settings.openAiCompatibleAgentMode}
                  </span>
                  <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
                    <p className="text-xs">
                      {t.settings.openAiCompatibleAgentModeHint}
                    </p>
                  </InfoHint>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/20 p-1">
                {([
                  {
                    value: 'auto',
                    label: t.settings.openAiCompatibleAgentModeAuto,
                  },
                  {
                    value: 'standard',
                    label: t.settings.openAiCompatibleAgentModeStandard,
                  },
                ] as const).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded px-1 py-1.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50 sm:gap-1.5 sm:px-2',
                      agentMode === option.value
                        ? 'bg-background text-teal-800 shadow-sm dark:text-teal-200'
                        : 'hover:bg-muted/40',
                      busy && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="openai-compatible-agent-mode"
                      value={option.value}
                      checked={agentMode === option.value}
                      onChange={() => {
                        setAgentMode(option.value)
                        setAgentModeConfirmedForDraft(true)
                      }}
                      disabled={busy}
                      className="sr-only"
                    />
                    <span className="min-w-0 truncate text-xs font-medium" title={option.label}>
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="col-span-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <p className="min-w-0 flex-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                  {agentMode === 'auto'
                    ? t.settings.openAiCompatibleAgentModeAutoDescription
                    : t.settings.openAiCompatibleAgentModeStandardDescription}
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                    agentCapability === 'verified' &&
                      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                    agentCapability === 'unsupported' &&
                      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
                    agentCapability === 'unknown' &&
                      'border-border bg-background text-muted-foreground',
                  )}
                  aria-label={`${t.settings.openAiCompatibleAgentCapability}: ${
                    agentCapability === 'verified'
                      ? t.settings.openAiCompatibleAgentCapabilityVerified
                      : agentCapability === 'unsupported'
                        ? t.settings.openAiCompatibleAgentCapabilityUnsupported
                        : t.settings.openAiCompatibleAgentCapabilityUnknown
                  }`}
                >
                  {agentCapability === 'verified'
                    ? t.settings.openAiCompatibleAgentCapabilityVerified
                    : agentCapability === 'unsupported'
                      ? t.settings.openAiCompatibleAgentCapabilityUnsupported
                      : t.settings.openAiCompatibleAgentCapabilityUnknown}
                </span>
              </div>
            </fieldset>
      </div>

      {testState && (
        <div className={cn(
          'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs',
          testState.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
          testState.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
          testState.tone === 'error' && 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
        )} role={testState.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          {testState.tone === 'success'
            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{testState.text}</span>
        </div>
      )}

      {agentTestState && (
        <div className={cn(
          'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs',
          agentTestState.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
          agentTestState.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
          agentTestState.tone === 'error' && 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
        )} role={agentTestState.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          {agentTestState.tone === 'success'
            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0">
            <span>{agentTestState.text}</span>
            {agentTestState.detail && (
              <span className="mt-0.5 block break-words text-[0.6875rem] opacity-80">
                {t.settings.openAiCompatibleAgentTestReason}: {agentTestState.detail}
              </span>
            )}
          </span>
        </div>
      )}

      <div
        data-testid="openai-compatible-actions"
        className="flex flex-col gap-1.5 border-t border-border/60 pt-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={handleTest}
            disabled={busy || !baseUrl.trim() || !modelId.trim()}
            className={SECONDARY_ACTION_BUTTON_CLASS}
          >
            {testing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Network className="h-3.5 w-3.5" />}
            {testing ? t.settings.openAiCompatibleTesting : t.settings.openAiCompatibleTest}
          </Button>
          <InfoHint
            aria-label={t.common.help}
            className={ACTION_INFO_CLASS}
            contentClassName="max-w-sm"
          >
            <p className="text-xs">
              {transport === 'mediprisma-gateway'
                ? t.settings.openAiCompatibleGatewayTestPrivacy
                : t.settings.openAiCompatibleTestPrivacy}
            </p>
          </InfoHint>
        </div>

        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={handleAgentCapabilityTest}
            disabled={busy || !baseUrl.trim() || !modelId.trim() || !connectionReadyToSave}
            title={!connectionReadyToSave
              ? t.settings.openAiCompatibleAgentTestNeedsConnection
              : undefined}
            className={SECONDARY_ACTION_BUTTON_CLASS}
          >
            {agentTesting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {agentTesting
              ? t.settings.openAiCompatibleAgentTesting
              : t.settings.openAiCompatibleAgentTest}
          </Button>
          <InfoHint
            aria-label={t.common.help}
            className={ACTION_INFO_CLASS}
            contentClassName="max-w-sm"
          >
            <p className="text-xs">{t.settings.openAiCompatibleAgentTestPrivacy}</p>
          </InfoHint>
        </div>

        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <Button
            size="sm"
            type="button"
            onClick={handleSave}
            disabled={busy || !baseUrl.trim() || !modelId.trim() || !connectionReadyToSave}
            title={!connectionReadyToSave
              ? t.settings.openAiCompatibleTestBeforeSave
              : undefined}
            className={PRIMARY_ACTION_BUTTON_CLASS}
          >
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />}
            {saving
              ? t.settings.openAiCompatibleSaving
              : draftChanged || !selectedProfile
                ? t.settings.openAiCompatibleSaveEnable
                : t.settings.openAiCompatibleSave}
          </Button>
          {selectedProfile && (
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
              <Label htmlFor="openai-compatible-enabled" className="text-xs text-muted-foreground">
                {t.settings.openAiCompatibleUseConnection}
              </Label>
              <Switch
                id="openai-compatible-enabled"
                checked={saved.enabled}
                onCheckedChange={handleEnabledChange}
                disabled={busy}
                className="data-[state=checked]:bg-teal-600 focus-visible:ring-teal-500/30 dark:data-[state=checked]:bg-teal-500"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
