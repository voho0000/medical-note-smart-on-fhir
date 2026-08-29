'use client'

import { useMemo, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useModelSelection, type ModelEntry } from '@/src/application/hooks/useModelSelection'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import {
  REPORT_INTERPRETATION_CUSTOM_PROMPT_MAX_LENGTH,
  defaultReportInterpretationPrompt,
  resolveReportInterpretationModel,
  resolveReportInterpretationPrompt,
  useReportInterpretationPrefsStore,
} from '@/src/application/stores/report-interpretation-prefs.store'
import { getModelDefinition } from '@/src/shared/constants/ai-models.constants'

interface ModelGroup {
  label: string
  entries: ModelEntry[]
}

export function ReportInterpretationSettings() {
  const { t, locale } = useLanguage()
  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()
  const modelId = useReportInterpretationPrefsStore((state) => state.modelId)
  const customPrompt = useReportInterpretationPrefsStore((state) => state.customPrompt)
  const setModelId = useReportInterpretationPrefsStore((state) => state.setModelId)
  const setCustomPrompt = useReportInterpretationPrefsStore((state) => state.setCustomPrompt)
  const reset = useReportInterpretationPrefsStore((state) => state.reset)
  const currentPrompt = resolveReportInterpretationPrompt(customPrompt, locale)
  const defaultPrompt = defaultReportInterpretationPrompt(locale)
  const [promptDraftState, setPromptDraftState] = useState({
    locale,
    value: currentPrompt,
  })
  const promptDraft = promptDraftState.locale === locale
    ? promptDraftState.value
    : currentPrompt

  const effectiveModelId = resolveReportInterpretationModel(modelId, {
    openAiKey: apiKey,
    geminiKey,
    claudeKey,
  })
  const {
    gptModels,
    geminiModels,
    claudeModels,
    customModels,
    handleSelectModel,
    getModelStatus,
  } = useModelSelection(
    apiKey,
    geminiKey,
    claudeKey,
    modelId,
    setModelId,
  )
  const groups = useMemo<ModelGroup[]>(() => [
    { label: t.settings.openAiCompatibleGroupLabel, entries: customModels },
    { label: 'Gemini', entries: geminiModels },
    { label: 'GPT', entries: gptModels },
    { label: 'Claude', entries: claudeModels },
  ], [
    claudeModels,
    customModels,
    geminiModels,
    gptModels,
    t.settings.openAiCompatibleGroupLabel,
  ])
  const effectiveDefinition = getModelDefinition(effectiveModelId)
  const effectiveStatus = effectiveDefinition ? getModelStatus(effectiveDefinition) : ''
  const normalizedDraft = promptDraft.trim()
  const promptDirty = normalizedDraft !== currentPrompt

  const savePrompt = () => {
    const nextPrompt = normalizedDraft || defaultPrompt
    setCustomPrompt(nextPrompt === defaultPrompt ? '' : nextPrompt)
    setPromptDraftState({ locale, value: nextPrompt })
    toast.success(t.settings.reportInterpretationPromptSaved)
  }

  const resetPreferences = () => {
    reset()
    setPromptDraftState({ locale, value: defaultPrompt })
    toast.success(t.settings.reportInterpretationDefaultsRestored)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="report-interpretation-model" className="text-sm font-medium">
          {t.settings.reportInterpretationModel}
        </Label>
        <Select value={effectiveModelId} onValueChange={handleSelectModel}>
          <SelectTrigger
            id="report-interpretation-model"
            className="h-11 w-full"
            aria-describedby="report-interpretation-model-help report-interpretation-model-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.entries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id} disabled={entry.isLocked}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p id="report-interpretation-model-help" className="text-xs leading-relaxed text-muted-foreground">
          {t.settings.reportInterpretationModelHelp}
        </p>
        {effectiveStatus ? (
          <p id="report-interpretation-model-status" className="text-xs text-muted-foreground">
            {effectiveStatus}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="report-interpretation-custom-prompt" className="text-sm font-medium">
            {t.settings.reportInterpretationPrompt}
          </Label>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {promptDraft.length} / {REPORT_INTERPRETATION_CUSTOM_PROMPT_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="report-interpretation-custom-prompt"
          value={promptDraft}
          onChange={(event) => setPromptDraftState({
            locale,
            value: event.target.value,
          })}
          maxLength={REPORT_INTERPRETATION_CUSTOM_PROMPT_MAX_LENGTH}
          placeholder={t.settings.reportInterpretationPromptPlaceholder}
          aria-describedby="report-interpretation-prompt-help"
          className="min-h-[144px] resize-y text-sm leading-relaxed"
        />
        <p id="report-interpretation-prompt-help" className="text-xs leading-relaxed text-muted-foreground">
          {t.settings.reportInterpretationPromptHelp}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={resetPreferences}
          className="min-h-11 gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {t.settings.reportInterpretationReset}
        </Button>
        <Button
          type="button"
          onClick={savePrompt}
          disabled={!promptDirty}
          className="min-h-11 gap-2"
        >
          <Save className="h-4 w-4" />
          {t.settings.reportInterpretationSavePrompt}
        </Button>
      </div>
    </div>
  )
}
