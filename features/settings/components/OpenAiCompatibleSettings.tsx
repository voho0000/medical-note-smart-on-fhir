"use client"

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Cloud, Eye, EyeOff, Loader2, Network, ShieldCheck } from 'lucide-react'
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
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import {
  DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  normalizeOpenAiCompatibleContextWindow,
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

interface TestState {
  tone: 'success' | 'warning' | 'error'
  text: string
}

export function OpenAiCompatibleSettings() {
  const { t } = useLanguage()
  const saved = useAiConfigStore((state) => state.openAiCompatible)
  const setConfig = useAiConfigStore((state) => state.setOpenAiCompatibleConfig)
  const setEnabled = useAiConfigStore((state) => state.setOpenAiCompatibleEnabled)
  const clearConfig = useAiConfigStore((state) => state.clearOpenAiCompatibleConfig)
  const savedEndpointUrl = formatOpenAiCompatibleChatCompletionsUrl(saved.baseUrl)
  const [baseUrl, setBaseUrl] = useState(savedEndpointUrl)
  const [modelId, setModelId] = useState(saved.modelId)
  const [contextWindowTokens, setContextWindowTokens] = useState(String(
    normalizeOpenAiCompatibleContextWindow(saved.contextWindowTokens, saved.modelId),
  ))
  const [apiKey, setApiKey] = useState(saved.apiKey ?? '')
  const [transport, setTransport] = useState(normalizeOpenAiCompatibleTransport(saved.transport))
  const [showApiKey, setShowApiKey] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])

  useEffect(() => {
    // The encrypted profile rehydrates asynchronously from the selected
    // browser storage, so the editable draft must follow that external store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseUrl(formatOpenAiCompatibleChatCompletionsUrl(saved.baseUrl))
    setModelId(saved.modelId)
    setContextWindowTokens(String(
      normalizeOpenAiCompatibleContextWindow(saved.contextWindowTokens, saved.modelId),
    ))
    setApiKey(saved.apiKey ?? '')
    setTransport(normalizeOpenAiCompatibleTransport(saved.transport))
  }, [saved])

  const modelOptionsId = 'openai-compatible-model-options'
  const draftChanged = useMemo(() => (
    baseUrl !== savedEndpointUrl ||
    modelId !== saved.modelId ||
    Number(contextWindowTokens) !== normalizeOpenAiCompatibleContextWindow(
      saved.contextWindowTokens,
      saved.modelId,
    ) ||
    apiKey !== (saved.apiKey ?? '') ||
    transport !== normalizeOpenAiCompatibleTransport(saved.transport)
  ), [apiKey, baseUrl, contextWindowTokens, modelId, saved, savedEndpointUrl, transport])

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

  const handleSave = () => {
    try {
      const next = normalizeDraft()
      setConfig(next)
      setBaseUrl(formatOpenAiCompatibleChatCompletionsUrl(next.baseUrl))
      setModelId(next.modelId)
      setContextWindowTokens(String(next.contextWindowTokens))
      setApiKey(next.apiKey ?? '')
      setTransport(normalizeOpenAiCompatibleTransport(next.transport))
      setTestState(null)
      toast.success(t.settings.openAiCompatibleSaved)
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestState(null)
    setDiscoveredModels([])
    try {
      const draft = normalizeDraft()
      const result = await testOpenAiCompatibleConnection(draft)
      setDiscoveredModels(result.models)
      if (result.modelFound === false) {
        setTestState({ tone: 'warning', text: t.settings.openAiCompatibleModelNotFound })
      } else {
        setTestState({
          tone: 'success',
          text: result.usedChatProbe
            ? t.settings.openAiCompatibleProbeSuccess
            : t.settings.openAiCompatibleConnectionSuccess,
        })
      }
    } catch (error) {
      setTestState({
        tone: 'error',
        text: `${t.settings.openAiCompatibleConnectionFailed}: ${errorText(error)}`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleClear = () => {
    clearConfig()
    setBaseUrl('')
    setModelId('')
    setContextWindowTokens(String(DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW))
    setApiKey('')
    setTransport('direct')
    setDiscoveredModels([])
    setTestState(null)
    toast.success(t.settings.openAiCompatibleCleared)
  }

  return (
    <section className="space-y-4">
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
            onChange={(event) => { setBaseUrl(event.target.value); setTestState(null) }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'https://ai.j3soon.com/v1/chat/completions'
              : 'https://llm.intra.example.org/v1/chat/completions'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
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
              const followsSuggestion = Number(contextWindowTokens) ===
                suggestedOpenAiCompatibleContextWindow(modelId)
              setModelId(nextModelId)
              if (followsSuggestion) {
                setContextWindowTokens(String(
                  suggestedOpenAiCompatibleContextWindow(nextModelId),
                ))
              }
              setTestState(null)
            }}
            placeholder={transport === 'mediprisma-gateway'
              ? 'MODEL_NAME'
              : 'meta-llama/Llama-3.3-70B-Instruct'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
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
                onClick={() => { setTransport('direct'); setTestState(null) }}
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
                onClick={() => { setTransport('mediprisma-gateway'); setTestState(null) }}
                disabled={!ENV_CONFIG.hasOpenAiCompatibleGateway}
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
                  setTestState(null)
                }}
                inputMode="numeric"
              />
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
                  onChange={(event) => { setApiKey(event.target.value); setTestState(null) }}
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
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((current) => !current)}
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
        )}>
          {testState.tone === 'success'
            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{testState.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="button" onClick={handleTest} disabled={testing || !baseUrl.trim() || !modelId.trim()}>
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
        <Button size="sm" type="button" onClick={handleSave} disabled={!baseUrl.trim() || !modelId.trim()}>
          {draftChanged || !saved.baseUrl
            ? t.settings.openAiCompatibleSaveEnable
            : t.settings.openAiCompatibleSave}
        </Button>
        {saved.baseUrl && saved.modelId && (
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="openai-compatible-enabled" className="text-xs text-muted-foreground">
              {t.settings.openAiCompatibleUseConnection}
            </Label>
            <Switch
              id="openai-compatible-enabled"
              checked={saved.enabled}
              onCheckedChange={setEnabled}
            />
            <Button size="sm" variant="ghost" type="button" onClick={handleClear}>
              {t.settings.openAiCompatibleClear}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
