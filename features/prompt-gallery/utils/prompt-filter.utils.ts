import { getPromptSpecialtyFilterValues } from '../constants/prompt-specialties'
import type { PromptGalleryFilter, PromptGallerySort, SharedPrompt } from '../types/prompt.types'

/** Client-side counterpart of the service filter, for lists that are already in memory (favorites, system tab). */
export function matchesPromptFilter(prompt: SharedPrompt, filter: PromptGalleryFilter): boolean {
  if (filter.type && !prompt.types.includes(filter.type)) return false
  if (filter.category && prompt.category !== filter.category) return false
  if (filter.specialty) {
    const values = getPromptSpecialtyFilterValues(filter.specialty)
    if (!prompt.specialty.some(value => values.includes(value))) return false
  }
  if (filter.audience && !prompt.audience.includes(filter.audience)) return false
  if (filter.tags?.length && !filter.tags.some(tag => prompt.tags.includes(tag))) return false
  const search = filter.searchQuery?.trim().toLocaleLowerCase()
  if (search) {
    const fields = [prompt.title, prompt.description, prompt.authorName, ...prompt.tags, prompt.prompt]
    if (!fields.some(value => value?.toLocaleLowerCase().includes(search))) return false
  }
  return true
}

export function sortPrompts(prompts: readonly SharedPrompt[], sort: PromptGallerySort): SharedPrompt[] {
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...prompts].sort((a, b) => direction * (
    sort.field === 'usageCount' ? (a.usageCount ?? 0) - (b.usageCount ?? 0)
      : sort.field === 'title' ? a.title.localeCompare(b.title)
        : sort.field === 'updatedAt' ? a.updatedAt.getTime() - b.updatedAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime()))
}

/** Local calendar date, e.g. 2026-08-21, for compact table cells. */
export function formatPromptDate(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return '—'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
