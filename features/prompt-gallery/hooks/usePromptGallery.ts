/**
 * Prompt Gallery Hook
 * Manages prompt gallery state and operations
 */

import { useState, useEffect, useCallback } from 'react'
import type { SharedPrompt, PromptGalleryFilter, PromptGallerySort } from '../types/prompt.types'
import {
  getSharedPrompts,
  getMySharedPrompts,
  incrementPromptUsage,
} from '../services/prompt-gallery.service'

interface UsePromptGalleryOptions {
  initialFilter?: PromptGalleryFilter
  userId?: string // If provided, fetch only user's prompts
}

export function usePromptGallery(options?: UsePromptGalleryOptions | PromptGalleryFilter) {
  // Support both old API (initialFilter) and new API (options object)
  const { initialFilter, userId } = typeof options === 'object' && 'userId' in options
    ? options
    : { initialFilter: options, userId: undefined }

  const [prompts, setPrompts] = useState<SharedPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PromptGalleryFilter>((initialFilter as PromptGalleryFilter) || {})
  const [sort, setSort] = useState<PromptGallerySort>({
    field: 'createdAt',
    direction: 'desc',
  })

  // Fetch prompts
  const fetchPrompts = useCallback(async () => {
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
      setPrompts(fetchedPrompts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prompts')
      console.error('Error fetching prompts:', err)
    } finally {
      setLoading(false)
    }
  }, [filter, sort, userId])

  // Fetch on mount and when filter/sort changes
  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  // Update filter
  const updateFilter = useCallback((newFilter: Partial<PromptGalleryFilter>) => {
    setFilter((prev) => ({ ...prev, ...newFilter }))
  }, [])

  // Clear filter
  const clearFilter = useCallback(() => {
    setFilter({})
  }, [])

  // Update sort
  const updateSort = useCallback((newSort: PromptGallerySort) => {
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
