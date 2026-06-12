/**
 * Quota Configuration
 * Single source of truth for all quota-related settings
 */

export const QUOTA_CONFIG = {
  /**
   * Daily proxy limits for authenticated users — must mirror the Functions'
   * env defaults (QUOTA_DAILY_LIMIT[_PERPLEXITY|_WHISPER]); enforcement is
   * server-side, these values only drive the UI display.
   */
  DAILY_LIMIT: 200,
  PERPLEXITY_DAILY_LIMIT: 50,
  WHISPER_DAILY_LIMIT: 50,
} as const

export type QuotaConfig = typeof QUOTA_CONFIG
