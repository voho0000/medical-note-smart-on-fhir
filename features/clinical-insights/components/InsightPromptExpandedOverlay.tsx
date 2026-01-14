// Insight Prompt Expanded Overlay Component
import { Textarea } from "@/components/ui/textarea"
import { Minimize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"

interface InsightPromptExpandedOverlayProps {
  title: string
  prompt: string
  onPromptChange: (value: string) => void
  onCollapse: () => void
}

export function InsightPromptExpandedOverlay({
  title,
  prompt,
  onPromptChange,
  onCollapse,
}: InsightPromptExpandedOverlayProps) {
  const { t } = useLanguage()

  return (
    <div 
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col"
      onClick={onCollapse}
    >
      <button
        onClick={onCollapse}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-md"
        title={t.common.minimize}
      >
        <Minimize2 className="h-5 w-5" />
      </button>
      
      <div className="pt-4 px-6 text-center">
        <h2 className="text-lg font-semibold">{title} - {t.clinicalInsights.editPrompt}</h2>
      </div>
      
      <div 
        className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={t.clinicalInsights.promptHelp}
          className="flex-1 resize-none text-sm overflow-y-auto"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t.clinicalInsights.promptHelp}</span>
          <span>{prompt.length} {t.clinicalInsights.chars}</span>
        </div>
      </div>
    </div>
  )
}
