/**
 * Prompt Card Component
 * Displays a single prompt in the gallery
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, TrendingUp } from 'lucide-react'
import type { SharedPrompt } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'

interface PromptCardProps {
  prompt: SharedPrompt
  onPreview: (prompt: SharedPrompt) => void
  currentUserId?: string // To identify if this is user's own prompt
}

export function PromptCard({ prompt, onPreview, currentUserId }: PromptCardProps) {
  const { t } = useLanguage()
  const isMyPrompt = currentUserId && prompt.authorId === currentUserId

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

  const getCategoryLabel = (category: string) => {
    return t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  }

  return (
    <Card 
      className="!py-0 !gap-0 flex flex-col hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer hover:border-primary"
      onClick={() => onPreview(prompt)}
    >
      <CardHeader className="!pb-0 !pt-2 !px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <CardTitle className="text-sm line-clamp-1 leading-tight">{prompt.title}</CardTitle>
            {isMyPrompt && (
              <Badge variant="default" className="text-[9px] px-1 py-0 h-3.5 shrink-0">
                我的
              </Badge>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {prompt.types.map((type) => (
              <Badge key={type} variant="outline" className="text-[10px] px-1 py-0 h-4">
                {getTypeLabel(type)}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="!pb-2 !pt-2 !px-3 flex flex-col gap-1">
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight h-[30px]">
          {prompt.prompt}
        </p>

        <div className="flex flex-wrap gap-1 min-h-[18px]">
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            {getCategoryLabel(prompt.category)}
          </Badge>
          {prompt.specialty.slice(0, 1).map((spec) => (
            <Badge key={spec} variant="outline" className="text-[10px] px-1 py-0">
              {spec}
            </Badge>
          ))}
          {prompt.specialty.length > 1 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              +{prompt.specialty.length - 1}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground h-[16px]">
          <TrendingUp className="h-2.5 w-2.5" />
          <span>使用 {prompt.usageCount || 0} 次</span>
        </div>
      </CardContent>
    </Card>
  )
}
