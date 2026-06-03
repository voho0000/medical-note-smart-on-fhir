// Unified Feature Card Wrapper Component
import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeleton } from './LoadingSkeleton'
import { ErrorMessage } from './ErrorMessage'
import { EmptyState } from './EmptyState'
import { FEATURE_CARD_THEMES, UI_COLORS } from '@/src/shared/config/ui-theme.config'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  /** Card header text. Pass empty string / undefined to render without a
   *  header — the content area then sits flush with the top border. */
  title?: string
  featureId?: string // Used to look up theme from FEATURE_CARD_THEMES
  icon?: LucideIcon // Optional custom icon override
  colorKey?: keyof typeof UI_COLORS // Optional custom color override
  isLoading?: boolean
  error?: Error | null
  isEmpty?: boolean
  emptyMessage?: string
  children: ReactNode
}

export function FeatureCard({
  title,
  featureId,
  icon: customIcon,
  colorKey: customColorKey,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No data available",
  children
}: FeatureCardProps) {
  // Get theme from registry or use defaults
  const theme = featureId ? FEATURE_CARD_THEMES[featureId] : null
  const Icon = customIcon || theme?.icon
  const colorKey = customColorKey || theme?.colorKey || 'clinical'
  const borderColor = UI_COLORS[colorKey].light.border
  const hasTitle = !!title

  return (
    // Base Card is `flex flex-col gap-6 py-6` (shadcn). That 24px flex-gap +
    // 24px vertical padding makes the title↔content spacing feel too airy for
    // dense clinical cards, so tighten both here — this is the single shared
    // wrapper every feature card renders through, so the change applies
    // uniformly. twMerge lets gap-3/py-4 override the base gap-6/py-6.
    <Card className={`border-l-4 ${borderColor} gap-2 py-4`}>
      {hasTitle && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent>
        {isLoading && <LoadingSkeleton />}
        {!isLoading && error && <ErrorMessage error={error} context={(title ?? featureId ?? '').toLowerCase()} />}
        {!isLoading && !error && isEmpty && <EmptyState message={emptyMessage} />}
        {!isLoading && !error && !isEmpty && children}
      </CardContent>
    </Card>
  )
}
