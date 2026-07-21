// Shared in-panel model picker. Each AI feature mounts one next to where the
// model is actually used (chat toolbar, custom-module manager, medical-summary
// header) and wires it to its own persisted preference.
//
// The trigger and the checkmark always show the EFFECTIVE model — the raw
// preference run through the same key-gate as the runtime
// (gateModelForKeys) — so what the user sees is what the call will use. A
// premium pick whose provider key is gone (e.g. session-scoped keys after a
// browser restart) silently lands back on the feature's free default here,
// exactly like the stream adapter does; re-adding the key revives the pick.
"use client"

import { Check, ChevronDown, ChevronRight, Lock, Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { useAiConfigStore, useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { useModelSelection, type ModelEntry } from "@/src/application/hooks/useModelSelection"
import {
  gateModelForAgentSupport,
  gateModelForKeys,
  getModelDefinition,
  modelRequiresUserKey,
  modelUsesStandardChat,
} from "@/src/shared/constants/ai-models.constants"
import { cn } from "@/src/shared/utils/cn.utils"
import { modelDisplayLabel } from '@/src/shared/utils/model-access.utils'
import { MAX_OPENAI_COMPATIBLE_PROFILES } from '@/src/shared/types/openai-compatible.types'

interface ModelPickerProps {
  /** Raw persisted model preference (may be key-gated right now). */
  modelId: string
  /** The feature's free default — where the gate lands without a key. */
  fallbackModelId: string
  onSelect: (id: string) => void
  /** Hover title on the trigger (e.g. "與聊天模型獨立"). */
  tooltip?: string
  /** Chat mode: standard-capability models are labelled and run without tools. */
  agentModeActive?: boolean
  align?: "start" | "end"
  /** Dense header variant: hide the prefix and size to the actual model name. */
  compact?: boolean
}

export function ModelPicker({
  modelId,
  fallbackModelId,
  onSelect,
  tooltip,
  agentModeActive = false,
  align = "end",
  compact = false,
}: ModelPickerProps) {
  const { t } = useLanguage()
  const { setActiveTab } = useRightPanel()
  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()
  const customProfileCount = useAiConfigStore(
    (state) => state.openAiCompatibleProfiles.length,
  )
  const { gptModels, geminiModels, claudeModels, customModels, handleSelectModel } = useModelSelection(
    apiKey,
    geminiKey,
    claudeKey,
    modelId,
    onSelect,
  )
  const selectedCustomEntry = customModels.find((entry) => entry.id === modelId)

  const keyGatedModelId = gateModelForKeys(
    modelId,
    {
      openAiKey: apiKey,
      geminiKey,
      claudeKey,
      customAvailable: Boolean(selectedCustomEntry && !selectedCustomEntry.isLocked),
    },
    fallbackModelId,
  )
  const effectiveModelId = agentModeActive
    ? gateModelForAgentSupport(keyGatedModelId, fallbackModelId)
    : keyGatedModelId
  const effectiveCustomEntry = customModels.find((entry) => entry.id === effectiveModelId)
  const effectiveLabel = effectiveCustomEntry?.label ?? modelDisplayLabel(effectiveModelId)

  const groups: Array<{ label: string; items: ModelEntry[]; custom?: boolean }> = [
    { label: t.settings.openAiCompatibleGroupLabel, items: customModels, custom: true },
    { label: "Gemini", items: geminiModels },
    { label: "GPT", items: gptModels },
    { label: "Claude", items: claudeModels },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="model-picker-trigger"
          title={tooltip}
          className={cn(
            "flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted",
            compact && "max-w-[14rem]",
          )}
        >
          {/* The 「模型：」 prefix follows the app's below-sm density rule
              (labels drop, icons/values stay) — on phones the bordered pill +
              tooltip carry the meaning. */}
          <span className={cn("hidden shrink-0 sm:inline", compact && "sm:hidden")}>
            {t.modelPicker?.label ?? '模型'}：
          </span>
          {/* Fixed-width name slot: the trigger keeps ONE size no matter which
              model is picked. sm:w-36 (108px at this root font-size) sits just
              past the longest label in the lineup ("Gemini 3 Flash Preview"
              ≈105px) — resize this if a longer label joins, or it truncates.
              Below sm a narrower slot truncates long names so the header strip
              survives the signed-in button set on a phone. The slot may still
              shrink (flex) when the host row is genuinely tight. */}
          <span
            title={effectiveLabel}
            className={cn(
              "truncate text-left font-medium text-foreground",
              compact ? "max-w-[12rem]" : "w-32 sm:w-36",
            )}
          >
            {effectiveLabel}
          </span>
          {agentModeActive && modelUsesStandardChat(effectiveModelId) ? (
            <span className="hidden shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[0.5625rem] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300 sm:inline">
              {t.modelPicker.standardChatMode}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[60vh] w-64 overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[0.6875rem] font-normal text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((entry) => {
              const definition = getModelDefinition(entry.id)
              const lockedByAgent = false
              const usesStandardChat = agentModeActive && modelUsesStandardChat(entry.id)
              const configureRequired = entry.isLocked
                && (entry.configureInSettings || modelRequiresUserKey(entry.id))
                && definition?.status !== 'disabled'
                && !lockedByAgent
              const locked = entry.isLocked || lockedByAgent
              return (
                <DropdownMenuItem
                  key={entry.id}
                  disabled={locked && !configureRequired}
                  onClick={() => {
                    if (configureRequired) {
                      setActiveTab('settings', 'ai')
                      return
                    }
                    handleSelectModel(entry.id)
                  }}
                  data-testid={configureRequired ? `model-picker-key-link-${entry.id}` : undefined}
                  aria-label={configureRequired ? `${entry.label}，${entry.configureInSettings ? t.modelPicker.configureEndpoint : t.modelPicker.configureApiKey}` : undefined}
                  title={configureRequired
                    ? (entry.configureInSettings ? t.modelPicker.configureEndpoint : t.modelPicker.configureApiKey)
                    : usesStandardChat
                      ? t.modelPicker.standardChatDescription
                      : undefined}
                  className={cn(
                    "cursor-pointer gap-2 text-xs",
                    configureRequired && "text-muted-foreground focus:bg-primary/10 focus:text-muted-foreground",
                  )}
                >
                  <span
                    title={entry.label}
                    className={cn(
                      "min-w-0 flex-1",
                      definition?.provider === 'custom'
                        ? "whitespace-normal break-words"
                        : "truncate",
                    )}
                  >
                    {entry.label}
                  </span>
                  {usesStandardChat && !configureRequired ? (
                    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[0.5625rem] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      {t.modelPicker.standardChatMode}
                    </span>
                  ) : null}
                  {configureRequired ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">
                      <Lock
                        className="h-3 w-3 text-muted-foreground"
                        data-testid={`model-picker-key-lock-${entry.id}`}
                      />
                      {entry.configureInSettings ? t.modelPicker.configureEndpoint : t.modelPicker.configureApiKey}
                      <ChevronRight className="h-3 w-3 text-primary" />
                    </span>
                  ) : locked ? (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  ) : effectiveModelId === entry.id ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
            {group.custom ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={customProfileCount >= MAX_OPENAI_COMPATIBLE_PROFILES}
                  onClick={() => setActiveTab(
                    'settings',
                    'ai',
                    'openai-compatible-add-profile',
                  )}
                  data-testid="model-picker-add-custom-model"
                  title={customProfileCount >= MAX_OPENAI_COMPATIBLE_PROFILES
                    ? t.settings.openAiCompatibleProfileLimit
                    : t.modelPicker.addCustomModel}
                  className="cursor-pointer gap-2 text-xs font-medium text-primary focus:bg-primary/10 focus:text-primary"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {t.modelPicker.addCustomModel}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0" />
                </DropdownMenuItem>
              </>
            ) : null}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
