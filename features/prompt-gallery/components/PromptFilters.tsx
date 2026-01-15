/**
 * Prompt Filters Component
 * Filter controls for the prompt gallery
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import type { PromptType, PromptCategory, PromptSpecialty } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'

interface PromptFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedType?: PromptType
  onTypeChange: (type?: PromptType) => void
  selectedCategory?: PromptCategory
  onCategoryChange: (category?: PromptCategory) => void
  selectedSpecialty?: PromptSpecialty
  onSpecialtyChange: (specialty?: PromptSpecialty) => void
  sortBy?: 'latest' | 'popular'
  onSortChange: (sort: 'latest' | 'popular') => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

export function PromptFilters({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
  selectedCategory,
  onCategoryChange,
  selectedSpecialty,
  onSpecialtyChange,
  sortBy = 'latest',
  onSortChange,
  onClearFilters,
  hasActiveFilters,
}: PromptFiltersProps) {
  const { t } = useLanguage()

  const types: (PromptType | 'all')[] = ['all', 'chat', 'insight']
  const categories: (PromptCategory | 'all')[] = [
    'all',
    'soap',
    'admission',
    'discharge',
    'safety',
    'summary',
    'progress',
    'consult',
    'procedure',
    'other',
  ]
  const specialties: (PromptSpecialty | 'all')[] = [
    'all',
    'general',
    'internal',
    'surgery',
    'emergency',
    'pediatrics',
    'obstetrics',
    'psychiatry',
    'other',
  ]

  const getTypeLabel = (type: PromptType | 'all') => {
    if (type === 'all') return t.promptGallery.allTypes
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'insight':
        return t.promptGallery.typeInsight
      default:
        return type
    }
  }

  const getCategoryLabel = (category: PromptCategory | 'all') => {
    if (category === 'all') return t.promptGallery.allCategories
    return t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  }

  const getSpecialtyLabel = (specialty: PromptSpecialty | 'all') => {
    if (specialty === 'all') return t.promptGallery.allSpecialties
    return t.promptGallery.specialties[specialty as keyof typeof t.promptGallery.specialties] || specialty
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.promptGallery.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Type Filter */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t.promptGallery.filterByType}</Label>
          <Select
            value={selectedType || 'all'}
            onValueChange={(value) => onTypeChange(value === 'all' ? undefined : (value as PromptType))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {getTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category Filter */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t.promptGallery.filterByCategory}</Label>
          <Select
            value={selectedCategory || 'all'}
            onValueChange={(value) =>
              onCategoryChange(value === 'all' ? undefined : (value as PromptCategory))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {getCategoryLabel(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Specialty Filter */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t.promptGallery.filterBySpecialty}</Label>
          <Select
            value={selectedSpecialty || 'all'}
            onValueChange={(value) =>
              onSpecialtyChange(value === 'all' ? undefined : (value as PromptSpecialty))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {specialties.map((specialty) => (
                <SelectItem key={specialty} value={specialty}>
                  {getSpecialtyLabel(specialty)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="space-y-1.5">
          <Label className="text-xs">排序方式</Label>
          <Select
            value={sortBy}
            onValueChange={(value) => onSortChange(value as 'latest' | 'popular')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">最新優先</SelectItem>
              <SelectItem value="popular">熱門優先</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="w-full"
        >
          <X className="h-4 w-4 mr-2" />
          {t.promptGallery.clearFilters}
        </Button>
      )}
    </div>
  )
}
