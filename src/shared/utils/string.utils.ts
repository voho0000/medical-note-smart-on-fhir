// String Utilities

export function truncateText(text: string | undefined, maxLength: number, suffix: string = '...'): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + suffix
}

export function capitalizeFirst(text: string | undefined): string {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatList(items: string[] | undefined, conjunction: string = ','): string {
  if (!items || items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return items.join(` ${conjunction} `)
  
  const lastItem = items[items.length - 1]
  const otherItems = items.slice(0, -1)
  
  if (conjunction === ',') {
    return items.join(', ')
  }
  
  return `${otherItems.join(', ')} ${conjunction} ${lastItem}`
}

export function sanitizeHtml(html: string | undefined): string {
  if (!html) return ''
  
  // Remove script tags and event handlers
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '')
  sanitized = sanitized.replace(/on\w+='[^']*'/gi, '')
  
  return sanitized
}
