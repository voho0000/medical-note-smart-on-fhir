import { Globe2, LockKeyhole } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/src/application/providers/language.provider'

export function PromptVisibilityBadge({ isPublic }: { isPublic?: boolean }) {
  const { t } = useLanguage()
  const visibleToEveryone = isPublic !== false
  const Icon = visibleToEveryone ? Globe2 : LockKeyhole

  return (
    <Badge
      variant={visibleToEveryone ? 'outline' : 'secondary'}
      className="h-4 shrink-0 gap-1 px-1.5 py-0 text-[0.5625rem] font-normal"
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {visibleToEveryone ? t.promptGallery.publicVisibility : t.promptGallery.privateVisibility}
    </Badge>
  )
}
