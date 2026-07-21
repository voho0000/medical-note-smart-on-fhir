// AI connection settings. Models are selected where they are used; this page
// progressively discloses the connection profiles, credentials and persistence
// policy that make those models available.
"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  BookOpen,
  ChevronDown,
  Cloud,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { useModelPrefsStore } from "@/src/application/stores/model-prefs.store"
import { useSummaryPrefsStore } from "@/src/application/hooks/medical-summary/use-medical-summary.hook"
import { useSafetyPrefsStore } from "@/src/application/hooks/safety-alerts/use-safety-alerts.hook"
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { isUsableApiKey } from "@/src/shared/utils/api-key.utils"
import { isOpenAiCompatibleRuntimeReady } from "@/src/shared/utils/openai-compatible.utils"
import { normalizeOpenAiCompatibleTransport } from "@/src/shared/types/openai-compatible.types"
import {
  getModelDefinition,
  modelRequiresUserKey,
  type ModelProvider,
} from "@/src/shared/constants/ai-models.constants"
import { cn } from "@/src/shared/utils/cn.utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiKeyInput } from "./ApiKeyInput"
import { AuthStatus } from "@/features/auth"
import { OpenAiCompatibleSettings } from "./OpenAiCompatibleSettings"
import {
  isOpenAiCompatibleAddProfileTarget,
  isOpenAiCompatibleContextWindowTarget,
  type SettingsNavigationTarget,
} from "@/src/application/providers/right-panel.provider"

type StatusTone = "success" | "muted" | "warning"

function statusClass(tone: StatusTone): string {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
  }
  return "border-border bg-muted/40 text-muted-foreground"
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <Badge variant="outline" className={cn("text-[0.625rem]", statusClass(tone))}>
      {label}
    </Badge>
  )
}

function SectionTriggerContent({
  icon,
  title,
  description,
  status,
  tone,
}: {
  icon: ReactNode
  title: string
  description: string
  status: string
  tone: StatusTone
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5 pr-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span>{title}</span>
          <StatusBadge label={status} tone={tone} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs font-normal text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function CredentialDisclosure({
  title,
  configured,
  configuredLabel,
  notConfiguredLabel,
  children,
}: {
  title: string
  configured: boolean
  configuredLabel: string
  notConfiguredLabel: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border bg-background/70">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
            <StatusBadge
              label={configured ? configuredLabel : notConfiguredLabel}
              tone={configured ? "success" : "muted"}
            />
            <ChevronDown className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface ModelAndKeySettingsProps {
  /** Test/deployment seam; production follows the build-time offline mode. */
  offlineMode?: boolean
  /** Optional deep-link destination supplied by the right-panel navigator. */
  settingsTarget?: SettingsNavigationTarget | null
  /** Clears a deep-link only after its final field has been revealed and focused. */
  onSettingsTargetHandled?: () => void
}

export function ModelAndKeySettings({
  offlineMode = ENV_CONFIG.offlineMode,
  settingsTarget = null,
  onSettingsTargetHandled,
}: ModelAndKeySettingsProps = {}) {
  const { t } = useLanguage()
  const { user, isAnonymous } = useAuth()
  const apiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const perplexityKey = useAiConfigStore((state) => state.perplexityKey)
  const claudeKey = useAiConfigStore((state) => state.claudeKey)
  const openAiCompatibleProfiles = useAiConfigStore(
    (state) => state.openAiCompatibleProfiles,
  )
  const setApiKey = useAiConfigStore((state) => state.setApiKey)
  const setGeminiKey = useAiConfigStore((state) => state.setGeminiKey)
  const setPerplexityKey = useAiConfigStore((state) => state.setPerplexityKey)
  const setClaudeKey = useAiConfigStore((state) => state.setClaudeKey)
  const storageType = useAiConfigStore((state) => state.storageType)
  const credentialsHydrating = useAiConfigStore((state) => state.credentialsHydrating)
  const storageTypeChanging = useAiConfigStore((state) => state.storageTypeChanging)
  const setStorageType = useAiConfigStore((state) => state.setStorageType)
  const credentialControlsDisabled = credentialsHydrating || storageTypeChanging
  const [openAiValue, setOpenAiValue] = useState(apiKey)
  const [geminiValue, setGeminiValue] = useState(geminiKey)
  const [perplexityValue, setPerplexityValue] = useState(perplexityKey)
  const [claudeValue, setClaudeValue] = useState(claudeKey)

  // Encrypted credentials hydrate asynchronously after the component mounts;
  // keep each editable draft synchronized with that external store update.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenAiValue(apiKey)
  }, [apiKey])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeminiValue(geminiKey)
  }, [geminiKey])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerplexityValue(perplexityKey)
  }, [perplexityKey])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClaudeValue(claudeKey)
  }, [claudeKey])

  const localConfigured = openAiCompatibleProfiles.length > 0
  const readyProfiles = openAiCompatibleProfiles.filter((profile) => (
    isOpenAiCompatibleRuntimeReady(profile)
  ))
  const localReady = readyProfiles.length > 0
  const localStatus = localReady
    ? t.settings.openAiCompatibleProfilesSummary
      .replace("{enabled}", String(readyProfiles.length))
      .replace("{count}", String(openAiCompatibleProfiles.length))
    : localConfigured
      ? t.settings.openAiCompatibleDisabled
      : t.settings.openAiCompatibleNotConfigured
  const localTone: StatusTone = localReady ? "success" : localConfigured ? "warning" : "muted"
  const localUsesGateway = localConfigured && openAiCompatibleProfiles.every((profile) => (
    normalizeOpenAiCompatibleTransport(profile.transport) === "mediprisma-gateway"
  ))
  const localDetail = t.settings.openAiCompatibleDescription

  const cloudKeyCount = [apiKey, geminiKey, claudeKey].filter((key) => Boolean(key?.trim())).length
  const cloudDetail = t.settings.cloudKeyCount.replace("{count}", String(cloudKeyCount))
  const toolsConfigured = Boolean(perplexityKey?.trim())
  const sectionTouchedRef = useRef(false)
  const [openSection, setOpenSection] = useState(() => (
    useAiConfigStore.persist.hasHydrated() && localConfigured ? "" : "local"
  ))

  useEffect(() => {
    const syncInitialSection = () => {
      if (sectionTouchedRef.current) return
      const configuredProfiles = useAiConfigStore.getState().openAiCompatibleProfiles
      setOpenSection(configuredProfiles.length > 0 ? "" : "local")
    }

    // Hydration may finish between the first render and this subscription.
    // Synchronize immediately as well as listening for a later completion.
    if (useAiConfigStore.persist.hasHydrated()) syncInitialSection()
    return useAiConfigStore.persist.onFinishHydration(syncInitialSection)
  }, [])

  useEffect(() => {
    if (
      !isOpenAiCompatibleContextWindowTarget(settingsTarget) &&
      !isOpenAiCompatibleAddProfileTarget(settingsTarget)
    ) return
    sectionTouchedRef.current = true
    // A navigation intent is external state; reveal its owning disclosure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenSection('local')
  }, [settingsTarget])

  const rejectIfInvalidKey = (value: string | null | undefined): boolean => {
    if (value && value.trim() && !isUsableApiKey(value)) {
      toast.error(t.settings.invalidApiKey)
      return true
    }
    return false
  }

  const handleSaveOpenAiKey = async () => {
    if (!openAiValue || rejectIfInvalidKey(openAiValue)) return
    setApiKey(openAiValue.trim())
  }

  const notifyIfDowngraded = (provider: ModelProvider) => {
    const modelPrefs = useModelPrefsStore.getState().prefs
    const prefsInUse = [
      modelPrefs.chat,
      modelPrefs.insights,
      useSummaryPrefsStore.getState().modelId,
      useSafetyPrefsStore.getState().modelId,
    ]
    const strandsAPick = prefsInUse.some((id) => {
      const def = getModelDefinition(id)
      return def?.provider === provider && modelRequiresUserKey(def)
    })
    if (strandsAPick) toast.info(t.settings.modelDowngradedToFree)
  }

  const handleClearOpenAiKey = () => {
    setOpenAiValue("")
    notifyIfDowngraded("openai")
    setApiKey(null)
  }

  const handleSaveGeminiKey = async () => {
    if (rejectIfInvalidKey(geminiValue)) return
    setGeminiKey(geminiValue)
  }

  const handleClearGeminiKey = () => {
    setGeminiValue("")
    notifyIfDowngraded("gemini")
    setGeminiKey(null)
  }

  const handleSaveClaudeKey = async () => {
    if (!claudeValue || rejectIfInvalidKey(claudeValue)) return
    setClaudeKey(claudeValue.trim())
  }

  const handleClearClaudeKey = () => {
    setClaudeValue("")
    notifyIfDowngraded("claude")
    setClaudeKey(null)
  }

  const handleSavePerplexityKey = async () => {
    if (!perplexityValue || rejectIfInvalidKey(perplexityValue)) return
    setPerplexityKey(perplexityValue.trim())
  }

  const handleClearPerplexityKey = () => {
    setPerplexityValue("")
    setPerplexityKey(null)
  }

  const handleStorageTypeChange = async (checked: boolean) => {
    try {
      await setStorageType(checked ? "localStorage" : "sessionStorage")
    } catch (error) {
      console.warn("Failed to change credential storage mode:", error)
      toast.error(t.settings.keyStorageChangeFailed)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t.settings.modelsMovedNoteShort}</p>

      {offlineMode ? (
        <div className="flex items-start gap-2.5 rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{t.settings.offlineDeployment}</p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {t.settings.offlineDeploymentDescription}
            </p>
          </div>
          <StatusBadge label={t.settings.offlineOnly} tone="success" />
        </div>
      ) : null}

      <Accordion
        type="single"
        collapsible
        value={openSection}
        onValueChange={(value) => {
          sectionTouchedRef.current = true
          setOpenSection(value)
        }}
        className="overflow-hidden rounded-lg border bg-background"
      >
        <AccordionItem value="local" className="px-3">
          <AccordionTrigger className="py-3 hover:no-underline">
            <SectionTriggerContent
              icon={<Server className="h-4 w-4" />}
              title={t.settings.localModelSection}
              description={localDetail}
              status={localStatus}
              tone={localTone}
            />
          </AccordionTrigger>
          <AccordionContent
            forceMount
            hidden={openSection !== "local"}
            className="pb-3 data-[state=closed]:hidden"
          >
            <div className={cn(
              "rounded-md border p-3",
              localUsesGateway
                ? "border-amber-200 bg-amber-50/20 dark:border-amber-900 dark:bg-amber-950/10"
                : "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/15",
            )}>
              <OpenAiCompatibleSettings
                navigationReady={openSection === "local"}
                settingsTarget={settingsTarget}
                onSettingsTargetHandled={onSettingsTargetHandled}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {!offlineMode ? (
          <AccordionItem value="cloud" className="px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionTriggerContent
                icon={<Cloud className="h-4 w-4" />}
                title={t.settings.cloudAiSection}
                description={t.settings.cloudAiDescription}
                status={cloudDetail}
                tone={cloudKeyCount > 0 || (user && !isAnonymous) ? "success" : "muted"}
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-3">
              <AuthStatus />
              <div className="space-y-2">
                <CredentialDisclosure
                  title="OpenAI"
                  configured={Boolean(apiKey?.trim())}
                  configuredLabel={t.settings.configured}
                  notConfiguredLabel={t.settings.notConfigured}
                >
                  <ApiKeyInput
                    id="openai-key"
                    label={t.settings.personalOpenAiKey}
                    placeholder="sk-..."
                    value={openAiValue || ""}
                    onChange={setOpenAiValue}
                    onSave={handleSaveOpenAiKey}
                    onClear={handleClearOpenAiKey}
                    helpText={t.settings.openAiKeyHelp}
                    clearWarning={t.settings.clearOpenAiKeyWarning}
                    disabled={credentialControlsDisabled}
                  />
                </CredentialDisclosure>
                <CredentialDisclosure
                  title="Gemini"
                  configured={Boolean(geminiKey?.trim())}
                  configuredLabel={t.settings.configured}
                  notConfiguredLabel={t.settings.notConfigured}
                >
                  <ApiKeyInput
                    id="gemini-key"
                    label={t.settings.personalGeminiKey}
                    placeholder="AIza..."
                    value={geminiValue || ""}
                    onChange={setGeminiValue}
                    onSave={handleSaveGeminiKey}
                    onClear={handleClearGeminiKey}
                    helpText={t.settings.geminiKeyHelp}
                    clearWarning={t.settings.clearGeminiKeyWarning}
                    disabled={credentialControlsDisabled}
                  />
                </CredentialDisclosure>
                <CredentialDisclosure
                  title="Claude"
                  configured={Boolean(claudeKey?.trim())}
                  configuredLabel={t.settings.configured}
                  notConfiguredLabel={t.settings.notConfigured}
                >
                  <ApiKeyInput
                    id="claude-key"
                    label={t.settings.personalClaudeKey}
                    placeholder="sk-ant-..."
                    value={claudeValue || ""}
                    onChange={setClaudeValue}
                    onSave={handleSaveClaudeKey}
                    onClear={handleClearClaudeKey}
                    helpText={t.settings.claudeKeyHelp}
                    clearWarning={t.settings.clearClaudeKeyWarning}
                    disabled={credentialControlsDisabled}
                  />
                </CredentialDisclosure>
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {!offlineMode ? (
          <AccordionItem value="tools" className="px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionTriggerContent
                icon={<BookOpen className="h-4 w-4" />}
                title={t.settings.deepChatToolsSection}
                description={t.settings.deepChatToolsDescription}
                status={toolsConfigured ? t.settings.configured : t.settings.notConfigured}
                tone={toolsConfigured ? "success" : "muted"}
              />
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="rounded-md border bg-muted/15 p-3">
                <ApiKeyInput
                  id="perplexity-key"
                  label={t.settings.personalPerplexityKey}
                  placeholder="pplx-..."
                  value={perplexityValue || ""}
                  onChange={setPerplexityValue}
                  onSave={handleSavePerplexityKey}
                  onClear={handleClearPerplexityKey}
                  helpText={t.settings.perplexityKeyHelp}
                  clearWarning={t.settings.clearPerplexityKeyWarning}
                  disabled={credentialControlsDisabled}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        <AccordionItem value="privacy" className="px-3">
          <AccordionTrigger className="py-3 hover:no-underline">
            <SectionTriggerContent
              icon={<LockKeyhole className="h-4 w-4" />}
              title={t.settings.privacyStorageSection}
              description={t.settings.privacyStorageDescription}
              status={storageType === "localStorage"
                ? t.settings.savedOnDevice
                : t.settings.currentSessionOnly}
              tone={storageType === "localStorage" ? "warning" : "success"}
            />
          </AccordionTrigger>
          <AccordionContent className="pb-3">
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="remember-ai-connections" className="text-sm font-medium">
                  {t.settings.rememberKeyOnDevice}
                </Label>
                <p className="text-xs text-muted-foreground">{t.settings.rememberKeyHint}</p>
              </div>
              <Switch
                id="remember-ai-connections"
                className="shrink-0"
                checked={storageType === "localStorage"}
                onCheckedChange={handleStorageTypeChange}
                disabled={credentialControlsDisabled}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
