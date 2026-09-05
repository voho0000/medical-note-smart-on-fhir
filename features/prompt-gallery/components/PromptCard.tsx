/**
 * Prompt Card Component
 * Displays a single prompt in the gallery with color-coded types.
 * Used on phone widths; desktop widths use PromptTable.
 */

import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList, Flame, MessageSquare } from 'lucide-react'
import type { SharedPrompt } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { getPromptSource } from '../constants/prompt-source'
import { formatPromptDate } from '../utils/prompt-filter.utils'
import { FavoriteButton } from './FavoriteButton'
import { PromptSourceBadge } from './PromptSourceBadge'

interface PromptCardProps {
  prompt: SharedPrompt
  onPreview: (prompt: SharedPrompt) => void
  currentUserId?: string // To identify if this is user's own prompt
  /** Omit to hide the heart (e.g. guided previews without an account). */
  isFavorite?: boolean
  onToggleFavorite?: (prompt: SharedPrompt) => void
  /** The gallery source is newer than this saved copy. */
  sourceUpdated?: boolean
}

// Type color configurations (supports light/dark mode)
const TYPE_COLORS = {
  chat: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    icon: MessageSquare,
  },
  summary: {
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
    icon: ClipboardList,
  },
}

// Popular threshold
const POPULAR_THRESHOLD = 10

export function PromptCard({ prompt, onPreview, currentUserId, isFavorite, onToggleFavorite, sourceUpdated }: PromptCardProps) {
  const { t } = useLanguage()
  const source = getPromptSource(prompt, currentUserId)
  const isPopular = (prompt.usageCount || 0) >= POPULAR_THRESHOLD
  const isPatientOnly = prompt.audience.includes('patient') && !prompt.audience.includes('medical')
  const patientTopicTags = prompt.tags
    .filter((tag) => tag !== '衛教' && tag !== '民眾版')
    .slice(0, 2)

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'summary':
        return t.promptGallery.typeSummary
      default:
        return type
    }
  }

  const getTypeBadgeStyle = (type: string) => {
    const config = TYPE_COLORS[type as keyof typeof TYPE_COLORS] || TYPE_COLORS.chat
    return config.badge
  }

  const getCategoryLabel = (category: string) => {
    return t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  }

  return (
    <Card
      className="!gap-0 !py-0 flex cursor-pointer flex-col rounded-lg border-border shadow-none transition-colors hover:bg-muted/40 hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      role="button"
      tabIndex={0}
      aria-label={prompt.title}
      onClick={(event) => { event.currentTarget.focus(); onPreview(prompt) }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPreview(prompt)
        }
      }}
    >
      <CardHeader className="!pb-0 !pt-2 !px-3">
        <CardTitle className="text-sm line-clamp-1 leading-tight" title={prompt.title}>
          {prompt.title}
        </CardTitle>
        <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-1">
          {prompt.types.map((type) => {
            const TypeIcon = TYPE_COLORS[type as keyof typeof TYPE_COLORS]?.icon || MessageSquare
            return (
              <Badge
                key={type}
                className={`text-[0.625rem] px-1.5 py-0 h-4 border-0 flex items-center gap-0.5 ${getTypeBadgeStyle(type)}`}
              >
                <TypeIcon className="h-2.5 w-2.5" />
                {getTypeLabel(type)}
              </Badge>
            )
          })}
          <PromptSourceBadge source={source} tenantName={prompt.tenantName} />
          {sourceUpdated && (
            <Badge className="h-4 shrink-0 border-0 bg-accent px-1.5 py-0 text-[0.5625rem] text-accent-foreground" title={t.promptGallery.sourceUpdatedHint}>
              {t.promptGallery.sourceUpdated}
            </Badge>
          )}
          {isPopular && (
            <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0 dark:text-orange-300" />
          )}
        </div>
        {onToggleFavorite && (
          <CardAction className="-mr-1.5 -mt-1">
            <FavoriteButton active={!!isFavorite} onToggle={() => onToggleFavorite(prompt)} />
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="!pb-2 !pt-2 !px-3 flex flex-col gap-1">
        <p className="text-[0.6875rem] text-muted-foreground line-clamp-2 leading-tight h-[30px]">
          {prompt.description || prompt.prompt}
        </p>

        <div className="flex flex-wrap gap-1 min-h-[18px]">
          {isPatientOnly ? (
            patientTopicTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[0.625rem] px-1.5 py-0">
                {tag}
              </Badge>
            ))
          ) : (
            <>
              <Badge variant="secondary" className="text-[0.625rem] px-1.5 py-0">
                {getCategoryLabel(prompt.category)}
              </Badge>
              {prompt.specialty.slice(0, 1).map((spec) => (
                <Badge key={spec} variant="outline" className="text-[0.625rem] px-1 py-0">
                  {t.promptGallery.specialties[spec as keyof typeof t.promptGallery.specialties] || spec}
                </Badge>
              ))}
              {prompt.specialty.length > 1 && (
                <Badge variant="outline" className="text-[0.625rem] px-1 py-0">
                  +{prompt.specialty.length - 1}
                </Badge>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 text-[0.625rem] text-muted-foreground h-[16px]">
          <span className="tabular-nums">{t.promptGallery.updatedAt} {formatPromptDate(prompt.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          {isPopular ? (
            <Flame className="h-2.5 w-2.5 text-orange-500 dark:text-orange-300" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          )}
          <span>{t.promptGallery.usedTimes.replace('{count}', String(prompt.usageCount || 0))}</span>
        </div>
      </CardContent>
    </Card>
  )
}
