import type { User } from '@/src/application/providers/auth.provider'

export const FEATURE_REQUEST_ADMIN_EMAIL = 'voho0000@gmail.com'

export function isFeatureRequestAdmin(user: User | null): boolean {
  return user?.emailVerified === true
    && user.email?.toLocaleLowerCase() === FEATURE_REQUEST_ADMIN_EMAIL
}
