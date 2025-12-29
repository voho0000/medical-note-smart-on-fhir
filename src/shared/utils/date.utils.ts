// Date Utilities
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleDateString()
  } catch {
    return 'Invalid date'
  }
}

export function formatDateTime(dateString: string | undefined): string {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleString()
  } catch {
    return 'Invalid date'
  }
}

export function isValidDate(dateString: string | undefined): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}
