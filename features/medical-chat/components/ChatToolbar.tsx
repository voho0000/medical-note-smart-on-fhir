"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useModelPref, MODEL_PREF_DEFAULTS } from "@/src/application/stores/model-prefs.store"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import { Bug, ChevronDown, FileText, Library, ShieldOff, SlidersHorizontal } from "lucide-react"
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react"

interface Template {
  id: string
  label: string
  content: string
  shortcut?: string
}

interface ChatToolbarProps {
  onInsertTemplate: () => void
  templates: Template[]
  selectedTemplateId?: string
  onTemplateChange: (id: string) => void
  hasTemplateContent: boolean
  onOpenGallery?: () => void
  onManageTemplates: () => void
  /** MedicalChat owns the privacy boundary around model changes. Keeping the
   * picker callback outside this toolbar prevents fullscreen mode from
   * bypassing the abort/reset performed by the header picker. */
  onModelSelect: (id: string) => void
  /** The picker normally lives in the chat header strip (this toolbar is
   *  cramped); the fullscreen overlay has no header strip, so only there
   *  does the toolbar host it. */
  showModelPicker?: boolean
  patientDataDisabled: boolean
  canTogglePatientData: boolean
  patientDataToggleDisabled?: boolean
  onTogglePatientData: () => void
  onOpenAiExecution: () => void
  canExportAiExecution: boolean
}

export function ChatToolbar({
  onInsertTemplate,
  templates,
  selectedTemplateId,
  onTemplateChange,
  hasTemplateContent,
  onOpenGallery,
  onManageTemplates,
  onModelSelect,
  showModelPicker = false,
  patientDataDisabled,
  canTogglePatientData,
  patientDataToggleDisabled = false,
  onTogglePatientData,
  onOpenAiExecution,
  canExportAiExecution,
}: ChatToolbarProps) {
  const { t } = useLanguage()
  const chatModelPref = useModelPref('chat')
  const [patientDataHelpOpen, setPatientDataHelpOpen] = useState(false)
  const patientDataLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patientDataLongPressTriggeredRef = useRef(false)

  const clearPatientDataLongPressTimer = () => {
    if (patientDataLongPressTimerRef.current) {
      clearTimeout(patientDataLongPressTimerRef.current)
      patientDataLongPressTimerRef.current = null
    }
  }

  useEffect(() => () => {
    if (patientDataLongPressTimerRef.current) {
      clearTimeout(patientDataLongPressTimerRef.current)
    }
  }, [])

  const handlePatientDataPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch' || patientDataToggleDisabled) return
    clearPatientDataLongPressTimer()
    patientDataLongPressTriggeredRef.current = false
    patientDataLongPressTimerRef.current = setTimeout(() => {
      patientDataLongPressTriggeredRef.current = true
      setPatientDataHelpOpen(true)
    }, 550)
  }

  const handlePatientDataClick = (event: MouseEvent<HTMLButtonElement>) => {
    clearPatientDataLongPressTimer()
    if (patientDataLongPressTriggeredRef.current) {
      event.preventDefault()
      patientDataLongPressTriggeredRef.current = false
      return
    }
    onTogglePatientData()
  }

  const handleOpenGallery = () => {
    if (onOpenGallery) {
      onOpenGallery()
    }
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)
  const selectedTemplateLabel = selectedTemplate?.label || t.chat.insertTemplate
  const insertTemplateLabel = `${t.chat.insertTemplate}：${selectedTemplateLabel}`

  return (
    <div
      data-tour="chat-template-tools"
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-1 md:flex md:gap-1.5"
    >
      {templates.length > 0 ? (
        <div className="flex h-9 min-w-0 w-full items-stretch overflow-hidden rounded-lg border bg-background md:flex-1 sm:max-w-[14rem]">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            data-testid="chat-template-insert"
            aria-label={insertTemplateLabel}
            title={insertTemplateLabel}
            className="h-full min-w-0 flex-1 justify-start gap-1 rounded-none px-2 text-xs font-medium hover:bg-accent md:gap-2 md:px-2.5"
          >
            <FileText className="h-4 w-4 shrink-0 text-primary max-md:hidden" />
            <span className="min-w-0 flex-1 truncate text-left">{selectedTemplateLabel}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                data-testid="chat-template-menu"
                aria-label={t.chat.selectTemplate}
                title={t.chat.selectTemplate}
                className="h-full w-8 shrink-0 rounded-none border-l bg-muted/30 hover:bg-accent md:w-9"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuRadioGroup value={selectedTemplateId} onValueChange={onTemplateChange}>
                {templates.map((template) => (
                  <DropdownMenuRadioItem key={template.id} value={template.id} className="cursor-pointer">
                    <span className="min-w-0 flex-1 truncate">{template.label}</span>
                    {template.shortcut ? (
                      <DropdownMenuShortcut className="font-mono tracking-normal">
                        /{template.shortcut}
                      </DropdownMenuShortcut>
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {onOpenGallery && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenGallery}
          data-testid="chat-template-gallery"
          aria-label={t.promptGallery.browseGallery}
          title={t.promptGallery.browseGallery}
          className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
        >
          <Library className="h-4 w-4 text-primary" />
          <span className="hidden xl:inline">{t.chat.templateGallery}</span>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onManageTemplates}
        data-testid="chat-template-manage"
        aria-label={t.chat.manageTemplates}
        title={t.chat.manageTemplates}
        className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden xl:inline">{t.chat.manageTemplates}</span>
      </Button>
      {canTogglePatientData && (
        <Tooltip
          open={patientDataHelpOpen}
          onOpenChange={setPatientDataHelpOpen}
          delayDuration={150}
        >
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handlePatientDataClick}
              onPointerDown={handlePatientDataPointerDown}
              onPointerUp={clearPatientDataLongPressTimer}
              onPointerCancel={clearPatientDataLongPressTimer}
              onPointerLeave={clearPatientDataLongPressTimer}
              onContextMenu={(event) => event.preventDefault()}
              disabled={patientDataToggleDisabled}
              data-testid="chat-patient-data-toggle"
              aria-label={t.chat.patientDataOff}
              aria-pressed={patientDataDisabled}
              title={patientDataDisabled
                ? t.chat.patientDataOffDisable
                : t.chat.patientDataOffEnable}
              className={`h-7 max-md:h-11 [html[data-keyboard-open=true]_&]:hidden shrink-0 rounded-full px-2 text-[0.6875rem] shadow-none touch-manipulation max-md:px-1.5 ${
                patientDataDisabled
                  ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/15'
                  : 'text-muted-foreground'
              }`}
            >
              <ShieldOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.chat.patientDataOffBadge}</span>
              <span className="sm:hidden">{t.chat.patientDataOffShort}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={6}
            className="max-w-[min(18rem,calc(100vw-1rem))] text-xs leading-relaxed"
            data-testid="chat-patient-data-help"
          >
            {t.chat.patientDataOffExplanation}
          </TooltipContent>
        </Tooltip>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onOpenAiExecution}
        disabled={!canExportAiExecution}
        data-testid="chat-ai-execution-export"
        aria-label={t.chat.exportAiExecution}
        title={canExportAiExecution
          ? t.chat.exportAiExecution
          : t.chat.exportAiExecutionUnavailable}
        className="h-7 w-7 max-md:h-11 max-md:w-11 [html[data-keyboard-open=true]_&]:hidden shrink-0 text-muted-foreground opacity-35 transition-opacity touch-manipulation hover:opacity-100"
      >
        <Bug className="h-3.5 w-3.5" />
      </Button>
      {showModelPicker && (
        <div className="ml-auto flex h-9 shrink-0 items-center">
          <ModelPicker
            modelId={chatModelPref}
            fallbackModelId={MODEL_PREF_DEFAULTS.chat}
            onSelect={onModelSelect}
            tooltip={t.modelPicker.chatTooltip}
            compact
            align="end"
            agentModeActive
          />
        </div>
      )}
    </div>
  )
}
