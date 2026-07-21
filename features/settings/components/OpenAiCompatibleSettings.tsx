"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { testOpenAiCompatibleConnection } from '@/src/application/composition.ai'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { InfoHint } from '@/src/shared/components/InfoHint'
import type {
  OpenAiCompatibleConfig,
  OpenAiCompatibleContextWindowSource,
  OpenAiCompatibleProfile,
} from '@/src/shared/types/openai-compatible.types'
import {
  createEmptyOpenAiCompatibleConfig,
  MAX_OPENAI_COMPATIBLE_PROFILES,
  MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
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
}

function initialContextWindowSource(
  config: OpenAiCompatibleConfig,
): OpenAiCompatibleContextWindowSource {
  return normalizeOpenAiCompatibleContextWindowSource(
    config.contextWindowSource,
    Boolean(config.baseUrl && config.modelId),
  )
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [connectionTestPassed, setConnectionTestPassed] = useState(false)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const testRequestId = useRef(0)
  const busy = testing || saving || credentialsHydrating
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
    // A navigation intent is external state; reveal its owning disclosure.
    setAdvancedOpen(true)
  }, [navigationReady, profiles, selectedProfileId, settingsTarget, targetProfileId])

  useEffect(() => {
    if (
      !navigationReady ||
      !advancedOpen ||
      !isOpenAiCompatibleContextWindowTarget(settingsTarget)
    ) return

    const input = document.getElementById('openai-compatible-context-window')
    if (!(input instanceof HTMLInputElement)) return
    input.scrollIntoView?.({ block: 'center' })
    input.focus({ preventScroll: true })
    onSettingsTargetHandled?.()
  }, [advancedOpen, navigationReady, onSettingsTargetHandled, settingsTarget])

  useEffect(() => {
    testRequestId.current += 1
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
    setConnectionTestPassed(false)
    setApiKey(saved.apiKey ?? '')
    setTransport(normalizeOpenAiCompatibleTransport(saved.transport))
    setShowApiKey(false)
    setTesting(false)
  }, [saved])

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
    transport !== normalizeOpenAiCompatibleTransport(saved.transport)
  ), [
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
      // Resolve only after the encrypted credential and profile are durably
      // written, so closing the page after the success toast cannot race the
      // API-key save.
      const profileId = selectedProfileId
        ? (await updateConfig(selectedProfileId, next), selectedProfileId)
        : await addConfig(next)
      newProfileRequestedRef.current = false
      setCreatingNew(false)
      setSelectedProfileId(profileId)
      setBaseUrl(formatOpenAiCompatibleChatCompletionsUrl(next.baseUrl))
      setModelId(next.modelId)
      setContextWindowTokens(String(next.contextWindowTokens))
      setApiKey(next.apiKey ?? '')
      setTransport(normalizeOpenAiCompatibleTransport(next.transport))
      setTestState(null)
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
        setAdvancedOpen(true)
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

  const handleDelete = async () => {
    if (!selectedProfile) return
    const message = t.settings.openAiCompatibleDeleteConfirm.replace(
      '{model}',
      profileOptionLabel(selectedProfile, profiles),
    )
    if (typeof window !== 'undefined' && !window.confirm(message)) return

    testRequestId.current += 1
    setTesting(false)
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
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background/70 p-2">
        <Label htmlFor="openai-compatible-profile" className="sr-only">
          {t.settings.openAiCompatibleSelectProfile}
        </Label>
        <select
          id="openai-compatible-profile"
          value={selectedProfileId ?? ''}
          onChange={(event) => handleProfileSelection(event.target.value)}
          disabled={busy || profiles.length === 0}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
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
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
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
          <span className="hidden sm:inline">{t.settings.openAiCompatibleAddProfile}</span>
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

      <div className="grid gap-3">
        <div className="space-y-1.5">
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
            }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'https://openrouter.ai/api/v1/chat/completions'
              : 'https://llm.intra.example.org/v1/chat/completions'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
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
            }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'MODEL_NAME'
              : 'meta-llama/Llama-3.3-70B-Instruct'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
          <datalist id={modelOptionsId}>
            {discoveredModels.map((id) => <option key={id} value={id} />)}
          </datalist>
        </div>

        {!ENV_CONFIG.offlineMode && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t.settings.openAiCompatibleTransport}</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => {
                  if (transport === 'direct') return
                  setTransport('direct')
                  setDetectedContextWindowTokens(null)
                  setTestState(null)
                  setConnectionTestPassed(false)
                }}
                disabled={busy}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors',
                  transport === 'direct'
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={transport === 'direct'}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {t.settings.openAiCompatibleTransportDirect}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (transport === 'mediprisma-gateway') return
                  setTransport('mediprisma-gateway')
                  setDetectedContextWindowTokens(null)
                  setTestState(null)
                  setConnectionTestPassed(false)
                }}
                disabled={busy || !ENV_CONFIG.hasOpenAiCompatibleGateway}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors',
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
                <Cloud className="h-3.5 w-3.5" />
                {t.settings.openAiCompatibleTransportGateway}
              </button>
            </div>
            <p className={cn(
              'text-[0.6875rem] leading-relaxed',
              transport === 'mediprisma-gateway'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground',
            )}>
              {transport === 'mediprisma-gateway'
                ? t.settings.openAiCompatibleGatewayDescription
                : t.settings.openAiCompatibleDirectDescription}
            </p>
          </div>
        )}

      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span>{t.settings.advancedSettings}</span>
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              advancedOpen && 'rotate-180',
            )} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 grid gap-3 rounded-md border bg-muted/10 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
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
              />
              {detectedContextWindowTokens !== null && (
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground"
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

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
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
                  }}
                  placeholder={transport === 'mediprisma-gateway'
                    ? t.settings.openAiCompatibleGatewayApiKeyPlaceholder
                    : t.settings.openAiCompatibleApiKeyPlaceholder}
                  className={cn('pr-10', !showApiKey && '[-webkit-text-security:disc]')}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showApiKey ? t.settings.hideKey : t.settings.showKey}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

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

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="button" onClick={handleTest} disabled={busy || !baseUrl.trim() || !modelId.trim()}>
          {testing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {testing ? t.settings.openAiCompatibleTesting : t.settings.openAiCompatibleTest}
        </Button>
        <InfoHint aria-label={t.common.help} contentClassName="max-w-sm">
          <p className="text-xs">
            {transport === 'mediprisma-gateway'
              ? t.settings.openAiCompatibleGatewayTestPrivacy
              : t.settings.openAiCompatibleTestPrivacy}
          </p>
        </InfoHint>
        <Button
          size="sm"
          type="button"
          onClick={handleSave}
          disabled={busy || !baseUrl.trim() || !modelId.trim() || !connectionReadyToSave}
          title={!connectionReadyToSave
            ? t.settings.openAiCompatibleTestBeforeSave
            : undefined}
        >
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {saving
            ? t.settings.openAiCompatibleSaving
            : draftChanged || !selectedProfile
              ? t.settings.openAiCompatibleSaveEnable
              : t.settings.openAiCompatibleSave}
        </Button>
        {selectedProfile && (
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="openai-compatible-enabled" className="text-xs text-muted-foreground">
              {t.settings.openAiCompatibleUseConnection}
            </Label>
            <Switch
              id="openai-compatible-enabled"
              checked={saved.enabled}
              onCheckedChange={handleEnabledChange}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </section>
  )
}
