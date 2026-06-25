/**
 * Centralized Error Handling
 * Export all error classes and utilities
 */

export { BaseError } from './base.error'
export { AiError, AiErrorCode } from './ai.error'
export { FhirError, FhirErrorCode } from './fhir.error'
export { ValidationError, ValidationErrorCode } from './validation.error'

import type { BaseError } from './base.error'

/**
 * Type guard to check if error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error !== null && 
         typeof error === 'object' && 
         'getUserMessage' in error &&
         'toJSON' in error
}

/**
 * Error message mapping for common errors
 */
interface ErrorMapping {
  pattern: RegExp
  message: string
}

const ERROR_MAPPINGS: ErrorMapping[] = [
  // Guest/anonymous proxy session couldn't be obtained CLIENT-side (no Firebase
  // ID token) — most often iOS storage/ITP, private mode, or a stale cached
  // build. Distinct from the server "sign-in required" 401 below so the message
  // can point at the real fix (refresh / own key). Must come first to win.
  {
    pattern: /proxy session unavailable/i,
    message: '🔐 訪客連線失敗 - 取不到免費額度的連線權杖（常見於手機隱私／無痕設定或舊版快取）。請重新整理頁面；若仍不行，請改用自己的 API Key 或登入。'
  },
  // Proxy auth / quota (the Firebase Functions respond with these)
  {
    pattern: /sign-?in required|invalid or expired session/i,
    message: '🔐 內建額度僅供登入使用者 - 請先登入，或在設定中加入自己的 API Key'
  },
  {
    pattern: /daily quota exceeded/i,
    message: '📊 今日內建額度已用完 - 請在設定中加入自己的 API Key，或明天再試'
  },
  // API Key errors (most common)
  {
    pattern: /401|unauthorized|authentication failed.*check.*api key|incorrect api key|invalid api key|invalid_api_key|api_key_invalid/i,
    message: '🔑 API Key 錯誤 - 請檢查您的 API key 是否正確設定'
  },
  // Rate limit
  {
    pattern: /rate limit|429/i,
    message: '⏱️ 請求次數超過限制 - 請稍後再試'
  },
  // Timeout
  {
    pattern: /timeout|timed out/i,
    message: '⏰ 請求逾時 - 請檢查網路連線或稍後再試'
  },
  // Network errors
  {
    pattern: /network error|failed to fetch|fetch failed/i,
    message: '🌐 網路連線問題 - 請檢查網路連線'
  },
  // Service unavailable
  {
    pattern: /service.*unavailable|500|502|503/i,
    message: '🔧 服務暫時無法使用 - 請稍後再試'
  },
  // Quota/billing
  {
    pattern: /quota|billing/i,
    message: '💳 配額或帳單問題 - 請檢查 API 帳戶餘額'
  },
  // Model not found
  {
    pattern: /model.*not found|invalid model/i,
    message: '🤖 模型不可用 - 請選擇其他模型'
  },
  // Content filter
  {
    pattern: /content.*filtered|safety/i,
    message: '🛡️ 內容安全過濾 - 請調整問題內容'
  },
]

/**
 * Extract user-friendly message from any error
 * Enhanced with detailed error mapping
 */
export function getUserErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // Build a richer haystack to match against: the AI SDK's APICallError carries
  // the real signal in statusCode / responseBody, NOT always in .message (a
  // proxy 401 frequently has an empty .message — which previously produced an
  // empty error box). The proxy's 401 body contains the "sign-in required" text
  // that the first mapping matches, so include responseBody too.
  const e = error as { statusCode?: unknown; status?: unknown; responseBody?: unknown; name?: unknown } | null
  const haystack = [
    message,
    e?.statusCode != null ? `status ${e.statusCode}` : '',
    e?.status != null ? `status ${e.status}` : '',
    typeof e?.responseBody === 'string' ? e.responseBody : '',
    typeof e?.name === 'string' ? e.name : '',
  ].filter(Boolean).join(' ')

  // Chinese pattern table FIRST — typed AiError/FhirError getUserMessage()
  // strings are English, so checking isBaseError before the table used to
  // route the most common failures (401, rate limit, timeout…) around the
  // localized messages (audit D5)
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.pattern.test(haystack)) {
      return mapping.message
    }
  }

  // No pattern matched — fall back to the error type's curated message
  if (isBaseError(error)) {
    return error.getUserMessage()
  }

  // For unknown errors, return the original message — but never an empty string,
  // which would render as a blank error box.
  if (message && message.trim()) {
    return message
  }

  return 'AI 服務發生錯誤，請稍後再試'
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (isBaseError(error)) {
    console.error('[Error]', error.toJSON())
  } else if (error instanceof Error) {
    console.error('[Error]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    })
  } else {
    console.error('[Error]', { error: String(error), context })
  }
}
