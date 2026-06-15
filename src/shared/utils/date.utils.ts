// Date Utilities
export function formatDate(dateString: string | undefined, locale: string = 'en-US'): string {
  const unknown = locale.startsWith('zh') ? '未知日期' : 'Unknown'
  const invalid = locale.startsWith('zh') ? '日期無效' : 'Invalid date'
  if (!dateString) return unknown
  try {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return invalid
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return invalid
  }
}

export function formatDateTime(dateString: string | undefined, locale: string = 'en-US'): string {
  if (!dateString) return locale.startsWith('zh') ? '未知' : 'Unknown'
  try {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return locale.startsWith('zh') ? '日期無效' : 'Invalid date'
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return locale.startsWith('zh') ? '日期無效' : 'Invalid date'
  }
}

/**
 * Search tokens for a date: the date rendered in the common Gregorian formats
 * AND the ROC / 民國 equivalents (year − 1911), so a search box matches whether
 * the user types 2025/11/20 or 114/11/20 (also 114-11-20 / 1141120). Returns
 * plain strings; callers lowercase the haystack as usual.
 */
export function dateSearchTokens(dateString: string | undefined): string[] {
  if (!dateString) return []
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return []
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const mp = String(m).padStart(2, '0')
  const dp = String(day).padStart(2, '0')
  const tokens = [
    d.toLocaleDateString(),  // locale default (e.g. 1/22/2026)
    `${y}/${m}/${day}`,      // 2025/11/20
    `${y}/${mp}/${dp}`,      // 2025/11/20 (padded)
    `${y}-${mp}-${dp}`,      // 2025-11-20
    `${m}/${day}`,           // 11/20
    `${mp}/${dp}`,           // 11/20 (padded)
    `${m}/${day}/${y}`,      // 11/20/2025
  ]
  const roc = y - 1911
  if (roc > 0) {
    tokens.push(
      `${roc}/${m}/${day}`,  // 114/11/20
      `${roc}/${mp}/${dp}`,  // 114/11/20 (padded)
      `${roc}-${mp}-${dp}`,  // 114-11-20
      `${roc}${mp}${dp}`,    // 1141120 (NHI compact)
      `${roc}/${mp}`,        // 114/11
    )
  }
  return tokens
}

export function isValidDate(dateString: string | undefined): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

export function calculateAge(birthDate?: string | null): string {
  if (!birthDate) return "Unknown"
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return "Unknown"

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 ? `${age}` : "Unknown"
}

export type TimeRange = "all" | "24h" | "3d" | "1w" | "1m" | "3m" | "6m" | "1y" | "3y" | "5y"

export function isWithinTimeRange(dateString: string | undefined, range: TimeRange): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  if (range === "all") return true

  const now = new Date()
  const startDate = new Date(now)

  switch (range) {
    case "24h":
      startDate.setDate(now.getDate() - 1)
      break
    case "3d":
      startDate.setDate(now.getDate() - 3)
      break
    case "1w":
      startDate.setDate(now.getDate() - 7)
      break
    case "1m":
      startDate.setMonth(now.getMonth() - 1)
      break
    case "3m":
      startDate.setMonth(now.getMonth() - 3)
      break
    case "6m":
      startDate.setMonth(now.getMonth() - 6)
      break
    case "1y":
      startDate.setFullYear(now.getFullYear() - 1)
      break
    case "3y":
      startDate.setFullYear(now.getFullYear() - 3)
      break
    case "5y":
      startDate.setFullYear(now.getFullYear() - 5)
      break
    default:
      return true
  }

  return date >= startDate
}
