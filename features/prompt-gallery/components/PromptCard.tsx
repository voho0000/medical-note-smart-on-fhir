/**
 * Prompt Card Component
 * Displays a single prompt in the gallery with color-coded types
 */

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Flame, MessageSquare, Lightbulb } from 'lucide-react'
import type { SharedPrompt } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'

interface PromptCardProps {
  prompt: SharedPrompt
  onPreview: (prompt: SharedPrompt) => void
  currentUserId?: string // To identify if this is user's own prompt
}

// Type color configurations (supports light/dark mode)
const TYPE_COLORS = {
  chat: {
    border: 'border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    icon: MessageSquare,
  },
  insight: {
    border: 'border-l-violet-500',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    icon: Lightbulb,
  },
}

// Popular threshold
const POPULAR_THRESHOLD = 10

export function PromptCard({ prompt, onPreview, currentUserId }: PromptCardProps) {
  const { t } = useLanguage()
  const isMyPrompt = currentUserId && prompt.authorId === currentUserId
  const isPopular = (prompt.usageCount || 0) >= POPULAR_THRESHOLD
  
  // Get primary type for border color (first type in array)
  const primaryType = prompt.types[0] || 'chat'
  const typeConfig = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] || TYPE_COLORS.chat

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'insight':
        return t.promptGallery.typeInsight
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
      className={`!py-0 !gap-0 flex flex-col hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer border-l-4 ${typeConfig.border} hover:ring-2 hover:ring-primary/20`}
      onClick={() => onPreview(prompt)}
    >
      <CardHeader className="!pb-0 !pt-2 !px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <CardTitle className="text-sm line-clamp-1 leading-tight">{prompt.title}</CardTitle>
            {isMyPrompt && (
              <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0">
                我的
              </Badge>
            )}
            {isPopular && (
              <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {prompt.types.map((type) => {
              const TypeIcon = TYPE_COLORS[type as keyof typeof TYPE_COLORS]?.icon || MessageSquare
              return (
                <Badge 
                  key={type} 
                  className={`text-[10px] px-1.5 py-0 h-4 border-0 flex items-center gap-0.5 ${getTypeBadgeStyle(type)}`}
                >
                  <TypeIcon className="h-2.5 w-2.5" />
                  {getTypeLabel(type)}
                </Badge>
              )
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="!pb-2 !pt-2 !px-3 flex flex-col gap-1">
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight h-[30px]">
          {prompt.prompt}
        </p>

        <div className="flex flex-wrap gap-1 min-h-[18px]">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {getCategoryLabel(prompt.category)}
          </Badge>
          {prompt.specialty.slice(0, 1).map((spec) => (
            <Badge key={spec} variant="outline" className="text-[10px] px-1 py-0">
              {t.promptGallery.specialties[spec as keyof typeof t.promptGallery.specialties] || spec}
            </Badge>
          ))}
          {prompt.specialty.length > 1 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              +{prompt.specialty.length - 1}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground h-[16px]">
          {isPopular ? (
            <Flame className="h-2.5 w-2.5 text-orange-500" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          )}
          <span>使用 {prompt.usageCount || 0} 次</span>
        </div>
      </CardContent>
    </Card>
  )
}
