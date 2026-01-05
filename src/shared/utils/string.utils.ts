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
  
  // Comprehensive XSS protection
  let sanitized = html
  
  // Remove script tags (including with attributes)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '')
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '')
  
  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript:/gi, '')
  
  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  
  // Remove object and embed tags
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
  
  // Remove form tags (can be used for phishing)
  sanitized = sanitized.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
  
  // Remove meta refresh (can be used for redirects)
  sanitized = sanitized.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
  
  return sanitized
}
