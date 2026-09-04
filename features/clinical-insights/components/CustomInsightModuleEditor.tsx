// Custom Summary Module Editor
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  Lock,
  Maximize2,
  Share2,
  Trash2,
  Zap,
} from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { LoginRequiredDialog } from "@/features/prompt-gallery/components/LoginRequiredDialog"
import type {
  InsightLanguagePolicy,
  InsightOutputFormat,
} from "@/src/shared/constants/clinical-insights.constants"

interface InsightPanel {
  id: string
  title: string
  prompt: string
  showInSummary: boolean
  autoGenerate: boolean
  outputFormat: InsightOutputFormat
  languagePolicy: InsightLanguagePolicy
}

interface CustomInsightModuleEditorProps {
  panel: InsightPanel
  index: number
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  summaryModuleCount: number
  autoModuleCount: number
  maxSummaryModules: number
  maxAutoModules: number
  onUpdate: (id: string, updates: Partial<InsightPanel>) => void
  onUpdateAndSave?: (id: string, updates: Partial<InsightPanel>) => Promise<void>
  onRemove: (id: string) => void
  onMove: (id: string, direction: "up" | "down") => void
  onShare?: (panel: InsightPanel) => void
}

export function CustomInsightModuleEditor({
  panel,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  summaryModuleCount,
  autoModuleCount,
  maxSummaryModules,
  maxAutoModules,
  onUpdate,
  onUpdateAndSave,
  onRemove,
  onMove,
  onShare,
}: CustomInsightModuleEditorProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showPromptEditor, setShowPromptEditor] = useState(false)

  const persistToggle = (updates: Partial<InsightPanel>) => {
    if (onUpdateAndSave) void onUpdateAndSave(panel.id, updates)
    else onUpdate(panel.id, updates)
  }

  const handleShare = () => {
    if (!user) {
      setShowLoginDialog(true)
      return
    }
    onShare?.(panel)
  }

  const showDisabled = !panel.showInSummary && summaryModuleCount >= maxSummaryModules
  const autoDisabled = !panel.showInSummary || (!panel.autoGenerate && autoModuleCount >= maxAutoModules)
  const outputFormatLabel = panel.outputFormat === "plain-text"
    ? t.settings.outputFormatPlain
    : panel.outputFormat === "html"
      ? t.settings.outputFormatHtml
      : t.settings.outputFormatMarkdown
  const outputLanguageLabel = panel.languagePolicy === "follow-template"
    ? t.settings.outputLanguageFollowTemplate
    : t.settings.outputLanguageInterface

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{panel.title || `${t.settings.tab} ${index + 1}`}</p>
            {panel.showInSummary ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.625rem] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                {t.settings.showInMedicalSummary}
              </span>
            ) : null}
            {panel.autoGenerate ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {t.settings.autoGenerateInsights}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{t.settings.tab} {index + 1}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onMove(panel.id, "up")}
            disabled={!canMoveUp}
            aria-label={t.settings.moveUp}
            title={t.settings.moveUp}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onMove(panel.id, "down")}
            disabled={!canMoveDown}
            aria-label={t.settings.moveDown}
            title={t.settings.moveDown}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          {onShare ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleShare}
              data-tour="custom-summary-share"
              aria-label={t.promptGallery?.sharePrompt || "Share"}
              title={t.promptGallery?.sharePrompt || "Share"}
            >
              {user ? <Share2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRemove(panel.id)}
              aria-label={t.settings.remove}
              title={t.settings.remove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div data-tour="custom-summary-fields" className="space-y-4">
          <div className="grid gap-1.5">
            <label htmlFor={`module-name-${panel.id}`} className="text-xs font-medium text-foreground">
              {t.settings.tabLabel}
            </label>
            <Input
              id={`module-name-${panel.id}`}
              value={panel.title}
              onChange={(event) => onUpdate(panel.id, { title: event.target.value })}
              placeholder={t.settings.tabLabelPlaceholder}
              className="h-9"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <label htmlFor={`module-output-format-${panel.id}`} className="text-xs font-medium text-foreground">
                {t.settings.outputFormat}
              </label>
              <Select
                value={panel.outputFormat}
                onValueChange={(value) => onUpdate(panel.id, { outputFormat: value as InsightOutputFormat })}
              >
                <SelectTrigger id={`module-output-format-${panel.id}`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain-text">{t.settings.outputFormatPlain}</SelectItem>
                  <SelectItem value="markdown">{t.settings.outputFormatMarkdown}</SelectItem>
                  <SelectItem value="html">{t.settings.outputFormatHtml}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                {panel.outputFormat === "plain-text"
                  ? t.settings.outputFormatPlainDesc
                  : panel.outputFormat === "html"
                    ? t.settings.outputFormatHtmlDesc
                    : t.settings.outputFormatMarkdownDesc}
              </p>
            </div>

            <div className="grid content-start gap-1.5">
              <label htmlFor={`module-language-policy-${panel.id}`} className="text-xs font-medium text-foreground">
                {t.settings.outputLanguage}
              </label>
              <Select
                value={panel.languagePolicy}
                onValueChange={(value) => onUpdate(panel.id, { languagePolicy: value as InsightLanguagePolicy })}
              >
                <SelectTrigger id={`module-language-policy-${panel.id}`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow-template">{t.settings.outputLanguageFollowTemplate}</SelectItem>
                  <SelectItem value="interface-language">{t.settings.outputLanguageInterface}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                {panel.languagePolicy === "follow-template"
                  ? t.settings.outputLanguageFollowTemplateDesc
                  : t.settings.outputLanguageInterfaceDesc}
              </p>
            </div>
          </div>
        </div>

        <div data-tour="custom-summary-behavior" className="overflow-hidden rounded-lg border bg-muted/10">
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              <Eye className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor={`show-in-summary-${panel.id}`} className="cursor-pointer text-xs font-semibold text-foreground">
                {t.settings.showInMedicalSummary}
              </label>
              <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground">{t.settings.showInMedicalSummaryDesc}</p>
            </div>
            <Switch
              id={`show-in-summary-${panel.id}`}
              checked={panel.showInSummary}
              disabled={showDisabled}
              onCheckedChange={(checked) => persistToggle({ showInSummary: checked })}
              aria-label={t.settings.showInMedicalSummary}
            />
          </div>

          <div className="border-t" />

          <div className="flex items-center gap-3 px-3 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor={`auto-generate-${panel.id}`} className="cursor-pointer text-xs font-semibold text-foreground">
                {t.settings.autoGenerateInsights}
              </label>
              <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground">{t.settings.autoGenerateDesc}</p>
            </div>
            <Switch
              id={`auto-generate-${panel.id}`}
              checked={panel.autoGenerate}
              disabled={autoDisabled}
              onCheckedChange={(checked) => persistToggle({ autoGenerate: checked })}
              aria-label={t.settings.autoGenerateInsights}
            />
          </div>
        </div>

        <div data-tour="custom-summary-prompt" className="grid gap-1.5 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`module-prompt-${panel.id}`} className="text-xs font-medium text-foreground">
              {t.settings.prompt}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
                {panel.prompt.length} {t.clinicalInsights.chars}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 gap-1.5 px-2 text-xs sm:h-8"
                onClick={() => setShowPromptEditor(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t.settings.expandPromptEditor}
              </Button>
            </div>
          </div>
          <Textarea
            id={`module-prompt-${panel.id}`}
            value={panel.prompt}
            onChange={(event) => onUpdate(panel.id, { prompt: event.target.value })}
            className="h-64 min-h-48 max-h-[40vh] field-sizing-fixed resize-y overflow-y-auto text-sm leading-relaxed max-md:h-48 max-md:resize-none"
            placeholder={t.settings.promptPlaceholderInsight}
          />
        </div>
      </div>

      <LoginRequiredDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
      <Dialog open={showPromptEditor} onOpenChange={setShowPromptEditor}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(90vh,54rem)] sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg sm:border"
        >
          <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 shrink-0 gap-1.5 px-2 sm:h-8"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t.settings.backToTemplate}
              </Button>
            </DialogClose>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm sm:text-base">
                {t.settings.promptEditorTitle}: {panel.title}
              </DialogTitle>
              <DialogDescription className="mt-1 truncate text-xs">
                {panel.prompt.length} {t.clinicalInsights.chars} · {outputFormatLabel} · {outputLanguageLabel}
              </DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3 sm:p-4">
            <Textarea
              aria-label={`${t.settings.promptEditorTitle}: ${panel.title}`}
              value={panel.prompt}
              onChange={(event) => onUpdate(panel.id, { prompt: event.target.value })}
              className="h-full min-h-0 max-h-none field-sizing-fixed resize-none overflow-y-auto text-sm leading-relaxed"
              placeholder={t.settings.promptPlaceholderInsight}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
