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
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.promptGallery.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Filters - Compact Single Row */}
      <div className="flex items-center gap-2">
        <Select
          value={selectedType || 'all'}
          onValueChange={(value) => onTypeChange(value === 'all' ? undefined : (value as PromptType))}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={t.promptGallery.filterByType} />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {getTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedCategory || 'all'}
          onValueChange={(value) =>
            onCategoryChange(value === 'all' ? undefined : (value as PromptCategory))
          }
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={t.promptGallery.filterByCategory} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {getCategoryLabel(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedSpecialty || 'all'}
          onValueChange={(value) =>
            onSpecialtyChange(value === 'all' ? undefined : (value as PromptSpecialty))
          }
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={t.promptGallery.filterBySpecialty} />
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
    </div>
  )
}
