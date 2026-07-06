// API-key settings. Model picking moved in-panel (shared ModelPicker in each
// AI feature) — Settings now only manages provider keys + persistence.
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { useModelPrefsStore } from "@/src/application/stores/model-prefs.store"
import { useSummaryPrefsStore } from "@/src/application/hooks/medical-summary/use-medical-summary.hook"
import { useSafetyPrefsStore } from "@/src/application/hooks/safety-alerts/use-safety-alerts.hook"
import { isUsableApiKey } from "@/src/shared/utils/api-key.utils"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { getModelDefinition, type ModelProvider } from "@/src/shared/constants/ai-models.constants"
import { ApiKeyInput } from './ApiKeyInput'
import { AuthStatus } from '@/features/auth'

export function ModelAndKeySettings() {
  const { t } = useLanguage()
  const apiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const perplexityKey = useAiConfigStore((state) => state.perplexityKey)
  const claudeKey = useAiConfigStore((state) => state.claudeKey)
  const setApiKey = useAiConfigStore((state) => state.setApiKey)
  const setGeminiKey = useAiConfigStore((state) => state.setGeminiKey)
  const setPerplexityKey = useAiConfigStore((state) => state.setPerplexityKey)
  const setClaudeKey = useAiConfigStore((state) => state.setClaudeKey)
  const storageType = useAiConfigStore((state) => state.storageType)
  const setStorageType = useAiConfigStore((state) => state.setStorageType)
  const [openAiValue, setOpenAiValue] = useState(apiKey)
  const [geminiValue, setGeminiValue] = useState(geminiKey)
  const [perplexityValue, setPerplexityValue] = useState(perplexityKey)
  const [claudeValue, setClaudeValue] = useState(claudeKey)

  useEffect(() => {
    setOpenAiValue(apiKey)
  }, [apiKey])

  useEffect(() => {
    setGeminiValue(geminiKey)
  }, [geminiKey])

  useEffect(() => {
    setPerplexityValue(perplexityKey)
  }, [perplexityKey])

  useEffect(() => {
    setClaudeValue(claudeKey)
  }, [claudeKey])

  // Reject a non-empty value that isn't header-safe (e.g. pasted text/Chinese) —
  // it would crash the provider SDK's Headers construction. Returns true if bad.
  const rejectIfInvalidKey = (value: string | null | undefined): boolean => {
    if (value && value.trim() && !isUsableApiKey(value)) {
      toast.error(t.settings.invalidApiKey ?? "API 金鑰格式不正確（含非 ASCII 字元），請確認貼上的是金鑰")
      return true
    }
    return false
  }

  const handleSaveOpenAiKey = async () => {
    if (!openAiValue || rejectIfInvalidKey(openAiValue)) return
    setApiKey(openAiValue.trim())
  }

  // Model prefs live per feature now (chat / insights / medical-summary /
  // safety-alerts) and are key-gated at read time — removing a key silently
  // lands every stranded premium pick on that feature's free default. If any
  // pref would be stranded by clearing this provider's key, tell the user.
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
      return def?.provider === provider && def.requiresUserKey
    })
    if (strandsAPick) {
      toast.info(t.settings.modelDowngradedToFree)
    }
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

  const handleSavePerplexityKey = async () => {
    if (!perplexityValue || rejectIfInvalidKey(perplexityValue)) return
    setPerplexityKey(perplexityValue.trim())
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

  const handleClearPerplexityKey = () => {
    setPerplexityValue("")
    setPerplexityKey(null)
  }

  return (
    <div className="space-y-6">
      {/* Models are picked where they're used (chat / insights / summary
          headers) — point users there instead of a global grid. */}
      <p className="text-xs text-muted-foreground">{t.settings.modelsMovedNote}</p>

      {/* Authentication Status - Free Quota */}
      <AuthStatus />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t.common.or || '或'}
          </span>
        </div>
      </div>

      {/* Persistence toggle — keys default to session-only (cleared when the
          window closes) for shared-workstation safety. This was the missing
          piece behind "my saved key disappeared on reopen": there was no way
          to opt into persistence. Flipping it migrates any saved keys via
          setStorageType. */}
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="remember-keys" className="text-sm font-medium">
            {t.settings.rememberKeyOnDevice}
          </Label>
          <p className="text-xs text-muted-foreground">{t.settings.rememberKeyHint}</p>
        </div>
        <Switch
          id="remember-keys"
          className="shrink-0"
          checked={storageType === 'localStorage'}
          onCheckedChange={(checked) =>
            setStorageType(checked ? 'localStorage' : 'sessionStorage')
          }
        />
      </div>

      {/* OpenAI API Key */}
      <ApiKeyInput
        id="openai-key"
        label={t.settings.personalOpenAiKey}
        placeholder="sk-..."
        value={openAiValue || ''}
        onChange={setOpenAiValue}
        onSave={handleSaveOpenAiKey}
        onClear={handleClearOpenAiKey}
        helpText={t.settings.openAiKeyHelp}
        clearWarning={t.settings.clearOpenAiKeyWarning}
      />

      {/* Gemini API Key */}
      <ApiKeyInput
        id="gemini-key"
        label={t.settings.personalGeminiKey}
        placeholder="AIza..."
        value={geminiValue || ''}
        onChange={setGeminiValue}
        onSave={handleSaveGeminiKey}
        onClear={handleClearGeminiKey}
        helpText={t.settings.geminiKeyHelp}
        clearWarning={t.settings.clearGeminiKeyWarning}
      />

      {/* Claude API Key */}
      <ApiKeyInput
        id="claude-key"
        label={t.settings.personalClaudeKey}
        placeholder="sk-ant-..."
        value={claudeValue || ''}
        onChange={setClaudeValue}
        onSave={handleSaveClaudeKey}
        onClear={handleClearClaudeKey}
        helpText={t.settings.claudeKeyHelp}
        clearWarning={t.settings.clearClaudeKeyWarning}
      />

      {/* Perplexity API Key */}
      <ApiKeyInput
        id="perplexity-key"
        label={t.settings.personalPerplexityKey}
        placeholder="pplx-..."
        value={perplexityValue || ''}
        onChange={setPerplexityValue}
        onSave={handleSavePerplexityKey}
        onClear={handleClearPerplexityKey}
        helpText={t.settings.perplexityKeyHelp}
        clearWarning={t.settings.clearPerplexityKeyWarning}
      />
    </div>
  )
}
