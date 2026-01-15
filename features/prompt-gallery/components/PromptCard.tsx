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
}

export function PromptCard({ prompt, onPreview }: PromptCardProps) {
  const { t } = useLanguage()

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
          <CardTitle className="text-sm line-clamp-1 leading-tight">{prompt.title}</CardTitle>
          <div className="flex gap-1 shrink-0">
            {prompt.types.map((type) => (
              <Badge key={type} variant="outline" className="text-[10px] px-1 py-0 h-4">
                {getTypeLabel(type)}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="!pb-2 !pt-2 !px-3 space-y-1">
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
          {prompt.prompt}
        </p>

        <div className="flex flex-wrap gap-1">
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

        {prompt.usageCount !== undefined && prompt.usageCount > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingUp className="h-2.5 w-2.5" />
            <span>{prompt.usageCount}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
