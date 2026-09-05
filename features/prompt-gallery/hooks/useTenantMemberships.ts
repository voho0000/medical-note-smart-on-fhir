import { useEffect, useMemo, useState } from 'react'
import type { TenantMembership } from '../types/prompt.types'
import { subscribeTenantMemberships } from '../services/tenant-memberships.service'

/** Live list of the signed-in account's active department memberships (empty for anonymous sessions). */
export function useTenantMemberships({ userId, enabled = true }: { userId?: string; enabled?: boolean }) {
  const [stored, setStored] = useState<{ userId: string; memberships: TenantMembership[] }>()
  const active = !!userId && enabled

  useEffect(() => {
    if (!active) return
    return subscribeTenantMemberships(userId, (memberships) => setStored({ userId, memberships }))
  }, [active, userId])

  return useMemo<TenantMembership[]>(
    () => active && stored?.userId === userId ? stored.memberships : [],
    [active, stored, userId],
  )
}
