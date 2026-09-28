import { AlertTriangle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { CUSTOM_MODEL_PROMPT_REVIEW_CHARACTERS } from "@/src/shared/constants/clinical-insights.constants"

interface LongCustomInsightPromptNoticeProps {
  prompt: string
  isCustomModel: boolean
  className?: string
}

export function LongCustomInsightPromptNotice({
  prompt,
  isCustomModel,
  className,
}: LongCustomInsightPromptNoticeProps) {
  const { t } = useLanguage()
  if (!isCustomModel || prompt.length < CUSTOM_MODEL_PROMPT_REVIEW_CHARACTERS) return null

  return (
    <p role="status" className={`flex items-start gap-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300 ${className ?? ""}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {t.settings.longCustomInsightPromptWarning.replace("{count}", String(prompt.length))}
      </span>
    </p>
  )
}
