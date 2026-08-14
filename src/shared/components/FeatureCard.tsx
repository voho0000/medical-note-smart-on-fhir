// Unified Feature Card Wrapper Component
import { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  headerAction?: ReactNode
  children: ReactNode
}

export function FeatureCard({
  title,
  featureId,
  icon: customIcon,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No data available",
  headerAction,
  children
}: FeatureCardProps) {
  // Get theme from registry or use defaults
  const theme = featureId ? FEATURE_CARD_THEMES[featureId] : null
  const Icon = customIcon || theme?.icon
  const hasTitle = !!title

  return (
  // Base Card is `flex flex-col gap-6 py-6` (shadcn). That 24px flex-gap +
  // 24px vertical padding makes the title↔content spacing feel too airy for
  // dense clinical cards, so tighten both here — this is the single shared
  // wrapper every feature card renders through, so the change applies
  // uniformly. A neutral boundary replaces per-feature accent stripes:
  // clinical color is reserved for status, severity, and selected state.
    <Card className="gap-2 rounded-lg border-border bg-card py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)] hover:shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:shadow-none dark:hover:shadow-none">
      {hasTitle && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span
              data-slot="clinical-section-marker"
              aria-hidden="true"
              className="h-4 w-0.5 shrink-0 rounded-sm bg-primary/70"
            />
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </CardTitle>
          {headerAction && <CardAction>{headerAction}</CardAction>}
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
