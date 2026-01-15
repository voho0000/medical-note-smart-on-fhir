// Date Formatting Utility
export interface DateFormatStrings {
  justNow: string
  minutesAgo: string
  hoursAgo: string
  daysAgo: string
}

export function formatRelativeDate(date: Date, strings: DateFormatStrings): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return strings.justNow
  if (diffMins < 60) return `${diffMins}${strings.minutesAgo}`
  if (diffHours < 24) return `${diffHours}${strings.hoursAgo}`
  if (diffDays < 7) return `${diffDays}${strings.daysAgo}`
  
  return date.toLocaleDateString()
}
