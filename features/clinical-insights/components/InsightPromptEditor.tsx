// Insight Prompt Editor Component
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Maximize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"

interface InsightPromptEditorProps {
  prompt: string
  onPromptChange: (value: string) => void
  onExpand: () => void
  onManageInsights: () => void
}

export function InsightPromptEditor({
  prompt,
  onPromptChange,
  onExpand,
  onManageInsights,
}: InsightPromptEditorProps) {
  const { t } = useLanguage()

  return (
    <Collapsible defaultOpen={false} className="space-y-1">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between px-2 text-xs font-medium">
          <span>{t.clinicalInsights.editPrompt}</span>
          <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        <div className="relative">
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-[88px] resize-vertical text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpand}
            className="absolute top-2 right-2 h-7 w-7 p-0 opacity-60 hover:opacity-100"
            title={t.common.maximize}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            💡 {t.clinicalInsights.temporaryEditHint || "這是臨時修改，不會被保存。"}
            <button
              onClick={onManageInsights}
              className="ml-1 text-amber-900 dark:text-amber-100 underline hover:no-underline font-medium"
            >
              {t.clinicalInsights.goToSettings || "前往 Settings →"}
            </button>
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
