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

export type TimeRange = "all" | "24h" | "3d" | "1w" | "1m" | "3m" | "6m" | "1y"

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
    default:
      return true
  }

  return date >= startDate
}
