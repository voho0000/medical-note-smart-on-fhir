/**
 * Prompt Table
 * Desktop list of gallery prompts: one row per template, sortable headers,
 * heart in the first column, quick "use" in the last. Rows open the preview.
 */

import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, Flame, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { getPromptSource } from '../constants/prompt-source'
import type { PromptGallerySort, SharedPrompt } from '../types/prompt.types'
import { formatPromptDate } from '../utils/prompt-filter.utils'
import { FavoriteButton } from './FavoriteButton'
import { PromptSourceBadge } from './PromptSourceBadge'

const POPULAR_THRESHOLD = 10
const TYPE_STYLES = {
  chat: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300', icon: MessageSquare },
  summary: { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300', icon: ClipboardList },
}

type SortField = PromptGallerySort['field']

function SortableHead({ field, label, className, sort, onToggle, sortLabel }: {
  field: SortField
  label: string
  className?: string
  sort?: PromptGallerySort
  onToggle: (field: SortField) => void
  sortLabel: string
}) {
  const active = sort?.field === field
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={() => onToggle(field)}
        aria-label={sortLabel.replace('{column}', label)}
        className={cn('inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', active && 'text-foreground')}
      >
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden="true" />
      </button>
    </TableHead>
  )
}

interface PromptTableProps {
  prompts: SharedPrompt[]
  currentUserId?: string
  /** Undefined keeps the list's natural order (e.g. most recently saved). */
  sort?: PromptGallerySort
  onSortChange: (sort: PromptGallerySort) => void
  isFavorite?: (promptId: string) => boolean
  onToggleFavorite?: (prompt: SharedPrompt) => void
  onPreview: (prompt: SharedPrompt) => void
  onUse?: (prompt: SharedPrompt) => void
  /** Prompt ids whose gallery source is newer than the saved copy. */
  updatedIds?: ReadonlySet<string>
  showSource?: boolean
}

export function PromptTable({
  prompts, currentUserId, sort, onSortChange, isFavorite, onToggleFavorite, onPreview, onUse, updatedIds, showSource = true,
}: PromptTableProps) {
  const { t } = useLanguage()
  const typeLabel = (type: string) => type === 'chat' ? t.promptGallery.typeChat : type === 'summary' ? t.promptGallery.typeSummary : type
  const categoryLabel = (category: string) => t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  const specialtyLabel = (specialty: string) => t.promptGallery.specialties[specialty as keyof typeof t.promptGallery.specialties] || specialty

  const toggleSort = (field: SortField) => {
    // A fresh column starts with the most useful direction: names A→Z, everything else newest/most first.
    const direction = sort?.field === field ? (sort.direction === 'desc' ? 'asc' : 'desc') : field === 'title' ? 'asc' : 'desc'
    onSortChange({ field, direction })
  }

  const headProps = { sort, onToggle: toggleSort, sortLabel: t.promptGallery.sortColumn }

  return (
    <Table className="table-fixed text-sm">
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow className="hover:bg-transparent">
          {onToggleFavorite && <TableHead className="w-10"><span className="sr-only">{t.promptGallery.favorites}</span></TableHead>}
          <SortableHead field="title" label={t.promptGallery.columnTemplate} {...headProps} />
          <TableHead className="w-[5.5rem] text-xs">{t.promptGallery.columnType}</TableHead>
          <TableHead className="w-[6.5rem] text-xs">{t.promptGallery.columnCategory}</TableHead>
          <TableHead className="w-[7rem] text-xs">{t.promptGallery.columnSpecialty}</TableHead>
          {showSource && <TableHead className="w-[5.5rem] text-xs">{t.promptGallery.columnSource}</TableHead>}
          <SortableHead field="updatedAt" label={t.promptGallery.columnUpdated} className="w-[6.5rem]" {...headProps} />
          <SortableHead field="usageCount" label={t.promptGallery.columnUsage} className="w-[4rem] text-right" {...headProps} />
          {onUse && <TableHead className="w-[4.5rem]"><span className="sr-only">{t.promptGallery.useNow}</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {prompts.map((prompt) => {
          const isPatientOnly = prompt.audience.includes('patient') && !prompt.audience.includes('medical')
          const isPopular = (prompt.usageCount || 0) >= POPULAR_THRESHOLD
          const patientTags = prompt.tags.filter((tag) => tag !== '衛教' && tag !== '民眾版').slice(0, 2)
          return (
            <TableRow
              key={prompt.id}
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
              className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              {onToggleFavorite && (
                <TableCell className="py-1">
                  <FavoriteButton active={!!isFavorite?.(prompt.id)} onToggle={() => onToggleFavorite(prompt)} />
                </TableCell>
              )}
              <TableCell className="min-w-0 whitespace-normal py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-semibold leading-tight" title={prompt.title}>{prompt.title}</span>
                  {updatedIds?.has(prompt.id) && (
                    <Badge className="h-4 shrink-0 border-0 bg-accent px-1.5 py-0 text-[0.5625rem] text-accent-foreground" title={t.promptGallery.sourceUpdatedHint}>
                      {t.promptGallery.sourceUpdated}
                    </Badge>
                  )}
                  {isPopular && <Flame className="h-3 w-3 shrink-0 text-orange-500 dark:text-orange-300" aria-hidden="true" />}
                </div>
                <p className="truncate text-[0.6875rem] leading-tight text-muted-foreground">{prompt.description || prompt.prompt}</p>
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex gap-1">
                  {prompt.types.map((type) => {
                    const style = TYPE_STYLES[type as keyof typeof TYPE_STYLES] || TYPE_STYLES.chat
                    const Icon = style.icon
                    return (
                      <Badge key={type} className={cn('flex h-4 items-center gap-0.5 border-0 px-1.5 py-0 text-[0.625rem]', style.badge)}>
                        <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                        {typeLabel(type)}
                      </Badge>
                    )
                  })}
                </div>
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex flex-wrap gap-1">
                  {isPatientOnly
                    ? patientTags.map((tag) => <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[0.625rem]">{tag}</Badge>)
                    : <Badge variant="secondary" className="px-1.5 py-0 text-[0.625rem]">{categoryLabel(prompt.category)}</Badge>}
                </div>
              </TableCell>
              <TableCell className="py-1.5 text-xs">
                {isPatientOnly ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="truncate">{prompt.specialty[0] ? specialtyLabel(prompt.specialty[0]) : '—'}</span>
                    {prompt.specialty.length > 1 && <span className="text-muted-foreground">+{prompt.specialty.length - 1}</span>}
                  </span>
                )}
              </TableCell>
              {showSource && (
                <TableCell className="py-1.5">
                  <PromptSourceBadge source={getPromptSource(prompt, currentUserId)} tenantName={prompt.tenantName} />
                </TableCell>
              )}
              <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{formatPromptDate(prompt.updatedAt)}</TableCell>
              <TableCell className="py-1.5 text-right text-xs tabular-nums text-muted-foreground">{prompt.usageCount || 0}</TableCell>
              {onUse && (
                <TableCell className="py-1 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs shadow-none"
                    aria-label={`${t.promptGallery.useNow}: ${prompt.title}`}
                    onClick={(event) => { event.stopPropagation(); onUse(prompt) }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
                  >
                    {t.promptGallery.useNow}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
