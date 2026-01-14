// Data Grouping Utilities
// Shared utilities for grouping and filtering data by name/type
// Following DRY (Don't Repeat Yourself) principle

/**
 * Generic function to get the latest item by name from a collection
 * @param items - Array of items to filter
 * @param getNameFn - Function to extract name from item
 * @param getDateFn - Function to extract date from item
 * @returns Array of latest items, one per unique name
 */
export function getLatestByName<T>(
  items: T[],
  getNameFn: (item: T) => string,
  getDateFn: (item: T) => string | undefined
): T[] {
  const byName = new Map<string, T>()
  
  // Sort by date descending first
  const sorted = [...items].sort((a, b) => {
    const dateA = getDateFn(a) || ''
    const dateB = getDateFn(b) || ''
    return dateB.localeCompare(dateA)
  })
  
  // Keep only the first (latest) item for each name
  sorted.forEach(item => {
    const name = getNameFn(item)
    if (!byName.has(name)) {
      byName.set(name, item)
    }
  })
  
  return Array.from(byName.values())
}

/**
 * Extract text from CodeableConcept
 * @param code - FHIR CodeableConcept object
 * @param fallback - Fallback text if no text found
 * @returns Extracted text or fallback
 */
export function getCodeableConceptText(
  code?: { text?: string; coding?: Array<{ display?: string }> },
  fallback: string = 'Unknown'
): string {
  return code?.text || code?.coding?.[0]?.display || fallback
}
