/**
 * Prompt Filters Component
 * One compact toolbar row: search, then unlabeled-looking selects whose
 * labels stay available to assistive tech, then whatever the caller trails
 * (usually the result count). Keeps the list close to the top of the dialog.
 */

import { useId, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'
import type { PromptType, PromptCategory, PromptSpecialty } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { PromptSpecialtyPicker } from './PromptSpecialtyPicker'

interface PromptFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedType?: PromptType
  onTypeChange: (type?: PromptType) => void
  selectedCategory?: PromptCategory
  onCategoryChange: (category?: PromptCategory) => void
  selectedSpecialty?: PromptSpecialty
  onSpecialtyChange: (specialty?: PromptSpecialty) => void
  searchPlaceholder?: string
  trailing?: ReactNode
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
  searchPlaceholder,
  trailing,
}: PromptFiltersProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const filterId = useId()
  // Medical categories and specialties don't apply to patient-facing prompts.
  const showMedicalFilters = audience === 'medical'

  const types: (PromptType | 'all')[] = ['all', 'chat', 'summary']
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
  const getTypeLabel = (type: PromptType | 'all') => {
    if (type === 'all') return t.promptGallery.allTypes
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'summary':
        return t.promptGallery.typeSummary
      default:
        return type
    }
  }

  const getCategoryLabel = (category: PromptCategory | 'all') => {
    if (category === 'all') return t.promptGallery.allCategories
    return t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative min-w-[11rem] flex-1 max-md:basis-full">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          placeholder={searchPlaceholder ?? t.promptGallery.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchPlaceholder ?? t.promptGallery.searchPlaceholder}
          className="pl-9 h-9 shadow-none max-md:min-h-11 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      <div className="min-w-0 max-md:flex-1">
        <Label htmlFor={`${filterId}-type`} className="sr-only">{t.promptGallery.filterByType}</Label>
        <Select
          value={selectedType || 'all'}
          onValueChange={(value) => onTypeChange(value === 'all' ? undefined : (value as PromptType))}
        >
          <SelectTrigger id={`${filterId}-type`} className="h-9 w-[6.5rem] shadow-none max-md:min-h-11 max-md:w-full">
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
      </div>

      {showMedicalFilters && (
        <>
          <div className="min-w-0 max-md:flex-1">
            <Label htmlFor={`${filterId}-category`} className="sr-only">{t.promptGallery.filterByCategory}</Label>
            <Select
              value={selectedCategory || 'all'}
              onValueChange={(value) =>
                onCategoryChange(value === 'all' ? undefined : (value as PromptCategory))
              }
            >
              <SelectTrigger id={`${filterId}-category`} className="h-9 w-[7.5rem] shadow-none max-md:min-h-11 max-md:w-full">
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
          </div>

          <div className="min-w-0 max-md:basis-full">
            <Label htmlFor={`${filterId}-specialty`} className="sr-only">{t.promptGallery.filterBySpecialty}</Label>
            <PromptSpecialtyPicker id={`${filterId}-specialty`} className="h-9 md:w-[10rem]"
              value={selectedSpecialty} onChange={onSpecialtyChange} />
          </div>
        </>
      )}

      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  )
}
