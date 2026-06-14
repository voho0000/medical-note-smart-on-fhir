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

  /**
   * Smaller free allowance for not-signed-in (anonymous) visitors — must
   * mirror the Functions' ANON_LIMITS (QUOTA_ANON_LIMIT[_PERPLEXITY|_WHISPER]).
   * Display-only; the server is the source of truth.
   */
  ANON_DAILY_LIMIT: 50,
  ANON_PERPLEXITY_LIMIT: 10,
  ANON_WHISPER_LIMIT: 10,
} as const

export type QuotaConfig = typeof QUOTA_CONFIG
