/**
 * Prompt Gallery Hook
 * Manages prompt gallery state and operations
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SharedPrompt, PromptGalleryFilter, PromptGallerySort } from '../types/prompt.types'
import {
  getSharedPrompts,
  getMySharedPrompts,
  incrementPromptUsage,
} from '@/features/prompt-gallery/services/prompt-gallery.service'

interface UsePromptGalleryOptions {
  initialFilter?: PromptGalleryFilter
  userId?: string // If provided, fetch only user's prompts
  enabled?: boolean
}

export function usePromptGallery(options?: UsePromptGalleryOptions | PromptGalleryFilter) {
  // Support both old API (initialFilter) and new API (options object)
  const { initialFilter, userId, enabled = true } = options && ('userId' in options || 'initialFilter' in options || 'enabled' in options)
    ? options
    : { initialFilter: options, userId: undefined, enabled: true }

  const [prompts, setPrompts] = useState<SharedPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PromptGalleryFilter>((initialFilter as PromptGalleryFilter) || {})
  const [sort, setSort] = useState<PromptGallerySort>({
    field: 'createdAt',
    direction: 'desc',
  })
  const requestId = useRef(0)

  // Fetch prompts
  const fetchPrompts = useCallback(async () => {
    if (!enabled) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      let fetchedPrompts: SharedPrompt[]
      if (userId) {
        // Fetch only user's prompts
        fetchedPrompts = await getMySharedPrompts(userId, filter, sort)
      } else {
        // Fetch all prompts
        fetchedPrompts = await getSharedPrompts(filter, sort)
      }
      if (id === requestId.current) setPrompts(fetchedPrompts)
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Failed to fetch prompts')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [filter, sort, userId, enabled])

  // Fetch on mount and when filter/sort changes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    if (enabled) {
      // Remote synchronization owns the loading state, including debounce time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      timer = setTimeout(() => void fetchPrompts(), filter.searchQuery ? 250 : 0)
    }
    return () => { clearTimeout(timer); requestId.current += 1 }
  }, [fetchPrompts, enabled, filter.searchQuery])

  // Update filter
  const updateFilter = useCallback((newFilter: Partial<PromptGalleryFilter>) => {
    requestId.current += 1
    setFilter((prev) => ({ ...prev, ...newFilter }))
  }, [])

  // Clear filter
  const clearFilter = useCallback(() => {
    requestId.current += 1
    setFilter((initialFilter as PromptGalleryFilter) || {})
  }, [initialFilter])

  // Update sort
  const updateSort = useCallback((newSort: PromptGallerySort) => {
    requestId.current += 1
    setSort(newSort)
  }, [])

  // Track usage when a prompt is used
  const trackUsage = useCallback(async (promptId: string) => {
    try {
      await incrementPromptUsage(promptId)
      // Update local state
      setPrompts((prev) =>
        prev.map((p) =>
          p.id === promptId ? { ...p, usageCount: (p.usageCount || 0) + 1 } : p
        )
      )
    } catch (err) {
      console.error('Error tracking usage:', err)
      // Don't throw - this is not critical
    }
  }, [])

  return {
    prompts,
    loading,
    error,
    filter,
    sort,
    updateFilter,
    clearFilter,
    updateSort,
    fetchPrompts,
    trackUsage,
  }
}
