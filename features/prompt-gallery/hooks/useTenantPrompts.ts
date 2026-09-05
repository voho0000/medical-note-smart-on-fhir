import { useCallback, useEffect, useRef, useState } from 'react'
import type { SharedPrompt } from '../types/prompt.types'
import { getTenantPrompts, incrementTenantPromptUsage } from '../services/tenant-prompts.service'

interface UseTenantPromptsOptions {
  tenantId?: string
  /** Shown on the source badge; the document only stores the id. */
  tenantName?: string
  enabled?: boolean
}

/** Department templates for one tenant. Filtering and sorting happen client-side (small, member-only sets). */
export function useTenantPrompts({ tenantId, tenantName, enabled = true }: UseTenantPromptsOptions) {
  const [state, setState] = useState<{ tenantId: string; prompts: SharedPrompt[]; loading: boolean; error: string | null }>()
  const requestId = useRef(0)
  const active = !!tenantId && enabled

  // Loading is derived (no state for the current tenant yet) so the effect never sets state synchronously;
  // a manual refetch keeps showing the previous list until the new one arrives.
  const fetchPrompts = useCallback(async () => {
    if (!active) return
    const id = ++requestId.current
    try {
      const prompts = (await getTenantPrompts(tenantId)).map((prompt) => ({ ...prompt, tenantName }))
      if (id === requestId.current) setState({ tenantId, prompts, loading: false, error: null })
    } catch (error) {
      if (id === requestId.current) setState({ tenantId, prompts: [], loading: false, error: error instanceof Error ? error.message : 'Failed to fetch department templates' })
    }
  }, [active, tenantId, tenantName])

  useEffect(() => {
    // Defer like usePromptGallery so the fetch (and its eventual setState) never runs inside the effect body.
    const timer = setTimeout(() => void fetchPrompts(), 0)
    return () => { clearTimeout(timer); requestId.current += 1 }
  }, [fetchPrompts])

  const trackUsage = useCallback(async (promptId: string) => {
    try {
      await incrementTenantPromptUsage(promptId)
      setState((previous) => previous ? { ...previous, prompts: previous.prompts.map((prompt) => prompt.id === promptId ? { ...prompt, usageCount: (prompt.usageCount || 0) + 1 } : prompt) } : previous)
    } catch (error) {
      console.error('Error tracking department template usage:', error)
    }
  }, [])

  const current = active && state?.tenantId === tenantId ? state : undefined
  return {
    prompts: current?.prompts ?? [],
    loading: active ? (current?.loading ?? true) : false,
    error: current?.error ?? null,
    fetchPrompts,
    trackUsage,
  }
}
