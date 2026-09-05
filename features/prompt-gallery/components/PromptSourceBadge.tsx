import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PromptSource } from '../types/prompt.types'

/** Secondary source marker (FR-05): who a prompt belongs to, not who may edit it. */
export function PromptSourceBadge({ source, className }: { source: PromptSource; className?: string }) {
  const { t } = useLanguage()
  if (source === 'mine') {
    return (
      <Badge className={cn('h-4 shrink-0 border-0 bg-emerald-100 px-1.5 py-0 text-[0.5625rem] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', className)}>
        {t.promptGallery.sourceMine}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn('h-4 shrink-0 px-1.5 py-0 text-[0.5625rem] font-medium text-muted-foreground', className)}>
      {source === 'system' ? t.promptGallery.sourceSystem : t.promptGallery.sourceShared}
    </Badge>
  )
}
