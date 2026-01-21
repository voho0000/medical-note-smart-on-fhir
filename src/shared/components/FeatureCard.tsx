// Unified Feature Card Wrapper Component
import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeleton } from './LoadingSkeleton'
import { ErrorMessage } from './ErrorMessage'
import { EmptyState } from './EmptyState'
import { FEATURE_CARD_THEMES, UI_COLORS } from '@/src/shared/config/ui-theme.config'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  title: string
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

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingSkeleton />}
        {!isLoading && error && <ErrorMessage error={error} context={title.toLowerCase()} />}
        {!isLoading && !error && isEmpty && <EmptyState message={emptyMessage} />}
        {!isLoading && !error && !isEmpty && children}
      </CardContent>
    </Card>
  )
}
