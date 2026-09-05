"use client"

import { useRef } from "react"
import { Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { InsightOutputFormat } from "@/src/shared/constants/clinical-insights.constants"
import { InsightContentRenderer } from "@/features/clinical-insights/components/InsightContentRenderer"
import type {
  ActiveInsightGeneration,
  InsightGenerationMetadata,
} from "@/features/clinical-insights/types"
import { CustomInsightGenerationMeta } from "./CustomInsightGenerationMeta"

interface CustomInsightDetailDialogProps {
  title: string
  content: string
  format: InsightOutputFormat
  contentKind: "prompt" | "result"
  metadata?: InsightGenerationMetadata | null
  activeGeneration?: ActiveInsightGeneration
}

export function CustomInsightDetailDialog({
  title,
  content,
  format,
  contentKind,
  metadata,
  activeGeneration,
}: CustomInsightDetailDialogProps) {
  const { locale, t } = useLanguage()
  const labels = t.medicalSummary
  const showingPrompt = contentKind === "prompt"
  const promptTriggerTemplate = labels.customOpenPrompt
    ?? (locale === "en"
      ? "Open {title} prompt in expanded view"
      : "放大查看「{title}」提示內容")
  const triggerLabel = (showingPrompt ? promptTriggerTemplate : labels.customOpenResult)
    .replace("{title}", title)
  const contentKindLabel = showingPrompt
    ? (labels.customPromptPreview ?? (locale === "en" ? "Template prompt" : "模板提示"))
    : (labels.customResultPreview ?? (locale === "en" ? "Summary result" : "摘要結果"))
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          data-tour="custom-summary-open-result"
          data-result-available={showingPrompt ? "false" : "true"}
          className="pointer-events-auto h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8"
          title={triggerLabel}
          aria-label={triggerLabel}
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
        className="flex max-h-[90vh] flex-col gap-0 p-0 max-md:[&_[data-slot=dialog-close]]:min-h-[48px] max-md:[&_[data-slot=dialog-close]]:min-w-[48px] sm:max-w-[min(90vw,1100px)]"
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle className="min-w-0 break-words text-left leading-snug">
            {title}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {contentKindLabel}
          </p>
          {!showingPrompt ? (
            <CustomInsightGenerationMeta
              metadata={metadata}
              activeGeneration={activeGeneration}
            />
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto w-full max-w-4xl text-sm leading-relaxed text-foreground">
            <InsightContentRenderer content={content} format={format} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
