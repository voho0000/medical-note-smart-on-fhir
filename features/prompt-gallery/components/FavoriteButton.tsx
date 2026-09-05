/**
 * Heart toggle for a gallery prompt (FR-01). State is carried by the icon
 * shape, aria-pressed and the label, never by colour alone, and the fill is
 * the primary blue rather than red so it never reads as a clinical alert.
 */
import { Heart } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'

interface FavoriteButtonProps {
  active: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
  /** Off where the button is the dialog's first focus target, so opening it does not pop a tooltip. */
  tooltip?: boolean
}

export function FavoriteButton({ active, onToggle, disabled, className, tooltip = true }: FavoriteButtonProps) {
  const { t } = useLanguage()
  const label = active ? t.promptGallery.removeFromFavorites : t.promptGallery.addToFavorites
  const button = (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={tooltip ? undefined : label}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      // The host row/card also opens on Enter and Space.
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 max-md:size-11',
        active ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
    >
      <Heart className="h-4 w-4 max-md:h-5 max-md:w-5" fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  )
  if (!tooltip) return button
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
