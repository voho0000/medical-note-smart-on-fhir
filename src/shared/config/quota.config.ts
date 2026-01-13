/**
 * Quota Configuration
 * Single source of truth for all quota-related settings
 */

export const QUOTA_CONFIG = {
  /**
   * Daily API usage limit for authenticated users using proxy
   */
  DAILY_LIMIT: 50,
} as const

export type QuotaConfig = typeof QUOTA_CONFIG
