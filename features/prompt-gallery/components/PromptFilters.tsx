/**
 * Prompt Filters Component
 * Filter controls for the prompt gallery
 */

import { useId } from 'react'
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
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
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
          placeholder={t.promptGallery.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={t.promptGallery.searchPlaceholder}
          className="pl-9 h-9 shadow-none max-md:min-h-11 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      {/* Keep the longer specialty names on their own row on phones. */}
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[140px_140px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${filterId}-type`}>{t.promptGallery.filterByType}</Label>
          <Select
            value={selectedType || 'all'}
            onValueChange={(value) => onTypeChange(value === 'all' ? undefined : (value as PromptType))}
          >
            <SelectTrigger id={`${filterId}-type`} className="h-9 w-full shadow-none max-md:min-h-11">
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
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${filterId}-category`}>{t.promptGallery.filterByCategory}</Label>
              <Select
                value={selectedCategory || 'all'}
                onValueChange={(value) =>
                  onCategoryChange(value === 'all' ? undefined : (value as PromptCategory))
                }
              >
                <SelectTrigger id={`${filterId}-category`} className="h-9 w-full shadow-none max-md:min-h-11">
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

            <div className="col-span-2 min-w-0 space-y-1.5 sm:col-span-1">
              <Label htmlFor={`${filterId}-specialty`}>{t.promptGallery.filterBySpecialty}</Label>
              <PromptSpecialtyPicker id={`${filterId}-specialty`} className="h-9"
                value={selectedSpecialty} onChange={onSpecialtyChange} />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
