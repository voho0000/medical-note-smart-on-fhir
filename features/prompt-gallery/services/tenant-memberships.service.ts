/**
 * Department (tenant) memberships: users/{uid}/memberships/{tenantId}
 *
 * Written only by the membership admin Function; the client reads its own
 * active records to decide which 科常用範本 it may browse and publish to.
 */
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import type { TenantMembership, TenantRole } from '../types/prompt.types'

const TENANT_ROLES: readonly TenantRole[] = ['owner', 'builder', 'reviewer', 'member']
/** Roles allowed to publish, edit and retire department templates (mirrors firestore.rules). */
export const TENANT_PUBLISHER_ROLES: readonly TenantRole[] = ['owner', 'builder']

export function subscribeTenantMemberships(userId: string, onUpdate: (memberships: TenantMembership[]) => void): Unsubscribe {
  if (!db) { onUpdate([]); return () => {} }
  const ref = query(collection(db, 'users', userId, 'memberships'), where('status', '==', 'active'))
  return onSnapshot(ref, (snapshot) => {
    const memberships = snapshot.docs.map((record): TenantMembership => {
      const data = record.data()
      const tenantId = typeof data.tenant_id === 'string' && data.tenant_id ? data.tenant_id : record.id
      const role = TENANT_ROLES.includes(data.role) ? data.role as TenantRole : 'member'
      return {
        tenantId,
        role,
        displayName: typeof data.display_name === 'string' && data.display_name.trim() ? data.display_name.trim() : tenantId,
        canPublish: TENANT_PUBLISHER_ROLES.includes(role),
      }
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
    onUpdate(memberships)
  }, (error) => {
    console.error('[Tenant Memberships] subscription error:', error)
    onUpdate([])
  })
}
